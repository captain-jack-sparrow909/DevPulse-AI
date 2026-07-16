import type {
  EngagementBrief,
  EndingPattern,
  HookPattern,
  CtaPattern,
  CtaPlacement,
} from "@/lib/content/engagement";

export type ExperimentPlatform = "x" | "linkedin";
export type ExperimentDimension =
  | "hook_pattern"
  | "ending_pattern"
  | "x_format"
  | "media_type"
  | "cta_pattern"
  | "cta_placement";
export type ExperimentMetric =
  | "engagement_rate"
  | "reply_rate"
  | "save_rate"
  | "profile_visit_rate"
  | "follow_conversion"
  | "link_click_rate";

export interface ExperimentVariantConfig {
  hookPattern?: HookPattern;
  endingPattern?: EndingPattern;
  xFormat?: EngagementBrief["xFormat"];
  mediaType?: "text_only" | "branded_visual";
  ctaPattern?: CtaPattern;
  ctaPlacement?: CtaPlacement;
}

export interface ExperimentPreset {
  key: string;
  label: string;
  config: ExperimentVariantConfig;
}

export const EXPERIMENT_DIMENSIONS: Record<
  ExperimentDimension,
  { label: string; description: string; platforms: ExperimentPlatform[]; variants: ExperimentPreset[] }
> = {
  hook_pattern: {
    label: "Hook pattern",
    description: "Compare a concrete build decision with a technical tension opening.",
    platforms: ["x", "linkedin"],
    variants: [
      {
        key: "build-decision",
        label: "Build decision",
        config: { hookPattern: "build-decision" },
      },
      {
        key: "technical-tension",
        label: "Technical tension",
        config: { hookPattern: "technical-tension" },
      },
    ],
  },
  ending_pattern: {
    label: "Ending pattern",
    description: "Compare a focused engineering question with a practical takeaway.",
    platforms: ["x", "linkedin"],
    variants: [
      {
        key: "targeted-question",
        label: "Targeted question",
        config: { endingPattern: "targeted-question" },
      },
      {
        key: "practical-takeaway",
        label: "Practical takeaway",
        config: { endingPattern: "practical-takeaway" },
      },
    ],
  },
  x_format: {
    label: "X format",
    description: "Compare one standalone post with a compact explanatory thread.",
    platforms: ["x"],
    variants: [
      {
        key: "single-insight",
        label: "Single insight",
        config: { xFormat: "single-insight" },
      },
      {
        key: "mini-thread",
        label: "Mini thread",
        config: { xFormat: "mini-thread" },
      },
    ],
  },
  media_type: {
    label: "Media type",
    description: "Compare the same editorial system with text only versus a branded technical card.",
    platforms: ["x", "linkedin"],
    variants: [
      {
        key: "text-only",
        label: "Text only",
        config: { mediaType: "text_only" },
      },
      {
        key: "branded-visual",
        label: "Branded visual",
        config: { mediaType: "branded_visual" },
      },
    ],
  },
  cta_pattern: {
    label: "CTA pattern",
    description: "Compare a direct value invitation with one focused technical question.",
    platforms: ["x", "linkedin"],
    variants: [
      { key: "direct-value", label: "Direct value", config: { ctaPattern: "direct-value" } },
      { key: "question-led", label: "Question led", config: { ctaPattern: "question-led" } },
    ],
  },
  cta_placement: {
    label: "CTA placement",
    description: "Compare an inline contextual invitation with a final-paragraph CTA.",
    platforms: ["x", "linkedin"],
    variants: [
      { key: "inline", label: "Inline", config: { ctaPlacement: "inline" } },
      { key: "final", label: "Final", config: { ctaPlacement: "final" } },
    ],
  },
};

export const EXPERIMENT_METRICS: Array<{ value: ExperimentMetric; label: string }> = [
  { value: "engagement_rate", label: "Engagement rate" },
  { value: "reply_rate", label: "Reply/comment rate" },
  { value: "save_rate", label: "Save rate" },
  { value: "profile_visit_rate", label: "Profile-visit rate" },
  { value: "follow_conversion", label: "Follow conversion" },
  { value: "link_click_rate", label: "Link-click rate" },
];

export function isExperimentDimension(value: unknown): value is ExperimentDimension {
  return typeof value === "string" && value in EXPERIMENT_DIMENSIONS;
}

export function isExperimentMetric(value: unknown): value is ExperimentMetric {
  return EXPERIMENT_METRICS.some((metric) => metric.value === value);
}

export function parseVariantConfig(raw: string | null | undefined): ExperimentVariantConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ExperimentVariantConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export interface PlatformBriefOverride {
  platform: ExperimentPlatform;
  config: ExperimentVariantConfig;
}

/**
 * Keep experiment changes platform-specific. The base brief remains available
 * to the scorer while the writer receives explicit X/LinkedIn overrides.
 */
export function applyBriefOverrides(
  base: EngagementBrief,
  overrides: PlatformBriefOverride[],
): EngagementBrief {
  const platformOverrides = { ...(base.platformOverrides ?? {}) };
  for (const override of overrides) {
    const writingConfig = {
      ...(override.config.hookPattern ? { hookPattern: override.config.hookPattern } : {}),
      ...(override.config.endingPattern ? { endingPattern: override.config.endingPattern } : {}),
      ...(override.config.xFormat ? { xFormat: override.config.xFormat } : {}),
      ...(override.config.ctaPattern ? { ctaPattern: override.config.ctaPattern } : {}),
      ...(override.config.ctaPlacement ? { ctaPlacement: override.config.ctaPlacement } : {}),
    };
    platformOverrides[override.platform] = {
      ...(platformOverrides[override.platform] ?? {}),
      ...writingConfig,
    };
  }
  return { ...base, platformOverrides };
}

export function chooseBalancedVariant<T extends { id: string; assignedPosts: number }>(
  variants: T[],
  slotIndex: number,
): T | null {
  if (!variants.length) return null;
  const minimum = Math.min(...variants.map((variant) => variant.assignedPosts));
  const tied = variants.filter((variant) => variant.assignedPosts === minimum);
  return tied[Math.abs(slotIndex) % tied.length] ?? tied[0] ?? null;
}
