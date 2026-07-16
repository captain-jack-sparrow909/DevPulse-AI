import { prisma } from "@/lib/db";
import type { EngagementBrief } from "@/lib/content/engagement";
import type { ContentMixItem, ContentStrategyConfig } from "@/lib/content/strategy";
import {
  applyBriefOverrides,
  chooseBalancedVariant,
  isExperimentMetric,
  parseVariantConfig,
  type ExperimentDimension,
  type ExperimentMetric,
  type ExperimentPlatform,
  type ExperimentVariantConfig,
  type PlatformBriefOverride,
} from "@/lib/experiments/definitions";
import {
  analyzeExperiment,
  type ExperimentPerformanceInput,
  type ExperimentResult,
  type ExperimentVariantInput,
} from "@/lib/experiments/analysis";
import type { RawSourceItem } from "@/lib/integrations/types";

export interface GenerationLearning {
  brief: EngagementBrief;
  experimentVariantId: string | null;
  recommendedMediaByPlatform: Record<
    ExperimentPlatform,
    "text_only" | "branded_visual" | "carousel"
  >;
  mediaPreferenceSourceByPlatform: Record<
    ExperimentPlatform,
    "default" | "recommendation" | "experiment"
  >;
  experiment: {
    id: string;
    name: string;
    platform: ExperimentPlatform;
    dimension: ExperimentDimension;
    variantLabel: string;
    variantConfig: ExperimentVariantConfig;
  } | null;
  appliedRecommendations: Array<{
    id: string;
    platform: ExperimentPlatform;
    dimension: string;
    config: ExperimentVariantConfig;
  }>;
}

function platform(value: string): ExperimentPlatform {
  return value === "linkedin" ? "linkedin" : "x";
}

function metric(value: string): ExperimentMetric {
  return isExperimentMetric(value) ? value : "engagement_rate";
}

