import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface ExportableWeeklyReview {
  weekKey: string;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  status: string;
  summaryJson: string;
  nextWeekBriefJson: string;
  decisions: Array<{
    priority: number;
    category: string;
    title: string;
    rationale: string;
    confidence: string;
    status: string;
  }>;
}

function csvCell(value: unknown): string {
  const string = value == null ? "" : String(value);
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function weeklyReviewCsv(review: ExportableWeeklyReview): string {
  const summary = JSON.parse(review.summaryJson) as Record<string, unknown>;
  const brief = JSON.parse(review.nextWeekBriefJson) as Record<string, unknown>;
  const rows: unknown[][] = [
    ["section", "priority", "category", "status", "confidence", "title", "detail"],
    ["review", "", "", review.status, summary.dataConfidence ?? "", summary.headline ?? review.weekKey, `${review.periodStart.toISOString()} to ${review.periodEnd.toISOString()} (${review.timezone})`],
    ...review.decisions.map((decision) => ["decision", decision.priority, decision.category, decision.status, decision.confidence, decision.title, decision.rationale]),
    ["next_week", "", "focus", "", "", brief.focus ?? "", ""],
    ["next_week", "", "guardrail", "", "", brief.guardrail ?? "", ""],
    ["next_week", "", "experiment", "", "", brief.experiment ?? "", brief.reliabilityNote ?? ""],
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = pdfSafe(text).split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function weeklyReviewPdf(review: ExportableWeeklyReview): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const summary = JSON.parse(review.summaryJson) as Record<string, unknown>;
  const brief = JSON.parse(review.nextWeekBriefJson) as {
    focus?: string;
    guardrail?: string;
    experiment?: string;
    measurement?: string[];
    reliabilityNote?: string;
  };
  const width = 612;
  const height = 792;
  const margin = 54;
  const maxWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const addPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.bold ? bold : regular;
    const lines = wrap(text, font, size, maxWidth);
    const lineHeight = size * 1.42;
    for (const line of lines) {
      if (y < margin + lineHeight) addPage();
      page.drawText(line, { x: margin, y, size, font, color: options.color ?? rgb(0.12, 0.16, 0.22) });
      y -= lineHeight;
    }
    y -= options.gap ?? 8;
  };

  drawText("DEVPULSE AI / WEEKLY GROWTH REVIEW", { size: 10, bold: true, color: rgb(0.02, 0.55, 0.53), gap: 16 });
  drawText(pdfSafe(summary.headline ?? `Review ${review.weekKey}`), { size: 22, bold: true, gap: 12 });
  drawText(`${review.periodStart.toISOString().slice(0, 10)} to ${review.periodEnd.toISOString().slice(0, 10)} / ${review.timezone} / ${review.status}`, { size: 9, color: rgb(0.4, 0.45, 0.52), gap: 20 });
  drawText(`Tracked posts: ${summary.trackedPosts ?? 0}   Impressions: ${summary.impressions ?? 0}   Engagement: ${summary.engagementRate ?? 0}%   Followers: ${summary.followersGained ?? 0}`, { size: 11, bold: true, gap: 22 });

  for (const decision of review.decisions) {
    drawText(`${decision.priority}. ${decision.category.toUpperCase()} / ${decision.status.toUpperCase()} / ${decision.confidence.toUpperCase()} CONFIDENCE`, { size: 9, bold: true, color: rgb(0.02, 0.55, 0.53), gap: 6 });
    drawText(decision.title, { size: 15, bold: true, gap: 6 });
    drawText(decision.rationale, { size: 10, gap: 18 });
  }

  drawText("NEXT-WEEK BRIEF", { size: 11, bold: true, color: rgb(0.02, 0.55, 0.53), gap: 10 });
  drawText(`Focus: ${brief.focus ?? ""}`, { size: 10, gap: 5 });
  drawText(`Guardrail: ${brief.guardrail ?? ""}`, { size: 10, gap: 5 });
  drawText(`Experiment: ${brief.experiment ?? ""}`, { size: 10, gap: 5 });
  for (const item of brief.measurement ?? []) drawText(`- ${item}`, { size: 9, gap: 3 });
  drawText(brief.reliabilityNote ?? "", { size: 9, color: rgb(0.4, 0.45, 0.52), gap: 0 });

  return pdf.save();
}
