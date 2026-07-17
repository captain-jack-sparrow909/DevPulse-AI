import { addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { computeDailySlots } from "@/lib/schedule/slots";
import { contentTypeForSlot, type ContentStrategyConfig, type ContentType } from "@/lib/content/strategy";

export interface ExecutionDecisionInput {
  id: string;
  category: string;
  title: string;
  status: string;
  action: { type?: string; contentType?: ContentType | null };
}

export interface ExecutionExperimentInput {
  id: string;
  name: string;
  platform: string;
  dimension: string;
}

export interface ExecutionCampaignInput {
  id: string;
  name: string;
  projectId: string;
  ctaMode: string;
  destinationUrl: string | null;
}

export interface ExecutionPlanItemDraft {
  sequence: number;
  scheduledFor: Date;
  slotIndex: number;
  contentType: ContentType;
  projectId: string | null;
  projectName: string | null;
  objective: string;
  angle: string;
  platforms: string;
  mediaType: string;
  cta: Record<string, unknown>;
  distribution: Record<string, unknown>;
  measurement: Record<string, unknown>;
  experimentId: string | null;
  campaignId: string | null;
  sourceDecisionIds: string[];
}

export interface ExecutionPlanDraft {
  periodStart: Date;
  periodEnd: Date;
  brief: {
    focus: string;
    guardrail: string;
    experiment: string;
    operatingRules: string[];
  };
  evidence: Record<string, unknown>;
  items: ExecutionPlanItemDraft[];
}

function localAddDays(date: Date, amount: number, timezone: string): Date {
  return fromZonedTime(addDays(toZonedTime(date, timezone), amount), timezone);
}

function objective(contentType: ContentType, projectName: string | null): string {
  const project = projectName || "a product-relevant source";
  if (contentType === "project_lesson") return `Teach one verified implementation lesson from ${project}.`;
  if (contentType === "architecture_breakdown") return `Explain one reusable system boundary or engineering tradeoff from ${project}.`;
  if (contentType === "evidence_opinion") return `Take one defensible position grounded in evidence relevant to ${project}.`;
  if (contentType === "experiment_benchmark") return `Share one measured result or clearly labelled testable target from ${project}.`;
  return "Curate one product-relevant external discovery and add a distinct engineering implication.";
}

function anchorSlots(postsPerDay: number): number[] {
  const last = Math.max(0, postsPerDay - 1);
  return [...new Set([
    Math.round(last * 0.25),
    Math.round(last * 0.5),
    Math.round(last * 0.75),
  ])];
}

export function buildExecutionPlan(input: {
  startDate: Date;
  timezone: string;
  firstPostHour: number;
  lastPostHour: number;
  postsPerDay: number;
  strategy: ContentStrategyConfig;
  reviewId: string;
  reviewStatus: string;
  reviewSummary: Record<string, unknown>;
  reviewBrief: { focus?: string; guardrail?: string; experiment?: string };
  decisions: ExecutionDecisionInput[];
  activeExperiments: ExecutionExperimentInput[];
  activeCampaigns: ExecutionCampaignInput[];
}): ExecutionPlanDraft {
  const sourceDecisionIds = input.decisions.filter((decision) => decision.status === "applied").map((decision) => decision.id);
  const slots = anchorSlots(input.postsPerDay);
  const items: ExecutionPlanItemDraft[] = [];

  for (let day = 0; day < 7; day += 1) {
    const dayDate = localAddDays(input.startDate, day, input.timezone);
    const dailySlots = computeDailySlots(dayDate, input.timezone, input.firstPostHour, input.lastPostHour, input.postsPerDay);
    const slotIndex = slots[day % slots.length] ?? 0;
    const content = contentTypeForSlot(day, input.strategy.contentMix);
    const project = content.type === "curated_discovery"
      ? null
      : input.strategy.projects[day % Math.max(1, input.strategy.projects.length)] ?? null;
    const campaign = project
      ? input.activeCampaigns.find((item) => item.projectId === project.id) ?? null
      : null;
    const experiment = input.activeExperiments.find((item) => item.platform === "x" || item.platform === "linkedin") ?? null;
    const itemObjective = objective(content.type, project?.name ?? null);

    items.push({
      sequence: day + 1,
      scheduledFor: dailySlots[slotIndex]!,
      slotIndex,
      contentType: content.type,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      objective: itemObjective,
      angle: `${content.label}: ${itemObjective}`,
      platforms: "x,linkedin",
      mediaType: content.type === "architecture_breakdown" ? "carousel" : "branded_visual",
      cta: campaign
        ? { mode: campaign.ctaMode, destinationUrl: campaign.destinationUrl, source: "active_campaign" }
        : { mode: content.type === "curated_discovery" ? "question" : "follow", source: "weekly_plan" },
      distribution: {
        preEngage: true,
        reviewCommentsWithinHours: 2,
        captureAudienceSignal: true,
      },
      measurement: {
        checkpoints: ["1h", "24h", "72h", "7d"],
        primaryCheckpoint: "24h",
        requireFollowers: true,
      },
      experimentId: experiment?.id ?? null,
      campaignId: campaign?.id ?? null,
      sourceDecisionIds,
    });
  }

  return {
    periodStart: items[0]!.scheduledFor,
    periodEnd: localAddDays(items[items.length - 1]!.scheduledFor, 1, input.timezone),
    brief: {
      focus: input.reviewBrief.focus || "Maintain the current product-first positioning while collecting comparable evidence.",
      guardrail: input.reviewBrief.guardrail || "Do not change the content mix without repeated 24-hour evidence.",
      experiment: input.reviewBrief.experiment || "Collect the minimum comparable sample before declaring a winner.",
      operatingRules: [
        "One anchor post per day; remaining daily slots keep the normal approved strategy rotation.",
        "Every generated draft still requires human review and manual publishing.",
        "Capture X and LinkedIn metrics at 1h, 24h, 72h, and 7d.",
        "Reject or skip an anchor rather than replacing missing evidence with an invented claim.",
      ],
    },
    evidence: {
      version: 1,
      reviewId: input.reviewId,
      reviewStatus: input.reviewStatus,
      reviewSummary: input.reviewSummary,
      decisionStatuses: input.decisions.map((decision) => ({ id: decision.id, category: decision.category, status: decision.status, action: decision.action.type })),
      contentMix: input.strategy.contentMix,
      activeExperimentIds: input.activeExperiments.map((experiment) => experiment.id),
      activeCampaignIds: input.activeCampaigns.map((campaign) => campaign.id),
    },
    items,
  };
}
