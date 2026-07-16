import { prisma } from "@/lib/db";
import type { BrandConfig } from "@/lib/visuals/types";

export const DEFAULT_BRAND = {
  tagline: "Building AI developer tools in public",
  accentColor: "#22d3ee",
  backgroundColor: "#07111f",
  textColor: "#f8fafc",
  footerText: "Local AI · LLM Systems · Product Engineering",
} as const;

export async function getBrandSettings(userId: string, displayName: string) {
  return prisma.brandSettings.upsert({
    where: { userId },
    create: { userId, displayName: displayName || "Builder", ...DEFAULT_BRAND },
    update: {},
  });
}

export function toBrandConfig(row: BrandConfig): BrandConfig {
  return {
    displayName: row.displayName,
    handle: row.handle,
    tagline: row.tagline,
    accentColor: row.accentColor,
    backgroundColor: row.backgroundColor,
    textColor: row.textColor,
    footerText: row.footerText,
  };
}

export function safeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

