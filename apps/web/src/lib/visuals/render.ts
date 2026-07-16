import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { renderVisualSvg } from "@/lib/visuals/svg";
import type { BrandConfig, RenderedVisual, VisualAssetKind, VisualBrief } from "@/lib/visuals/types";

async function png(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}

function slideBrief(base: VisualBrief, slide: number): { brief: VisualBrief; mode: "cover" | "details" | "takeaway" } {
  if (slide === 1) return { brief: base, mode: "cover" };
  if (slide === 2) {
    return {
      brief: { ...base, eyebrow: "The context", title: base.project, subtitle: base.subtitle },
      mode: "cover",
    };
  }
  if (slide === 3) return { brief: { ...base, eyebrow: "Verified details", title: "How it is structured" }, mode: "details" };
  if (slide === 4) return { brief: { ...base, eyebrow: "Engineering lesson", title: "What to take from it" }, mode: "takeaway" };
  return {
    brief: {
      ...base,
      eyebrow: "Build in public",
      title: `Follow for more ${base.project} engineering breakdowns`,
      subtitle: base.sourceLabel,
    },
    mode: "cover",
  };
}

export async function renderVisualAsset(
  kind: VisualAssetKind,
  brief: VisualBrief,
  brand: BrandConfig,
): Promise<RenderedVisual> {
  if (kind === "portrait_card") {
    const file = await png(renderVisualSvg({ brief, brand, mode: "details" }));
    return { file, preview: file, mimeType: "image/png", pageCount: 1, width: 1200, height: 1500 };
  }

  const slideCount = 5;
  const slides: Buffer[] = [];
  for (let index = 1; index <= slideCount; index += 1) {
    const slide = slideBrief(brief, index);
    slides.push(
      await png(
        renderVisualSvg({
          brief: slide.brief,
          brand,
          mode: slide.mode,
          slideNumber: index,
          slideCount,
        }),
      ),
    );
  }
  const document = await PDFDocument.create();
  for (const slide of slides) {
    const image = await document.embedPng(slide);
    const page = document.addPage([1200, 1500]);
    page.drawImage(image, { x: 0, y: 0, width: 1200, height: 1500 });
  }
  const bytes = await document.save({ useObjectStreams: true });
  return {
    file: Buffer.from(bytes),
    preview: slides[0]!,
    mimeType: "application/pdf",
    pageCount: slideCount,
    width: 1200,
    height: 1500,
  };
}

