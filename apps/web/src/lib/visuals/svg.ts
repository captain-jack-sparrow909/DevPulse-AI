import type { BrandConfig, VisualBrief } from "@/lib/visuals/types";

const WIDTH = 1200;
const HEIGHT = 1500;

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function wrapVisualText(value: string, max: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= max || !line) {
      line = candidate;
    } else {
      lines.push(line);
      if (lines.length === maxLines - 1) {
        const remaining = words.slice(index).join(" ");
        const shortened = remaining.length <= max
          ? remaining
          : `${remaining.slice(0, max - 1).replace(/\s+\S*$/, "").trim()}…`;
        lines.push(shortened);
        return lines;
      }
      line = word;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export function calculateVisualLayout(
  title: string,
  mode: "cover" | "details" | "takeaway",
) {
  const titleFontSize = mode === "cover" ? 72 : title.length > 95 ? 56 : 62;
  const titleLineHeight = mode === "cover" ? 86 : titleFontSize === 56 ? 68 : 74;
  const titleLines = wrapVisualText(
    title,
    mode === "cover" ? 24 : titleFontSize === 56 ? 34 : 30,
    mode === "cover" ? 5 : 4,
  );
  const titleY = 255;
  const titleLastBaseline = titleY + Math.max(0, titleLines.length - 1) * titleLineHeight;
  const contextMaxLines = titleLines.length >= 4 ? 2 : 3;
  const contextY = Math.max(445, titleLastBaseline + 58);
  return {
    titleFontSize,
    titleLineHeight,
    titleLines,
    titleY,
    titleLastBaseline,
    contextMaxLines,
    contextY,
  };
}

function textBlock(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  fill: string,
  weight = 500,
): string {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`)
    .join("")}</text>`;
}

export function renderVisualSvg(input: {
  brief: VisualBrief;
  brand: BrandConfig;
  slideNumber?: number;
  slideCount?: number;
  mode?: "cover" | "details" | "takeaway";
}): string {
  const { brief, brand } = input;
  const mode = input.mode ?? "details";
  const layout = calculateVisualLayout(brief.title, mode);
  const subtitleLines = wrapVisualText(brief.subtitle, 48, 5);
  const handle = brand.handle.trim() || brand.displayName;
  const bullets = brief.bullets.slice(0, 3);
  const supportingContext = mode === "details"
    ? textBlock(
        wrapVisualText(brief.subtitle, 52, layout.contextMaxLines),
        84,
        layout.contextY,
        29,
        42,
        "#94a3b8",
        450,
      )
    : "";
  let body = "";
  if (mode === "takeaway") {
    body = `
      <rect x="84" y="650" width="1032" height="390" rx="34" fill="#ffffff" fill-opacity="0.055" stroke="#ffffff" stroke-opacity="0.11"/>
      <text x="132" y="720" fill="${brand.accentColor}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="24" font-weight="700" letter-spacing="3">PRACTICAL TAKEAWAY</text>
      ${textBlock(wrapVisualText(brief.takeaway, 42, 6), 132, 800, 44, 62, brand.textColor, 600)}
    `;
  } else if (mode === "details") {
    body = bullets
      .map((bullet, index) => {
        const top = 735 + index * 190;
        return `<rect x="84" y="${top}" width="1032" height="154" rx="26" fill="#ffffff" fill-opacity="0.045" stroke="#ffffff" stroke-opacity="0.09"/>
          <circle cx="132" cy="${top + 48}" r="13" fill="${brand.accentColor}"/>
          ${textBlock(wrapVisualText(bullet, 50, 3), 174, top + 53, 31, 43, brand.textColor, 520)}`;
      })
      .join("");
  } else {
    body = `${textBlock(subtitleLines, 88, 785, 34, 50, "#b7c4d6", 450)}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${brand.backgroundColor}"/><stop offset="1" stop-color="#020617"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${brand.accentColor}" stop-opacity="0.22"/><stop offset="1" stop-color="${brand.accentColor}" stop-opacity="0"/></radialGradient>
      <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/></pattern>
    </defs>
    <rect width="1200" height="1500" fill="url(#bg)"/>
    <circle cx="1040" cy="180" r="520" fill="url(#glow)"/>
    <rect width="1200" height="1500" fill="url(#grid)"/>
    <rect x="48" y="48" width="1104" height="1404" rx="38" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
    <rect x="84" y="92" width="10" height="40" rx="5" fill="${brand.accentColor}"/>
    <text x="116" y="121" fill="${brand.accentColor}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="22" font-weight="700" letter-spacing="3">${xml(brief.eyebrow.toUpperCase())}</text>
    <text x="1116" y="121" text-anchor="end" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, monospace" font-size="20">${xml(brief.project)}</text>
    ${textBlock(layout.titleLines, 84, layout.titleY, layout.titleFontSize, layout.titleLineHeight, brand.textColor, 760)}
    ${supportingContext}
    <rect x="84" y="650" width="180" height="6" rx="3" fill="${brand.accentColor}"/>
    ${body}
    <line x1="84" y1="1324" x2="1116" y2="1324" stroke="#ffffff" stroke-opacity="0.09"/>
    <text x="84" y="1385" fill="${brand.textColor}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="650">${xml(brand.displayName)}</text>
    <text x="84" y="1420" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="21">${xml(handle)} · ${xml(brand.footerText)}</text>
    ${input.slideNumber && input.slideCount ? `<text x="1116" y="1405" text-anchor="end" fill="${brand.accentColor}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="24" font-weight="700">${input.slideNumber}/${input.slideCount}</text>` : ""}
  </svg>`;
}
