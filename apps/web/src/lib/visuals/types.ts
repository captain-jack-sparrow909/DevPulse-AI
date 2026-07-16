export type VisualAssetKind = "portrait_card" | "linkedin_carousel";

export interface BrandConfig {
  displayName: string;
  handle: string;
  tagline: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  footerText: string;
}

export interface VisualBrief {
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: string[];
  project: string;
  takeaway: string;
  sourceLabel: string;
  altText: string;
  allowedFacts: string;
}

export interface RenderedVisual {
  file: Buffer;
  preview: Buffer;
  mimeType: "image/png" | "application/pdf";
  pageCount: number;
  width: number;
  height: number;
}

