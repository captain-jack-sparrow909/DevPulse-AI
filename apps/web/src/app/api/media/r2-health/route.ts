import { NextResponse } from "next/server";
import { isR2Configured, uploadScreenshotToR2 } from "@/lib/storage/r2";

/**
 * Quick R2 health check (protected).
 * GET /api/media/r2-health?secret=CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const url = new URL(request.url);
  const okAuth =
    !secret ||
    request.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret;

  if (!okAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "R2 env missing",
        need: [
          "CLOUDFLARE_S3_ENDPOINT",
          "CLOUDFLARE_ACCESS_KEY",
          "CLOUDFLARE_SECRET_KEY",
          "R2_BUCKET",
        ],
      },
      { status: 503 },
    );
  }

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  try {
    const publicPath = await uploadScreenshotToR2(
      `screenshots/health-${Date.now()}.png`,
      png,
    );
    return NextResponse.json({
      ok: true,
      bucket: process.env.R2_BUCKET || "devpulse-screenshots",
      publicPath,
      message: "R2 upload succeeded. Open publicPath (or /api/media/r2/...) to view.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "upload failed",
        bucket: process.env.R2_BUCKET || "devpulse-screenshots",
        endpoint: (process.env.CLOUDFLARE_S3_ENDPOINT || "").replace(/\/\/.*@/, "//"),
      },
      { status: 500 },
    );
  }
}
