import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const platform = body.platform === "linkedin" ? "linkedin" : body.platform === "x" ? "x" : null;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!platform || !/^https?:\/\//i.test(url) || context.length < 10) {
    return NextResponse.json(
      { error: "Platform, a valid URL, and at least 10 characters of context are required" },
      { status: 400 },
    );
  }
  const opportunity = await prisma.engagementOpportunity.upsert({
    where: { userId_platform_url: { userId: user.id, platform, url } },
    create: {
      userId: user.id,
      platform,
      url,
      author: typeof body.author === "string" ? body.author.trim().slice(0, 120) || null : null,
      topic: typeof body.topic === "string" ? body.topic.trim().slice(0, 160) || null : null,
      context: context.slice(0, 3000),
      suggestedReply:
        typeof body.suggestedReply === "string"
          ? body.suggestedReply.trim().slice(0, 1500) || null
          : null,
      source: "manual",
    },
    update: {
      author: typeof body.author === "string" ? body.author.trim().slice(0, 120) || null : undefined,
      topic: typeof body.topic === "string" ? body.topic.trim().slice(0, 160) || null : undefined,
      context: context.slice(0, 3000),
      suggestedReply:
        typeof body.suggestedReply === "string"
          ? body.suggestedReply.trim().slice(0, 1500) || null
          : undefined,
      status: "new",
    },
  });
  return NextResponse.json({ opportunity }, { status: 201 });
}

