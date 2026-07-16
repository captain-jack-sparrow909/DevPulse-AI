import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBrandSettings, toBrandConfig } from "@/lib/visuals/brand";
import { buildVisualBrief, validateVisualBrief } from "@/lib/visuals/brief";
import { renderVisualAsset } from "@/lib/visuals/render";
import { saveVisualFile } from "@/lib/visuals/storage";
import type { VisualAssetKind } from "@/lib/visuals/types";
import { parseVariantConfig } from "@/lib/experiments/definitions";

export const maxDuration = 60;

function kind(value: unknown): VisualAssetKind | null {
  return value === "portrait_card" || value === "linkedin_carousel" ? value : null;
}

function targetPlatform(value: unknown): "both" | "x" | "linkedin" {
  return value === "x" || value === "linkedin" ? value : "both";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: session.user.id },
    include: {
      sources: { include: { source: true } },
      experimentVariant: { include: { experiment: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const assetKind = kind(body.kind);
  if (!assetKind) return NextResponse.json({ error: "Unsupported visual kind" }, { status: 400 });

  const target = assetKind === "linkedin_carousel" ? "linkedin" : targetPlatform(body.targetPlatform);
  const experimentConfig = parseVariantConfig(post.experimentVariant?.configJson);
  const experimentPlatform = post.experimentVariant?.experiment.platform === "linkedin" ? "linkedin" : "x";
  const overlapsExperiment = target === "both" || target === experimentPlatform;
  if (overlapsExperiment && experimentConfig.mediaType === "text_only") {
    return NextResponse.json(
      { error: "This post is assigned to the text-only experiment variant. Generate a visual on a branded-visual post instead." },
      { status: 409 },
    );
  }
  if (
    overlapsExperiment &&
    experimentConfig.mediaType === "branded_visual" &&
    assetKind !== "portrait_card"
  ) {
    return NextResponse.json(
      { error: "This experiment requires a branded portrait card so the media treatment stays consistent." },
      { status: 409 },
    );
  }

  const defaultBrief = buildVisualBrief(post);
  const brief = {
    ...defaultBrief,
    title: typeof body.title === "string" ? body.title.trim() : defaultBrief.title,
    subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() : defaultBrief.subtitle,
    bullets: Array.isArray(body.bullets)
      ? body.bullets.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
      : defaultBrief.bullets,
    takeaway: typeof body.takeaway === "string" ? body.takeaway.trim() : defaultBrief.takeaway,
    altText: typeof body.altText === "string" ? body.altText.trim().slice(0, 500) : defaultBrief.altText,
  };
  const errors = validateVisualBrief(brief);
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });

  const brand = await getBrandSettings(session.user.id, session.user.name || "Builder");
  const asset = await prisma.postVisualAsset.create({
    data: {
      userId: session.user.id,
      postId: post.id,
      kind: assetKind,
      targetPlatform: target,
      briefJson: JSON.stringify(brief),
      altText: brief.altText,
    },
  });

  try {
    const rendered = await renderVisualAsset(assetKind, brief, toBrandConfig(brand));
    const baseKey = `visuals/${session.user.id}/${post.id}/${asset.id}`;
    const extension = rendered.mimeType === "application/pdf" ? "pdf" : "png";
    const file = await saveVisualFile(`${baseKey}.${extension}`, rendered.file, rendered.mimeType);
    const preview = rendered.mimeType === "image/png"
      ? file
      : await saveVisualFile(`${baseKey}-preview.png`, rendered.preview, "image/png");
    const completed = await prisma.$transaction(async (tx) => {
      const updated = await tx.postVisualAsset.update({
        where: { id: asset.id },
        data: {
          status: "completed",
          filePath: file.publicPath,
          storageKey: file.storageKey,
          previewPath: preview.publicPath,
          previewStorageKey: preview.storageKey,
          mimeType: rendered.mimeType,
          width: rendered.width,
          height: rendered.height,
          pageCount: rendered.pageCount,
        },
      });
      const mediaTypeX = target === "x" || target === "both" ? "branded_visual" : post.mediaTypeX;
      const mediaTypeLinkedIn = target === "linkedin" || target === "both"
        ? assetKind === "linkedin_carousel" ? "carousel" : "branded_visual"
        : post.mediaTypeLinkedIn;
      await tx.post.update({
        where: { id: post.id },
        data: {
          mediaTypeX,
          mediaTypeLinkedIn,
          mediaType: mediaTypeX === mediaTypeLinkedIn ? mediaTypeX : "mixed",
        },
      });
      return updated;
    });
    return NextResponse.json({ asset: completed }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual rendering failed";
    await prisma.postVisualAsset.update({
      where: { id: asset.id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
