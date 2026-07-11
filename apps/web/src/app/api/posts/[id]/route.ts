import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contentHash } from "@/lib/hash";
import { assertManualOnly } from "@/lib/publish/adapters";
import { capturePageScreenshot, shouldIncludeImage } from "@/lib/screenshots/capture";
import { enforceXLimit, parseThreadJson } from "@/lib/content/platforms";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: user.id },
    include: {
      schedule: true,
      topic: true,
      readinessJobs: true,
      sources: { include: { source: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: user.id },
    include: { sources: { include: { source: true } } },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as {
    action?:
      | "approve"
      | "reject"
      | "mark_ready"
      | "mark_posted"
      | "save"
      | "recapture_image"
      | "clear_image";
    content?: string;
    contentLinkedIn?: string;
    threadJson?: string;
    status?: string;
    rejectionReason?: string;
  };

  if (body.action === "save") {
    const linkedIn = (body.contentLinkedIn ?? body.content ?? post.content).trim();
    let threadJson = body.threadJson ?? post.threadJson;
    if (body.threadJson !== undefined) {
      const parts = enforceXLimit(parseThreadJson(body.threadJson));
      // Also accept raw JSON array string that failed parseThread if needed
      try {
        const raw = JSON.parse(body.threadJson) as unknown;
        if (Array.isArray(raw)) {
          threadJson = JSON.stringify(enforceXLimit(raw.map(String)));
        } else {
          threadJson = JSON.stringify(parts);
        }
      } catch {
        threadJson = JSON.stringify(parts.length ? parts : enforceXLimit([linkedIn]));
      }
    }
    const updated = await prisma.post.update({
      where: { id },
      data: {
        content: linkedIn,
        contentLinkedIn: linkedIn,
        threadJson,
        contentHash: contentHash(`${linkedIn}\n---\n${threadJson || ""}`),
        platform: "both",
        format: (parseThreadJson(threadJson).length > 1 ? "dual-thread" : "dual") as string,
        status: body.status || post.status,
      },
    });
    return NextResponse.json(updated);
  }

  if (body.action === "approve") {
    await prisma.readinessJob.updateMany({
      where: { postId: id, status: "awaiting_approval" },
      data: { status: "approved", approvedAt: new Date() },
    });
    await prisma.schedule.updateMany({
      where: { postId: id },
      data: { status: "ready" },
    });
    const hasSchedule = await prisma.schedule.findUnique({ where: { postId: id } });
    const now = new Date();
    // If slot time already passed or is now, mark ready immediately; else scheduled
    let nextStatus = "approved";
    if (hasSchedule) {
      nextStatus = hasSchedule.scheduledFor <= now ? "ready" : "scheduled";
      if (nextStatus === "ready") {
        await prisma.readinessJob.updateMany({
          where: { postId: id },
          data: { status: "ready", readyAt: now },
        });
      }
    }
    const updated = await prisma.post.update({
      where: { id },
      data: { status: nextStatus },
      include: { schedule: true, readinessJobs: true },
    });
    return NextResponse.json(updated);
  }

  if (body.action === "reject") {
    await prisma.readinessJob.updateMany({
      where: { postId: id },
      data: { status: "cancelled" },
    });
    await prisma.schedule.updateMany({
      where: { postId: id },
      data: { status: "cancelled" },
    });
    const updated = await prisma.post.update({
      where: { id },
      data: {
        status: "rejected",
        rejectionReason: body.rejectionReason || "Rejected by user",
      },
    });
    return NextResponse.json(updated);
  }

  /** Flip scheduled → ready when the calendar slot arrives (or force ready). */
  if (body.action === "mark_ready") {
    if (!["approved", "scheduled", "pending_review"].includes(post.status)) {
      return NextResponse.json(
        { error: "Post cannot be marked ready from current status" },
        { status: 400 },
      );
    }
    await prisma.readinessJob.updateMany({
      where: { postId: id },
      data: { status: "ready", readyAt: new Date(), approvedAt: new Date() },
    });
    await prisma.schedule.updateMany({
      where: { postId: id },
      data: { status: "ready" },
    });
    const updated = await prisma.post.update({
      where: { id },
      data: { status: "ready" },
    });
    return NextResponse.json(updated);
  }

  /**
   * You posted manually on X/LinkedIn — record that here.
   * DevPulse never calls social publish APIs.
   */
  if (body.action === "mark_posted") {
    if (!["ready", "scheduled", "approved"].includes(post.status)) {
      return NextResponse.json(
        { error: "Approve/ready the post first, then mark as posted after you publish manually" },
        { status: 400 },
      );
    }
    const policy = assertManualOnly();
    await prisma.readinessJob.updateMany({
      where: { postId: id },
      data: { status: "posted_manually", postedAt: new Date() },
    });
    await prisma.schedule.updateMany({
      where: { postId: id },
      data: { status: "posted_manually" },
    });
    const updated = await prisma.post.update({
      where: { id },
      data: {
        status: "posted_manually",
        postedManuallyAt: new Date(),
      },
    });
    return NextResponse.json({ post: updated, policy });
  }

  if (body.action === "recapture_image") {
    try {
      const sourceUrl =
        post.imageSourceUrl ||
        post.sources[0]?.source.url ||
        null;
      if (!sourceUrl) {
        return NextResponse.json({ error: "No source URL to capture" }, { status: 400 });
      }
      const shot = await capturePageScreenshot(sourceUrl, {
        filename: `${id}-${Date.now()}.png`,
      });
      if (!shot.ok || !shot.publicPath) {
        return NextResponse.json(
          {
            error: shot.error || "Screenshot failed",
            hint:
              "On Vercel, ensure R2_BUCKET exists and CLOUDFLARE_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY are set. Bucket name must match R2_BUCKET (default: devpulse-screenshots).",
          },
          { status: 500 },
        );
      }
      const updated = await prisma.post.update({
        where: { id },
        data: {
          needsImage: true,
          imagePath: shot.publicPath,
          imageSourceUrl: sourceUrl,
          imageCaption: `Screenshot of: ${(post.title || sourceUrl).slice(0, 120)}`,
          imageSkipReason: null,
        },
      });
      return NextResponse.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recapture failed";
      console.error("[recapture_image]", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.action === "clear_image") {
    const decision = shouldIncludeImage({
      platform: post.platform,
      angle: post.angle || "",
      provider: post.sources[0]?.source.provider || "rss",
      title: post.title || "",
      url: post.imageSourceUrl || "",
    });
    const updated = await prisma.post.update({
      where: { id },
      data: {
        needsImage: false,
        imagePath: null,
        imageCaption: null,
        imageSkipReason: decision.reason || "Cleared by user",
      },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.post.findFirst({ where: { id, userId: user.id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
