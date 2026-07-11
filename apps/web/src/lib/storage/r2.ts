import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

// AWS SDK v3 default flexible checksums break Cloudflare R2 PutObject
if (!process.env.AWS_REQUEST_CHECKSUM_CALCULATION) {
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION = "WHEN_REQUIRED";
}
if (!process.env.AWS_RESPONSE_CHECKSUM_VALIDATION) {
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION = "WHEN_REQUIRED";
}

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

function normalizeEndpoint(raw: string): string {
  let ep = raw.trim().replace(/\/$/, "");
  const b = bucket();
  if (ep.endsWith(`/${b}`)) {
    ep = ep.slice(0, -(b.length + 1));
  }
  if (!/^https?:\/\//i.test(ep)) {
    ep = `https://${ep}`;
  }
  return ep;
}

function awsErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as {
    name?: string;
    message?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
    cause?: unknown;
  };
  const code = e.Code || e.name || "R2Error";
  const status = e.$metadata?.httpStatusCode;
  let msg = e.message || "request failed";
  if (e.cause instanceof Error) msg += ` | cause: ${e.cause.message}`;
  return status ? `${code} (HTTP ${status}): ${msg}` : `${code}: ${msg}`;
}

/**
 * Cloudflare R2 client.
 *
 * Important:
 * - Use R2 **S3 API** tokens (R2 → Manage R2 API Tokens), not a global CF API token.
 * - AWS SDK v3 default checksums break R2 → force WHEN_REQUIRED.
 */
function client(): S3Client {
  const endpoint = normalizeEndpoint(process.env.CLOUDFLARE_S3_ENDPOINT || "");
  const config: S3ClientConfig = {
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY!.trim(),
      secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY!.trim(),
    },
    forcePathStyle: true,
  };

  // SDK v3.729+ checksum defaults break R2 PutObject
  const withChecksum = {
    ...config,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };

  return new S3Client(withChecksum);
}

export async function uploadScreenshotToR2(
  key: string,
  body: Buffer,
  contentType = "image/png",
): Promise<string> {
  const c = client();
  const bytes = new Uint8Array(body);

  try {
    await c.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.byteLength,
      }),
    );
  } catch (err) {
    throw new Error(
      `R2 upload failed (bucket="${bucket()}", key="${key}", endpoint="${normalizeEndpoint(process.env.CLOUDFLARE_S3_ENDPOINT || "")}"): ${awsErrorMessage(err)}. ` +
        `Create bucket "${bucket()}" in Cloudflare R2 and use R2 S3 API access keys (not the global API token).`,
    );
  }

  const publicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (publicBase) {
    return `${publicBase}/${key}`;
  }
  return `/api/media/r2/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getR2Object(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
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
  } catch (err) {
    console.error("[r2] get failed", key, awsErrorMessage(err));
    return null;
  }
}

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
