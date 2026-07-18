import assert from "node:assert/strict";
import test from "node:test";
import { buildVisualBrief, validateVisualBrief } from "@/lib/visuals/brief";
import { renderVisualAsset } from "@/lib/visuals/render";
import {
  calculateVisualLayout,
  renderVisualSvg,
  wrapVisualText,
} from "@/lib/visuals/svg";
import type { BrandConfig } from "@/lib/visuals/types";
import { bundledVisualFontPath, VISUAL_FONT_FAMILY } from "@/lib/visuals/fonts";

const brand: BrandConfig = {
  displayName: "Jabir Khan",
  handle: "@codeCaptain404",
  tagline: "Building AI developer tools in public",
  accentColor: "#22d3ee",
  backgroundColor: "#07111f",
  textColor: "#f8fafc",
  footerText: "Local AI · LLM Systems · Product Engineering",
};

const brief = buildVisualBrief({
  title: "Local completion without a REST server",
  hook: "Your local AI code completion does not need a REST server.",
  contentType: "architecture_breakdown",
  content:
    "IntelliTab uses length-prefixed JSON over stdin/stdout between TypeScript and a persistent Python MLX process.\n\nThe completion path avoids an HTTP server boundary.",
  sources: [
    {
      source: {
        provider: "project",
        externalId: "owned:intellitab:ipc",
        title: "IntelliTab: native IPC",
        summary:
          "IntelliTab communicates through length-prefixed JSON over stdin/stdout. The extension keeps a persistent Python MLX process.",
      },
    },
  ],
});

test("visual brief uses the selected post and source facts", () => {
  assert.match(brief.title, /local AI code completion/i);
  assert.ok(brief.bullets.some((item) => /length-prefixed JSON/i.test(item)));
  assert.deepEqual(validateVisualBrief(brief), []);
});

test("visual audit rejects unsupported numeric claims", () => {
  const errors = validateVisualBrief({
    ...brief,
    subtitle: `${brief.subtitle} It is 99% faster.`,
  });
  assert.match(errors.join(" "), /Unsupported numeric claims: 99%/);
});

test("SVG renderer escapes user-controlled text", () => {
  const svg = renderVisualSvg({
    brief: { ...brief, title: "IPC < HTTP & ports" },
    brand,
  });
  assert.match(svg, /IPC &lt; HTTP &amp; ports/);
  assert.doesNotMatch(svg, /IPC < HTTP & ports/);
});

test("SVG renderer uses the bundled production font instead of host fallbacks", () => {
  const svg = renderVisualSvg({ brief, brand });
  assert.match(svg, new RegExp(`font-family="${VISUAL_FONT_FAMILY}"`));
  assert.doesNotMatch(svg, /font-family="(?:Inter|Arial|ui-monospace)/);
});

test("serverless font path stays a filesystem string after bundling", () => {
  const fontPath = bundledVisualFontPath("/var/task");
  assert.equal(typeof fontPath, "string");
  assert.equal(
    fontPath,
    "/var/task/node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
  );
});

test("long PNG titles reserve space before supporting context", () => {
  const longTitle =
    "I set a first-token target of 150–250ms for IntelliTab using a local 4-bit Qwen2.5-Coder-3B";
  const layout = calculateVisualLayout(longTitle, "details");
  assert.ok(layout.titleLines.length >= 3);
  assert.ok(layout.contextY - layout.titleLastBaseline >= 58);
  assert.ok(layout.contextY + (layout.contextMaxLines - 1) * 42 < 650);
});

test("text wrapping keeps a truncated final line instead of dropping remaining words", () => {
  const lines = wrapVisualText(
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen",
    18,
    2,
  );
  assert.equal(lines.length, 2);
  assert.match(lines[1] || "", /…$/);
});

test("portrait renderer emits a PNG", async () => {
  const rendered = await renderVisualAsset("portrait_card", brief, brand);
  assert.equal(rendered.mimeType, "image/png");
  assert.equal(rendered.width, 1200);
  assert.equal(rendered.height, 1500);
  assert.deepEqual([...rendered.file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("carousel renderer emits a five-page PDF and PNG preview", async () => {
  const rendered = await renderVisualAsset("linkedin_carousel", brief, brand);
  assert.equal(rendered.mimeType, "application/pdf");
  assert.equal(rendered.pageCount, 5);
  assert.equal(rendered.file.subarray(0, 4).toString(), "%PDF");
  assert.deepEqual([...rendered.preview.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
