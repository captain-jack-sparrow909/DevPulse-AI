import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteVisualFile } from "@/lib/visuals/storage";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, assetId } = await params;
  const asset = await prisma.postVisualAsset.findFirst({
    where: { id: assetId, postId: id, userId: session.user.id },
  });
  if (!asset) return NextResponse.json({ error: "Visual not found" }, { status: 404 });
  await Promise.all([
    deleteVisualFile(asset.storageKey, asset.filePath),
    asset.previewStorageKey !== asset.storageKey
      ? deleteVisualFile(asset.previewStorageKey, asset.previewPath)
      : Promise.resolve(),
  ]);
  await prisma.postVisualAsset.delete({ where: { id: asset.id } });
  const remaining = await prisma.postVisualAsset.findMany({
    where: { postId: id, status: "completed" },
    select: { kind: true, targetPlatform: true },
  });
  const mediaTypeX = remaining.some(
    (item) =>
      item.kind === "portrait_card" &&
      (item.targetPlatform === "x" || item.targetPlatform === "both"),
  )
    ? "branded_visual"
    : "text_only";
  const mediaTypeLinkedIn = remaining.some((item) => item.kind === "linkedin_carousel")
    ? "carousel"
    : remaining.some(
          (item) =>
            item.kind === "portrait_card" &&
            (item.targetPlatform === "linkedin" || item.targetPlatform === "both"),
        )
      ? "branded_visual"
      : "text_only";
  const mediaType = mediaTypeX === mediaTypeLinkedIn ? mediaTypeX : "mixed";
  await prisma.post.updateMany({
    where: { id, userId: session.user.id },
    data: { mediaType, mediaTypeX, mediaTypeLinkedIn },
  });
  return NextResponse.json({ ok: true, mediaType });
}
