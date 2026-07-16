import { prisma } from "@/lib/db";
import { getContentStrategy } from "@/lib/content/strategy-store";
import { chatCompletion, isAiConfigured } from "@/lib/ai/client";
import {
  buildEngagementPrompt,
  engagementBriefForSlot,
  parseDraftCandidates,
  selectBestDraft,
  auditDualDraft,
  type DualDraft,
} from "@/lib/content/engagement";
import type { ContentMixItem, ContentType } from "@/lib/content/strategy";
import { scoreDualDraft } from "@/lib/ai/scoring";
import { contentHash } from "@/lib/hash";
import { DEFAULT_WRITING_STYLE } from "@/lib/constants";
import { enforceXLimit } from "@/lib/content/platforms";
import { createTrackedLink, trackedLinkUrl } from "@/lib/attribution/links";
import {
  buildCampaignPlan,
  CAMPAIGN_GOALS,
  type CampaignEvidenceFact,
  type CampaignEvidenceSignal,
  type CampaignGoal,
} from "@/lib/campaigns/definitions";

function contentTypeForStage(stage: string): ContentType {
  if (stage === "decision" || stage === "implementation") return "architecture_breakdown";
  if (stage === "proof") return "experiment_benchmark";
  if (stage === "audience") return "evidence_opinion";
  return "project_lesson";
}

function mixForStage(stage: string): ContentMixItem {
  const type = contentTypeForStage(stage);
  return {
    type,
    label: stage.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase()),
    weight: 1,
    guidance: "Use only the campaign item's supplied evidence.",
  };
}

