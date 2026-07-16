import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePerformanceCsv } from "@/lib/analytics/performance-csv";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { csv?: unknown };
  if (typeof body.csv !== "string") {
    return NextResponse.json({ error: "CSV text is required" }, { status: 400 });
  }
  const parsed = parsePerformanceCsv(body.csv);
  if (parsed.errors.length) {
    return NextResponse.json({ error: parsed.errors.join("; "), errors: parsed.errors }, { status: 400 });
  }
  if (!parsed.records.length) {
    return NextResponse.json({ error: "CSV contains no data rows" }, { status: 400 });
  }
  const postIds = [...new Set(parsed.records.map((record) => record.postId))];
  const owned = await prisma.post.findMany({
    where: { userId: session.user.id, id: { in: postIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((post) => post.id));
  const unknown = postIds.filter((postId) => !ownedIds.has(postId));
  if (unknown.length) {
    return NextResponse.json(
      { error: `Unknown or inaccessible post IDs: ${unknown.slice(0, 5).join(", ")}` },
      { status: 400 },
    );
  }
  const result = await prisma.socialPerformanceSnapshot.createMany({
    data: parsed.records.map((record) => ({
      ...record,
      userId: session.user.id,
    })),
  });
  return NextResponse.json({ imported: result.count }, { status: 201 });
}