export async function resolveGenerationLearning(
  userId: string,
  slotIndex: number,
  baseBrief: EngagementBrief,
): Promise<GenerationLearning> {
  const [recommendations, activeExperiment] = await Promise.all([
    prisma.strategyRecommendation.findMany({
      where: { userId, status: "applied" },
      orderBy: { decidedAt: "desc" },
    }),
    prisma.growthExperiment.findFirst({
      where: { userId, status: "active" },
      orderBy: { startedAt: "asc" },
      include: {
        variants: {
          orderBy: { createdAt: "asc" },
          include: { _count: { select: { posts: true } } },
        },
      },
    }),
  ]);

  const seen = new Set<string>();
  const appliedRecommendations: GenerationLearning["appliedRecommendations"] = [];
  const overrides: PlatformBriefOverride[] = [];
  const recommendedMediaByPlatform: GenerationLearning["recommendedMediaByPlatform"] = {
    x: "branded_visual",
    linkedin: "branded_visual",
  };
  const mediaPreferenceSourceByPlatform: GenerationLearning["mediaPreferenceSourceByPlatform"] = {
    x: "default",
    linkedin: "default",
  };
  for (const recommendation of recommendations) {
    const recommendationPlatform = platform(recommendation.platform);
    const key = `${recommendationPlatform}:${recommendation.dimension}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const config = parseVariantConfig(recommendation.proposedConfigJson);
    if (config.mediaType) {
      recommendedMediaByPlatform[recommendationPlatform] = config.mediaType;
      mediaPreferenceSourceByPlatform[recommendationPlatform] = "recommendation";
    }
    appliedRecommendations.push({
      id: recommendation.id,
      platform: recommendationPlatform,
      dimension: recommendation.dimension,
      config,
    });
    overrides.push({ platform: recommendationPlatform, config });
  }

  let experiment: GenerationLearning["experiment"] = null;
  let experimentVariantId: string | null = null;
  if (activeExperiment) {
    const variant = chooseBalancedVariant(
      activeExperiment.variants.map((row) => ({
        ...row,
        assignedPosts: row._count.posts,
      })),
      slotIndex,
    );
    if (variant) {
      const config = parseVariantConfig(variant.configJson);
      const experimentPlatform = platform(activeExperiment.platform);
      if (config.mediaType) {
        recommendedMediaByPlatform[experimentPlatform] = config.mediaType;
        mediaPreferenceSourceByPlatform[experimentPlatform] = "experiment";
      }
      overrides.push({ platform: experimentPlatform, config });
      experimentVariantId = variant.id;
      experiment = {
        id: activeExperiment.id,
        name: activeExperiment.name,
        platform: experimentPlatform,
        dimension: activeExperiment.dimension as ExperimentDimension,
        variantLabel: variant.label,
        variantConfig: config,
      };
    }
  }

  return {
    brief: applyBriefOverrides(baseBrief, overrides),
    experimentVariantId,
    recommendedMediaByPlatform,
    mediaPreferenceSourceByPlatform,
    experiment,
    appliedRecommendations,
  };
}

export function buildGenerationSnapshot(input: {
  slotIndex: number;
  scheduledFor: Date;
  contentType: ContentMixItem;
  brief: EngagementBrief;
  strategy: ContentStrategyConfig;
  source: RawSourceItem;
  learning: GenerationLearning;
  recommendedMediaByPlatform?: GenerationLearning["recommendedMediaByPlatform"];
}): string {
  return JSON.stringify({
    version: 1,
    capturedAt: new Date().toISOString(),
    slotIndex: input.slotIndex,
    scheduledFor: input.scheduledFor.toISOString(),
    contentType: input.contentType.type,
    hookPattern: input.brief.hookPattern,
    endingPattern: input.brief.endingPattern,
    xFormat: input.brief.xFormat,
    linkedInStructure: input.brief.linkedInStructure,
    platformOverrides: input.brief.platformOverrides ?? {},
    contentMix: input.strategy.contentMix,
    source: {
      provider: input.source.provider,
      externalId: input.source.externalId,
      title: input.source.title,
    },
    experiment: input.learning.experiment,
    recommendedMediaByPlatform:
      input.recommendedMediaByPlatform ?? input.learning.recommendedMediaByPlatform,
    appliedRecommendationIds: input.learning.appliedRecommendations.map((row) => row.id),
  });
}

export function recommendedMediaTypeForContent(
  contentType: ContentMixItem,
  learning: GenerationLearning,
): GenerationLearning["recommendedMediaByPlatform"] {
  const recommended = { ...learning.recommendedMediaByPlatform };
  if (learning.mediaPreferenceSourceByPlatform.x === "default") {
    recommended.x = "branded_visual";
  }
  if (learning.mediaPreferenceSourceByPlatform.linkedin === "default") {
    recommended.linkedin =
      contentType.type === "architecture_breakdown" ? "carousel" : "branded_visual";
  }
  return recommended;
}

type StoredExperiment = Awaited<ReturnType<typeof loadExperiment>>;

async function loadExperiment(userId: string, experimentId: string) {
  return prisma.growthExperiment.findFirst({
    where: { id: experimentId, userId },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
        include: {
          posts: {
            where: { experimentEligible: true },
            select: {
              id: true,
              mediaTypeX: true,
              mediaTypeLinkedIn: true,
              performanceSnapshots: {
                orderBy: { capturedAt: "desc" },
              },
            },
          },
        },
      },
      recommendations: {
        orderBy: { createdAt: "desc" },
        include: { winnerVariant: { select: { label: true } } },
      },
    },
  });
}

function toAnalysis(experiment: NonNullable<StoredExperiment>): ExperimentResult {
  const variants: ExperimentVariantInput[] = experiment.variants.map((variant) => {
    const expectedMedia = parseVariantConfig(variant.configJson).mediaType;
    const compliantPosts = expectedMedia
      ? variant.posts.filter((post) =>
          experiment.platform === "linkedin"
            ? post.mediaTypeLinkedIn === expectedMedia
            : post.mediaTypeX === expectedMedia,
        )
      : variant.posts;
    return {
      id: variant.id,
      key: variant.key,
      label: variant.label,
      configJson: variant.configJson,
      assignedPosts: variant.posts.length,
      performance: compliantPosts.flatMap((post) =>
        post.performanceSnapshots.map((snapshot) => ({
          ...snapshot,
          postId: post.id,
          platform: platform(snapshot.platform),
        } satisfies ExperimentPerformanceInput)),
      ),
    };
  });
  return analyzeExperiment({
    variants,
    metric: metric(experiment.primaryMetric),
    platform: platform(experiment.platform),
    minSamplePerVariant: experiment.minSamplePerVariant,
  });
}

export interface ExperimentView {
  id: string;
  name: string;
  hypothesis: string;
  platform: ExperimentPlatform;
  dimension: string;
  primaryMetric: ExperimentMetric;
  minSamplePerVariant: number;
  status: string;
  createdAt: string;
  result: ExperimentResult;
  recommendations: Array<{
    id: string;
    status: string;
    rationale: string;
    winnerLabel: string | null;
    createdAt: string;
  }>;
}

export async function getExperimentViews(userId: string): Promise<ExperimentView[]> {
  const experiments = await prisma.growthExperiment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const loaded = await Promise.all(experiments.map((row) => loadExperiment(userId, row.id)));
  return loaded.filter((row): row is NonNullable<StoredExperiment> => Boolean(row)).map((row) => ({
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis,
    platform: platform(row.platform),
    dimension: row.dimension,
    primaryMetric: metric(row.primaryMetric),
    minSamplePerVariant: row.minSamplePerVariant,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    result: toAnalysis(row),
    recommendations: row.recommendations.map((recommendation) => ({
      id: recommendation.id,
      status: recommendation.status,
      rationale: recommendation.rationale,
      winnerLabel: recommendation.winnerVariant?.label ?? null,
      createdAt: recommendation.createdAt.toISOString(),
    })),
  }));
}

export async function proposeExperimentRecommendation(userId: string, experimentId: string) {
  const experiment = await loadExperiment(userId, experimentId);
  if (!experiment) throw new Error("Experiment not found");
  const result = toAnalysis(experiment);
  if (result.status !== "winner" || !result.winner) {
    throw new Error(result.rationale);
  }
  const existing = experiment.recommendations.find((row) =>
    ["pending", "applied"].includes(row.status),
  );
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    const recommendation = await tx.strategyRecommendation.create({
      data: {
        userId,
        experimentId: experiment.id,
        winnerVariantId: result.winner!.id,
        dimension: experiment.dimension,
        platform: result.platform,
        proposedConfigJson: result.winner!.configJson,
        evidenceJson: JSON.stringify(result),
        rationale: result.rationale,
      },
    });
    await tx.growthExperiment.update({
      where: { id: experiment.id },
      data: { status: "completed", completedAt: new Date() },
    });
    return recommendation;
  });
}

export async function decideRecommendation(
  userId: string,
  recommendationId: string,
  action: "apply" | "reject",
) {
  const recommendation = await prisma.strategyRecommendation.findFirst({
    where: { id: recommendationId, userId },
  });
  if (!recommendation) throw new Error("Recommendation not found");
  if (recommendation.status !== "pending") throw new Error("Recommendation was already decided");
  if (action === "reject") {
    return prisma.strategyRecommendation.update({
      where: { id: recommendation.id },
      data: { status: "rejected", decidedAt: new Date() },
    });
  }
  return prisma.$transaction(async (tx) => {
    await tx.strategyRecommendation.updateMany({
      where: {
        userId,
        status: "applied",
        platform: recommendation.platform,
        dimension: recommendation.dimension,
      },
      data: { status: "superseded", decidedAt: new Date() },
    });
    return tx.strategyRecommendation.update({
      where: { id: recommendation.id },
      data: { status: "applied", decidedAt: new Date() },
    });
  });
}
