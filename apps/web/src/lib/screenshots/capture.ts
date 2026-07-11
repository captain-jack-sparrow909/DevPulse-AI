import { createHash } from "crypto";
import { mkdir, writeFile, access } from "fs/promises";
import path from "path";
import { isR2Configured, uploadScreenshotToR2 } from "@/lib/storage/r2";
import { researchFetch } from "@/lib/integrations/fetch";

export interface ScreenshotResult {
  ok: boolean;
  /** Browser-usable URL: /screenshots/... or /api/media/r2/... or https://... */
  publicPath?: string;
  absolutePath?: string;
  sourceUrl: string;
  error?: string;
  skipped?: boolean;
}

const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");

function safeFilename(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  return `${hash}.png`;
}

async function saveBuffer(
  filename: string,
  buffer: Buffer,
): Promise<{ publicPath: string; absolutePath?: string }> {
  const key = `screenshots/${filename}`;

  // Prefer R2 on Vercel / whenever configured (durable across deploys)
  if (isR2Configured()) {
    const publicPath = await uploadScreenshotToR2(key, buffer, "image/png");
    return { publicPath };
  }

  // Local filesystem (dev only — not durable on Vercel)
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const absolutePath = path.join(SCREENSHOT_DIR, filename);
  await writeFile(absolutePath, buffer);
  return { publicPath: `/screenshots/${filename}`, absolutePath };
}

/**
 * Capture screenshot without local Chromium (works on Vercel).
 * Uses thum.io free image service, then we re-host on R2/local.
 */
async function captureViaThumio(url: string): Promise<Buffer | null> {
  try {
    // width/crop keeps payload modest for free tier
    const shotUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${url}`;
    const res = await researchFetch(shotUrl, {
      timeoutMs: 25_000,
      headers: { "User-Agent": "DevPulse-AI/1.0" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Basic sanity: PNG/JPEG magic
    if (buf.length < 1000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function captureViaMicrolink(url: string): Promise<Buffer | null> {
  try {
    const api = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
    const res = await researchFetch(api, { timeoutMs: 25_000 });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      data?: { screenshot?: { url?: string } };
    };
    const shotUrl = json.data?.screenshot?.url;
    if (!shotUrl) return null;
    const img = await researchFetch(shotUrl, { timeoutMs: 20_000 });
    if (!img.ok) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 1000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function captureViaPlaywright(
  url: string,
  options?: { fullPage?: boolean; timeoutMs?: number },
): Promise<Buffer | null> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 DevPulseAI/1.0",
      });
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: options?.timeoutMs ?? 25_000,
      });
      await new Promise((r) => setTimeout(r, 1200));
      await page
        .evaluate(() => {
          const selectors = [
            '[id*="cookie"]',
            '[class*="cookie"]',
            '[aria-label*="cookie" i]',
            "#onetrust-banner-sdk",
          ];
          for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
              (el as HTMLElement).style.display = "none";
            });
          }
        })
        .catch(() => undefined);
      const buffer = await page.screenshot({
        type: "png",
        fullPage: options?.fullPage ?? false,
      });
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

/**
 * Capture a page screenshot and store it durably.
 * - Local: Playwright → public/screenshots (or R2 if configured)
 * - Vercel: thum.io / microlink → R2 (required for durable images)
 *
 * Writing to public/ on Vercel does NOT work (ephemeral + not in deploy artifact).
 */
export async function capturePageScreenshot(
  url: string,
  options?: { filename?: string; fullPage?: boolean; timeoutMs?: number },
): Promise<ScreenshotResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, sourceUrl: url, error: "Invalid URL", skipped: true };
  }

  if (/reddit\.com\/.*\.json/i.test(url) || url.includes("firebaseio.com")) {
    return {
      ok: false,
      sourceUrl: url,
      error: "URL not suitable for screenshot",
      skipped: true,
    };
  }

  if (process.env.DISABLE_SCREENSHOTS === "1") {
    return { ok: false, sourceUrl: url, error: "Screenshots disabled", skipped: true };
  }

  const filename = options?.filename || safeFilename(url);
  const onVercel = process.env.VERCEL === "1";

  // Local reuse of existing file
  if (!onVercel && !isR2Configured()) {
    const absolutePath = path.join(SCREENSHOT_DIR, filename);
    try {
      await access(absolutePath);
      return {
        ok: true,
        publicPath: `/screenshots/${filename}`,
        absolutePath,
        sourceUrl: url,
      };
    } catch {
      // capture new
    }
  }

  let buffer: Buffer | null = null;
  let method = "";

  if (!onVercel) {
    buffer = await captureViaPlaywright(url, options);
    if (buffer) method = "playwright";
  }

  if (!buffer) {
    buffer = await captureViaThumio(url);
    if (buffer) method = "thum.io";
  }

  if (!buffer) {
    buffer = await captureViaMicrolink(url);
    if (buffer) method = "microlink";
  }

  if (!buffer) {
    return {
      ok: false,
      sourceUrl: url,
      error: onVercel
        ? "Screenshot capture failed on Vercel (and no usable image service response). Configure R2 for storage."
        : "Screenshot capture failed",
      skipped: true,
    };
  }

  // On Vercel without R2, local public/ write is useless — warn clearly
  if (onVercel && !isR2Configured()) {
    return {
      ok: false,
      sourceUrl: url,
      error:
        "Screenshot captured but R2 is not configured. Set CLOUDFLARE_S3_ENDPOINT, CLOUDFLARE_ACCESS_KEY, CLOUDFLARE_SECRET_KEY, and R2_BUCKET so images persist on Vercel.",
      skipped: true,
    };
  }

  try {
    const saved = await saveBuffer(filename, buffer);
    console.log(
      `[screenshot] ok via ${method}, ${buffer.byteLength} bytes → ${saved.publicPath}`,
    );
    return {
      ok: true,
      publicPath: saved.publicPath,
      absolutePath: saved.absolutePath,
      sourceUrl: url,
      error: undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to store screenshot";
    console.error(`[screenshot] store failed (${method}):`, message);
    return { ok: false, sourceUrl: url, error: message };
  }
}

export function shouldIncludeImage(params: {
  platform: string;
  angle: string;
  provider: string;
  title: string;
  url: string;
}): { needsImage: boolean; reason: string } {
  if (!params.url || !/^https?:\/\//i.test(params.url)) {
    return { needsImage: false, reason: "No capturable URL on source" };
  }
  return {
    needsImage: true,
    reason: `Screenshot of chosen ${params.provider} source for slot post`,
  };
}