function parseEvidence(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function templateDraft(input: {
  projectName: string;
  label: string;
  purpose: string;
  evidenceText: string;
  ctaText?: string | null;
  destinationUrl?: string | null;
}): DualDraft {
  const fact = input.evidenceText.replace(/\s+/g, " ").slice(0, 500);
  const hook = `${input.projectName}: ${input.label}`.slice(0, 120);
  const close = [input.ctaText, input.destinationUrl].filter(Boolean).join("\n");
  const linkedIn = `${hook}\n\n${fact}\n\nThis stage focuses on one bounded point: ${input.purpose}\n\nThe useful question is not whether every product should copy the decision, but which constraint makes it appropriate.\n\n${close || "I’m documenting the implementation evidence as the product develops."}`;
  return {
    title: hook,
    hook,
    linkedIn,
    xThread: [`${hook}\n\n${fact}`.slice(0, 275), close].filter(Boolean),
  };
}

function campaignCta(item: { ctaJson: string }, campaign: {
  ctaTextX: string | null;
  ctaTextLinkedIn: string | null;
  destinationUrl: string | null;
}) {
  const parsed = parseEvidence(item.ctaJson);
  const mode = typeof parsed.mode === "string" ? parsed.mode : "none";
  return {
    mode,
    x: typeof parsed.x === "string" ? parsed.x : campaign.ctaTextX,
    linkedin:
      typeof parsed.linkedin === "string" ? parsed.linkedin : campaign.ctaTextLinkedIn,
    destinationUrl:
      typeof parsed.destinationUrl === "string"
        ? parsed.destinationUrl
        : campaign.destinationUrl,
  };
}

async function campaignEvidence(userId: string, projectId: string) {
  const [strategy, facts, signals] = await Promise.all([
    getContentStrategy(userId),
    prisma.projectFact.findMany({
      where: { userId, projectId, reviewStatus: "approved", repository: { active: true } },
      orderBy: [{ useCount: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.contentSignal.findMany({
      where: { userId, status: "saved" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const project = strategy.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error("Project is not present in Content Strategy");
  return {
    project,
    facts: facts.map((fact): CampaignEvidenceFact => ({
      id: fact.id,
      title: fact.title,
      claim: fact.claim,
      sourceUrl: fact.sourceUrl,
    })),
    signals: signals.map((signal): CampaignEvidenceSignal => ({
      id: signal.id,
      kind: signal.kind,
      text: signal.text,
      sourceUrl: signal.sourceUrl,
    })),
  };
}

export async function createCampaign(
  userId: string,
  input: {
    name: string;
    projectId: string;
    goal: CampaignGoal;
    platforms: string;
    startAt: Date;
    endAt: Date;
    goalTarget?: number | null;
    baselineValue?: number | null;
    ctaTextX?: string | null;
    ctaTextLinkedIn?: string | null;
    destinationUrl?: string | null;
    notes?: string | null;
  },
) {
  if (input.endAt <= input.startAt) throw new Error("Campaign end must be after its start");
  const days = (input.endAt.getTime() - input.startAt.getTime()) / 86_400_000;
  if (days < 3 || days > 30) throw new Error("Campaign duration must be between 3 and 30 days");
  const evidence = await campaignEvidence(userId, input.projectId);
  const goal = CAMPAIGN_GOALS[input.goal];
  const destinationUrl = input.destinationUrl ||
    (goal.ctaMode === "repository" ? evidence.project.url : null);
  if (input.goal === "beta_users" && !destinationUrl) {
    throw new Error("Beta-user campaigns require a waitlist or product URL");
  }
  const plan = buildCampaignPlan({
    project: evidence.project,
    facts: evidence.facts,
    signals: evidence.signals,
    startAt: input.startAt,
    endAt: input.endAt,
    ctaMode: goal.ctaMode,
    ctaTextX: input.ctaTextX,
    ctaTextLinkedIn: input.ctaTextLinkedIn,
    destinationUrl,
  });
  return prisma.campaign.create({
    data: {
      userId,
      name: input.name,
      projectId: input.projectId,
      projectName: evidence.project.name,
      goal: input.goal,
      goalMetric: goal.metric,
      goalTarget: input.goalTarget,
      baselineValue: input.baselineValue,
      platforms: input.platforms,
      startAt: input.startAt,
      endAt: input.endAt,
      ctaMode: goal.ctaMode,
      ctaTextX: input.ctaTextX,
      ctaTextLinkedIn: input.ctaTextLinkedIn,
      destinationUrl,
      notes: input.notes,
      items: {
        create: plan.map((item) => ({
          sequence: item.sequence,
          stage: item.stage,
          label: item.label,
          purpose: item.purpose,
          status: item.status,
          scheduledFor: item.scheduledFor,
          evidenceKind: item.evidenceKind,
          projectFactId: item.projectFactId,
          contentSignalId: item.contentSignalId,
          evidenceJson: JSON.stringify(item.evidence),
          ctaJson: JSON.stringify(item.cta),
          blockReason: item.blockReason,
        })),
      },
    },
    include: { items: { orderBy: { sequence: "asc" } } },
  });
}

export async function refreshCampaignEvidence(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!campaign) throw new Error("Campaign not found");
  const evidence = await campaignEvidence(userId, campaign.projectId);
  const plan = buildCampaignPlan({
    project: evidence.project,
    facts: evidence.facts,
    signals: evidence.signals,
    startAt: campaign.startAt,
    endAt: campaign.endAt,
    ctaMode: campaign.ctaMode,
    ctaTextX: campaign.ctaTextX,
    ctaTextLinkedIn: campaign.ctaTextLinkedIn,
    destinationUrl: campaign.destinationUrl,
  });
  for (const item of plan) {
    await prisma.campaignItem.updateMany({
      where: { campaignId, stage: item.stage, postId: null },
      data: {
        status: item.status,
        evidenceKind: item.evidenceKind,
        projectFactId: item.projectFactId ?? null,
        contentSignalId: item.contentSignalId ?? null,
        evidenceJson: JSON.stringify(item.evidence),
        ctaJson: JSON.stringify(item.cta),
        blockReason: item.blockReason ?? null,
      },
    });
  }
}

export async function generateCampaignItem(userId: string, campaignId: string, itemId: string) {
  const item = await prisma.campaignItem.findFirst({
    where: { id: itemId, campaignId, campaign: { userId } },
    include: { campaign: true, post: true },
  });
  if (!item) throw new Error("Campaign item not found");
  if (item.postId) throw new Error("This campaign stage already has a draft");
  if (item.status === "blocked") throw new Error(item.blockReason || "Campaign evidence is missing");
  if (item.status === "skipped") throw new Error("Skipped campaign stages cannot be drafted");

  const evidence = parseEvidence(item.evidenceJson);
  const evidenceText = JSON.stringify(evidence);
  const cta = campaignCta(item, item.campaign);
  const recent = await prisma.post.findMany({
    where: { userId },
    select: { hook: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const style = await prisma.writingStyle.findFirst({
    where: { userId, isDefault: true },
  });
  const contentType = mixForStage(item.stage);
  const brief = engagementBriefForSlot(item.sequence - 1, contentType);
  const recentHooks = recent.map((post) => post.hook || post.content.split("\n")[0] || "").filter(Boolean);
  const grounding = {
    provider: "project",
    title: `${item.campaign.projectName}: ${item.label}`,
    summary: evidenceText,
  };
  let candidates: DualDraft[];
  if (isAiConfigured()) {
    const ctaInstruction = cta.mode === "none"
      ? "Do not include a call to action or link in this stage."
      : `CTA mode: ${cta.mode}. X CTA: ${cta.x ?? "write a restrained matching CTA"}. LinkedIn CTA: ${cta.linkedin ?? "write a restrained matching CTA"}. Destination URL: ${cta.destinationUrl ?? "none"}. Include it only in the final paragraph/post.`;
    const raw = await chatCompletion({
      system: `${style?.systemPrompt || DEFAULT_WRITING_STYLE.systemPrompt}\n\n${style?.rules || DEFAULT_WRITING_STYLE.rules}\n\nYou are writing one stage of a coordinated product campaign. Use only the supplied evidence. Never invent product history, failures, benchmarks, adoption, user results, motivations, or tradeoffs. Do not repeat prior campaign hooks. Write LinkedIn and X independently. ${buildEngagementPrompt(brief)}`,
      user: `Campaign: ${item.campaign.name}\nProduct: ${item.campaign.projectName}\nGoal: ${item.campaign.goal}\nNarrative stage ${item.sequence}: ${item.label}\nPurpose: ${item.purpose}\nPlatforms: ${item.campaign.platforms}\n\nSole factual evidence:\n${evidenceText}\n\n${ctaInstruction}\n\nRecent hooks to avoid:\n${recentHooks.slice(0, 20).join("\n")}\n\nReturn the requested strict two-candidate JSON packs.`,
      temperature: 0.6,
      maxTokens: 2_200,
      json: true,
    });
    candidates = parseDraftCandidates(raw, `${item.campaign.projectName}: ${item.label}`);
  } else {
    candidates = [templateDraft({
      projectName: item.campaign.projectName,
      label: item.label,
      purpose: item.purpose,
      evidenceText,
      ctaText: cta.linkedin || cta.x,
      destinationUrl: cta.destinationUrl,
    })];
  }
  const selected = selectBestDraft(candidates, "", brief, grounding, { recentHooks });
  if (!selected || selected.audit.hardFailures.length) {
    throw new Error(selected?.audit.hardFailures.join("; ") || "Writer returned no grounded campaign draft");
  }
  let { draft, audit } = selected;
  const attributionLinks: Array<{ id: string; platform: string; url: string }> = [];
  if (cta.mode !== "none" && cta.destinationUrl) {
    const platforms = item.campaign.platforms.split(",").filter(
      (platform): platform is "x" | "linkedin" => platform === "x" || platform === "linkedin",
    );
    for (const platform of platforms) {
      const link = await createTrackedLink(userId, {
        label: `${item.campaign.name} · ${item.label} · ${platform.toUpperCase()}`,
        destinationUrl: cta.destinationUrl,
        platform,
        campaignId,
        campaignItemId: item.id,
        ctaVariant: cta.mode,
        ctaPlacement: "final",
      });
      attributionLinks.push({ id: link.id, platform, url: trackedLinkUrl(link.slug) });
    }
    const linkedInUrl = attributionLinks.find((link) => link.platform === "linkedin")?.url;
    const xUrl = attributionLinks.find((link) => link.platform === "x")?.url;
    if (linkedInUrl) {
      const linkedIn = cta.destinationUrl && draft.linkedIn.includes(cta.destinationUrl)
        ? draft.linkedIn.replaceAll(cta.destinationUrl, linkedInUrl)
        : `${draft.linkedIn}\n\n${cta.linkedin || "Learn more:"}\n${linkedInUrl}`;
      draft = { ...draft, linkedIn };
    }
    if (xUrl) {
      const xThread = draft.xThread.map((part) =>
        cta.destinationUrl ? part.replaceAll(cta.destinationUrl, xUrl) : part,
      );
      if (!xThread.some((part) => part.includes(xUrl))) {
        const addition = `${cta.x || "Learn more:"}\n${xUrl}`;
        const lastIndex = xThread.length - 1;
        const combined = `${xThread[lastIndex] || ""}\n\n${addition}`.trim();
        if (combined.length <= 280 && lastIndex >= 0) xThread[lastIndex] = combined;
        else xThread.push(addition);
      }
      draft = { ...draft, xThread: enforceXLimit(xThread) };
    }
    audit = auditDualDraft(draft, brief, grounding);
    if (audit.hardFailures.length) {
      await prisma.trackedLink.deleteMany({ where: { id: { in: attributionLinks.map((link) => link.id) } } });
      throw new Error(audit.hardFailures.join("; "));
    }
  }
  const scores = scoreDualDraft(draft, audit);
  const hash = contentHash(`${draft.linkedIn}\n---\n${draft.xThread.join("\n")}`);
  const duplicate = await prisma.post.findFirst({ where: { userId, contentHash: hash }, select: { id: true } });
  if (duplicate) throw new Error("Campaign draft duplicates an existing post");
  const evidenceUrls = [...new Set(evidenceText.match(/https?:\/\/[^"\s}]+/g) ?? [])];
  const sourceUrl = evidenceUrls[0] || item.campaign.destinationUrl || "";
  const source = await prisma.source.upsert({
    where: { provider_externalId: { provider: "project", externalId: `campaign:${item.campaignId}:${item.id}` } },
    create: {
      provider: "project",
      externalId: `campaign:${item.campaignId}:${item.id}`,
      title: `${item.campaign.projectName}: ${item.label}`,
      url: sourceUrl || "https://github.com",
      summary: evidenceText.slice(0, 2_000),
      score: 400,
      rawJson: JSON.stringify({ campaignId, campaignItemId: item.id, evidence }).slice(0, 50_000),
    },
    update: {
      title: `${item.campaign.projectName}: ${item.label}`,
      url: sourceUrl || "https://github.com",
      summary: evidenceText.slice(0, 2_000),
      rawJson: JSON.stringify({ campaignId, campaignItemId: item.id, evidence }).slice(0, 50_000),
      fetchedAt: new Date(),
    },
  });
  let post: { id: string; experimentVariantId: string | null };
  try {
    post = await prisma.post.create({
      data: {
      userId,
      platform: item.campaign.platforms.includes(",") ? "both" : item.campaign.platforms,
      format: draft.xThread.length > 1 ? "dual-thread" : "dual",
      title: draft.title,
      content: draft.linkedIn,
      contentLinkedIn: draft.linkedIn,
      threadJson: JSON.stringify(draft.xThread),
      status: "pending_review",
      contentHash: hash,
      writingStyleId: style?.id,
      angle: `Campaign · ${item.label}`,
      contentType: contentType.type,
      hook: draft.hook,
      needsImage: false,
      imageSkipReason: "Campaign draft — create a grounded visual after review",
      scoreNovelty: scores.novelty,
      scoreAccuracy: scores.accuracy,
      scoreHook: scores.hook,
      scoreReadability: scores.readability,
      scoreVirality: scores.virality,
      scoreTechnical: scores.technical,
      scoreEngagement: scores.engagement,
      scoreOverall: scores.overall,
      citationsJson: JSON.stringify(evidenceUrls.map((url) => ({ title: item.label, url, provider: "project" }))),
      generationSnapshotJson: JSON.stringify({
        version: 1,
        kind: "campaign",
        campaignId,
        campaignItemId: item.id,
        sequence: item.sequence,
        stage: item.stage,
        goal: item.campaign.goal,
        evidence,
        cta,
        capturedAt: new Date().toISOString(),
      }),
      recommendedMediaType: "branded_visual",
      recommendedMediaTypeX: "branded_visual",
      recommendedMediaTypeLinkedIn:
        item.stage === "decision" || item.stage === "implementation" ? "carousel" : "branded_visual",
      sources: { create: [{ sourceId: source.id }] },
      },
    });
  } catch (error) {
    if (attributionLinks.length) {
      await prisma.trackedLink.deleteMany({ where: { id: { in: attributionLinks.map((link) => link.id) } } });
    }
    throw error;
  }
  if (attributionLinks.length) {
    await prisma.trackedLink.updateMany({
      where: { id: { in: attributionLinks.map((link) => link.id) }, userId },
      data: { postId: post.id, experimentVariantId: post.experimentVariantId },
    });
  }
  await prisma.campaignItem.update({
    where: { id: item.id },
    data: { postId: post.id, status: "drafted", blockReason: null },
  });
  if (item.projectFactId) {
    await prisma.projectFact.updateMany({
      where: { id: item.projectFactId, reviewStatus: "approved" },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }
  if (item.contentSignalId) {
    await prisma.contentSignal.updateMany({
      where: { id: item.contentSignalId, status: "saved" },
      data: { status: "used", usedAt: new Date() },
    });
  }
  return post;
}

function latestSnapshots<T extends { postId: string; platform: string; capturedAt: Date }>(rows: T[]) {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.postId}:${row.platform}`;
    const current = latest.get(key);
    if (!current || row.capturedAt > current.capturedAt) latest.set(key, row);
  }
  return [...latest.values()];
}

export async function getCampaignViews(userId: string) {
  const [campaigns, baselineRows] = await Promise.all([
    prisma.campaign.findMany({
      where: { userId },
      include: {
        items: {
          orderBy: { sequence: "asc" },
          include: {
            post: {
              select: {
                id: true,
                title: true,
                hook: true,
                status: true,
                scoreOverall: true,
                performanceSnapshots: { orderBy: { capturedAt: "desc" } },
              },
            },
          },
        },
        performanceSnapshots: { orderBy: { capturedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.socialPerformanceSnapshot.findMany({
      where: { userId, post: { campaignItem: { is: null } } },
      orderBy: { capturedAt: "desc" },
      take: 500,
    }),
  ]);
  const baselineRecords = latestSnapshots(baselineRows);
  const baselineImpressions = baselineRecords.reduce((sum, row) => sum + row.impressions, 0);
  const baselineEngagements = baselineRecords.reduce(
    (sum, row) => sum + row.likes + row.replies + row.reposts + row.saves + row.linkClicks,
    0,
  );
  const baselineEngagementRate = baselineImpressions > 0
    ? Math.round((baselineEngagements / baselineImpressions) * 10_000) / 100
    : 0;
  return campaigns.map((campaign) => {
    const records = latestSnapshots(
      campaign.items.flatMap((item) => item.post?.performanceSnapshots ?? []),
    );
    const impressions = records.reduce((sum, row) => sum + row.impressions, 0);
    const engagements = records.reduce(
      (sum, row) => sum + row.likes + row.replies + row.reposts + row.saves + row.linkClicks,
      0,
    );
    const latestGoal = campaign.performanceSnapshots.find((row) => row.metric === campaign.goalMetric);
    const baseline = campaign.baselineValue ?? 0;
    const goalDelta = latestGoal ? latestGoal.value - baseline : 0;
    return {
      ...campaign,
      analytics: {
        trackedPlatforms: records.length,
        impressions,
        engagementRate: impressions > 0 ? Math.round((engagements / impressions) * 10_000) / 100 : 0,
        followersGained: records.reduce(
          (sum, row) => sum + (row.followersBefore == null || row.followersAfter == null ? 0 : row.followersAfter - row.followersBefore),
          0,
        ),
        goalValue: latestGoal?.value ?? null,
        goalDelta,
        goalProgress:
          campaign.goalTarget && campaign.goalTarget > baseline
            ? Math.max(0, Math.min(100, Math.round((goalDelta / (campaign.goalTarget - baseline)) * 100)))
            : null,
        baselineTrackedPlatforms: baselineRecords.length,
        baselineEngagementRate,
      },
    };
  });
}
