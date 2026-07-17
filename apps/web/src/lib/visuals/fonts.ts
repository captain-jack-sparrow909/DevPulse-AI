import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FONT_FAMILY = "Geist";

let setupPromise: Promise<void> | null = null;

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function bundledFontPath(): string {
  // Resolve the package directory, not the .ttf as a module. Turbopack does
  // not need (or know how) to compile font files used directly by fontconfig.
  return join(
    dirname(require.resolve("next/package.json")),
    "dist",
    "compiled",
    "@vercel",
    "og",
    "Geist-Regular.ttf",
  );
}

/**
 * Sharp renders SVG text through Pango/fontconfig. Serverless Linux runtimes do
 * not guarantee that Arial, Inter, or any other UI font is installed, so text
 * can silently become missing-glyph boxes. Point fontconfig at the Geist font
 * already shipped with Next.js before Sharp/libvips is loaded.
 */
export async function ensureVisualFonts(): Promise<void> {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const fontDirectory = dirname(bundledFontPath());
    const runtimeDirectory = join(tmpdir(), "devpulse-visual-fonts");
    const cacheDirectory = join(runtimeDirectory, "cache");
    const configPath = join(runtimeDirectory, "fonts.conf");

    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(
      configPath,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${xml(fontDirectory)}</dir>
  <cachedir>${xml(cacheDirectory)}</cachedir>
  <config><rescan><int>0</int></rescan></config>
</fontconfig>`,
      "utf8",
    );

    process.env.FONTCONFIG_FILE = configPath;
    process.env.FONTCONFIG_PATH = runtimeDirectory;
    process.env.XDG_CACHE_HOME = runtimeDirectory;
  })().catch((error) => {
    setupPromise = null;
    throw error;
  });

  return setupPromise;
}

export const VISUAL_FONT_FAMILY = FONT_FAMILY;
