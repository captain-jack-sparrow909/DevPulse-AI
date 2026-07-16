import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchXResearch } from "@/lib/integrations/x-research";
import { getContentStrategy } from "@/lib/content/strategy-store";
import { isProductRelevantSource } from "@/lib/research/source-policy";
import { rankOpportunity } from "@/lib/distribution/ranking";

export const maxDuration = 30;

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const strategy = await getContentStrategy(session.user.id);
  const fetched = await fetchXResearch(20);
  const relevant = fetched
    .filter((source) => isProductRelevantSource(source, strategy))
    .slice(0, 10);
  let stored = 0;
  for (let index = 0; index < relevant.length; index += 4) {
    const batch = relevant.slice(index, index + 4);
    await Promise.all(batch.map((source) => {
      const raw = source.raw && typeof source.raw === "object"
        ? source.raw as { author?: { username?: string; name?: string } }
        : null;
      const author = raw?.author?.username || raw?.author?.name || null;
      const rank = rankOpportunity({
        context: source.summary || source.title,
        topic: source.title,
        author,
        discoveredAt: new Date(),
        status: "new",
      });
      return prisma.engagementOpportunity.upsert({
      where: {
        userId_platform_url: {
          userId: session.user.id,
          platform: "x",
          url: source.url,
        },
      },
      create: {
        userId: session.user.id,
        platform: "x",
        url: source.url,
        externalId: source.externalId,
        author,
        topic: source.title.slice(0, 160),
        context: (source.summary || source.title).slice(0, 3000),
        source: "x_search",
        priorityScore: rank.score,
        priorityReason: rank.reason,
      },
      update: {
        topic: source.title.slice(0, 160),
        author,
        context: (source.summary || source.title).slice(0, 3000),
        priorityScore: rank.score,
        priorityReason: rank.reason,
      },
    });
    }));
    stored += batch.length;
  }
  return NextResponse.json({ fetched: fetched.length, relevant: relevant.length, stored });
}
