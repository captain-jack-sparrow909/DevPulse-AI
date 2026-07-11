import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

function bucket(): string {
  return (
    process.env.R2_BUCKET?.trim() ||
    process.env.CLOUDFLARE_R2_BUCKET?.trim() ||
    "devpulse-screenshots"
  );
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_S3_ENDPOINT?.trim() &&
      process.env.CLOUDFLARE_ACCESS_KEY?.trim() &&
      process.env.CLOUDFLARE_SECRET_KEY?.trim(),
  );
}

function client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env.CLOUDFLARE_S3_ENDPOINT!.trim(),
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY!.trim(),
      secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY!.trim(),
    },
    forcePathStyle: true,
  });
}

/**
 * Upload PNG/JPEG bytes to R2.
 * Returns a durable URL the UI can use:
 * - Public base if R2_PUBLIC_URL is set
 * - Otherwise app proxy path /api/media/r2/<key>
 */
export async function uploadScreenshotToR2(
  key: string,
  body: Buffer,
  contentType = "image/png",
): Promise<string> {
  const c = client();
  await c.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=86400",
    }),
  );

  const publicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (publicBase) {
    return `${publicBase}/${key}`;
  }
  // Private bucket: serve through our API (works without public R2 access)
  return `/api/media/r2/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getR2Object(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const c = client();
    const out = await c.send(
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
      }),
    );
    if (!out.Body) return null;
    const bytes = await out.Body.transformToByteArray();
    return {
      body: bytes,
      contentType: out.ContentType || "image/png",
    };
  } catch {
    return null;
  }
}

/** Delete R2 objects under prefix older than maxAgeMs (by LastModified). */
export async function deleteOldR2Screenshots(maxAgeMs: number): Promise<number> {
  if (!isR2Configured()) return 0;
  const c = client();
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  let token: string | undefined;

  do {
    const page = await c.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: "screenshots/",
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents || []) {
      if (!obj.Key || !obj.LastModified) continue;
      if (obj.LastModified.getTime() < cutoff) {
        await c.send(new DeleteObjectCommand({ Bucket: bucket(), Key: obj.Key }));
        deleted++;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return deleted;
}
