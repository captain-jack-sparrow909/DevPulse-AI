import { createHash } from "crypto";
import { mkdir, writeFile, access } from "fs/promises";
import path from "path";

export interface ScreenshotResult {
  ok: boolean;
  publicPath?: string; // e.g. /screenshots/abc.png
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

/**
 * Capture a viewport screenshot of a URL with Playwright (Chromium).
 * Images are stored under public/screenshots and served as static files.
 * Never used for posting — only for packaging content the user posts manually.
 */
export async function capturePageScreenshot(
  url: string,
  options?: { filename?: string; fullPage?: boolean; timeoutMs?: number },
): Promise<ScreenshotResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, sourceUrl: url, error: "Invalid URL", skipped: true };
  }

  // Skip known non-visual or blocked targets
  if (/reddit\.com\/.*\.json/i.test(url) || url.includes("firebaseio.com")) {
    return {
      ok: false,
      sourceUrl: url,
      error: "URL not suitable for screenshot",
      skipped: true,
    };
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const filename = options?.filename || safeFilename(url);
  const absolutePath = path.join(SCREENSHOT_DIR, filename);
  const publicPath = `/screenshots/${filename}`;

  try {
    await access(absolutePath);
    // Reuse existing capture for same URL hash
    return { ok: true, publicPath, absolutePath, sourceUrl: url };
  } catch {
    // need to capture
  }

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

      // Let late layout settle briefly
      await new Promise((r) => setTimeout(r, 1200));

      // Hide common cookie banners if present (best-effort)
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

      await writeFile(absolutePath, buffer);
      return { ok: true, publicPath, absolutePath, sourceUrl: url };
    } finally {
      await browser.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screenshot failed";
    return { ok: false, sourceUrl: url, error: message };
  }
}

/**
 * Decide whether a post should include a screenshot to lift engagement.
 * Text-only tips/hot takes often do better without; repos, papers, demos need visuals.
 */
export function shouldIncludeImage(params: {
  platform: string;
  angle: string;
  provider: string;
  title: string;
  url: string;
}): { needsImage: boolean; reason: string } {
  const angle = params.angle.toLowerCase();
  const provider = params.provider.toLowerCase();
  const title = params.title.toLowerCase();

  const textOnlyAngles = ["hot take", "quick tip", "lessons learned", "career"];
  if (textOnlyAngles.some((a) => angle.includes(a))) {
    // LinkedIn long-form tips can still benefit from a soft visual sometimes
    if (params.platform === "linkedin" && (provider === "github" || provider === "arxiv")) {
      return {
        needsImage: true,
        reason: "LinkedIn + visual source (repo/paper) — screenshot helps scroll-stop",
      };
    }
    return {
      needsImage: false,
      reason: "Text-first angle; image optional and usually skipped",
    };
  }

  const visualProviders = ["github", "arxiv"];
  if (visualProviders.includes(provider)) {
    return {
      needsImage: true,
      reason: `${provider} pages are visual — screenshot increases CTR`,
    };
  }

  const visualAngles = [
    "repo spotlight",
    "paper insight",
    "architecture",
    "tutorial",
    "comparison",
    "thread",
  ];
  if (visualAngles.some((a) => angle.includes(a))) {
    return { needsImage: true, reason: `Angle "${params.angle}" benefits from a visual` };
  }

  if (
    title.includes("show hn") ||
    title.includes("launch") ||
    title.includes("demo") ||
    title.includes("release")
  ) {
    return { needsImage: true, reason: "Launch/demo content performs better with a screenshot" };
  }

  // Default: include for LinkedIn, skip for short X tips unless visual source
  if (params.platform === "linkedin") {
    return {
      needsImage: true,
      reason: "LinkedIn feed favors posts with media",
    };
  }

  return {
    needsImage: false,
    reason: "Short X post without strong visual source — text-only",
  };
}
