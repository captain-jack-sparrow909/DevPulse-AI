import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePerformanceCsv } from "@/lib/analytics/performance-csv";
import { contentHash } from "@/lib/hash";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { csv?: unknown; format?: unknown; fileName?: unknown };
  if (typeof body.csv !== "string") {
    return NextResponse.json({ error: "CSV text is required" }, { status: 400 });
  }
  const format = body.format === "x" ? "x" : body.format === "linkedin" ? "linkedin" : "devpulse";
  const parsed = parsePerformanceCsv(body.csv, format === "devpulse" ? undefined : format);
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
  const checksum = contentHash(`${format}\n${body.csv}`);
  const previous = await prisma.performanceImportRun.findUnique({
    where: { userId_checksum: { userId: session.user.id, checksum } },
  });
  if (previous) {
    return NextResponse.json({
      imported: 0,
      duplicates: parsed.records.length,
      importRunId: previous.id,
      message: "This exact file was already imported.",
    });
  }
  const source = format === "x" ? "x_csv" : format === "linkedin" ? "linkedin_csv" : "devpulse_csv";
  const rows = parsed.records.map((record) => ({
    ...record,
    userId: session.user.id,
    source,
    importKey: contentHash([
      record.postId,
      record.platform,
      record.checkpoint,
      record.capturedAt.toISOString(),
      record.impressions,
      record.likes,
      record.replies,
      record.reposts,
      record.saves,
      record.profileVisits,
      record.linkClicks,
      record.followersBefore,
      record.followersAfter,
    ].join("|")),
  }));
  const existingKeys = new Set((await prisma.socialPerformanceSnapshot.findMany({
    where: { userId: session.user.id, importKey: { in: rows.map((row) => row.importKey) } },
    select: { importKey: true },
  })).flatMap((row) => row.importKey ? [row.importKey] : []));
  const uniqueRows = [...new Map(rows.map((row) => [row.importKey, row])).values()]
    .filter((row) => !existingKeys.has(row.importKey));
  const duplicateCount = rows.length - uniqueRows.length;
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.socialPerformanceSnapshot.createMany({ data: uniqueRows });
    const run = await tx.performanceImportRun.create({
      data: {
        userId: session.user.id,
        format,
        fileName: typeof body.fileName === "string" ? body.fileName.trim().slice(0, 200) || null : null,
        checksum,
        rowCount: rows.length,
        importedCount: created.count,
        duplicateCount,
      },
    });
    return { created: created.count, runId: run.id };
  });
  return NextResponse.json({ imported: result.created, duplicates: duplicateCount, importRunId: result.runId }, { status: 201 });
}
