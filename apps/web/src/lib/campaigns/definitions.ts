export type CampaignGoal =
  | "followers"
  | "github_stars"
  | "awareness"
  | "beta_users"
  | "credibility";

export const CAMPAIGN_GOALS: Record<
  CampaignGoal,
  { label: string; metric: string; ctaMode: string; description: string }
> = {
  followers: {
    label: "Follower growth",
    metric: "followers",
    ctaMode: "follow",
    description: "Build a coherent reason to follow ongoing product work.",
  },
  github_stars: {
    label: "GitHub stars",
    metric: "github_stars",
    ctaMode: "repository",
    description: "Turn verified implementation details into repository interest.",
  },
  awareness: {
    label: "Product awareness",
    metric: "profile_visits",
    ctaMode: "question",
    description: "Explain the product problem and technical point of view.",
  },
  beta_users: {
    label: "Beta users",
    metric: "beta_users",
    ctaMode: "join_waitlist",
    description: "Build trust before inviting qualified early users.",
  },
  credibility: {
    label: "Technical credibility",
    metric: "saves",
    ctaMode: "repository",
    description: "Publish evidence-rich engineering lessons worth saving.",
  },
};

export function isCampaignGoal(value: unknown): value is CampaignGoal {
  return typeof value === "string" && value in CAMPAIGN_GOALS;
}

export interface CampaignEvidenceFact {
  id: string;
  title: string;
  claim: string;
  sourceUrl: string;
}

export interface CampaignEvidenceSignal {
  id: string;
  kind: string;
  text: string;
  sourceUrl?: string | null;
}

export interface CampaignPlanItem {
  sequence: number;
  stage: string;
  label: string;
  purpose: string;
  scheduledFor: Date;
  status: "planned" | "blocked";
  evidenceKind: string;
  projectFactId?: string;
  contentSignalId?: string;
  evidence: Record<string, unknown>;
  cta: Record<string, unknown>;
  blockReason?: string;
}

const STAGES = [
  ["problem", "Problem and constraint", "Name the concrete problem and who experiences it."],
  ["decision", "Architecture decision", "Explain one verified design decision without inventing its history."],
  ["implementation", "Implementation detail", "Teach one distinct implementation detail from repository evidence."],
  ["progress", "Progress update", "Show a separate verified change or release as current progress."],
  ["audience", "Audience question", "Address a real question or objection from a conversation."],
  ["proof", "Evidence or benchmark", "Share measured, release, or benchmark evidence only when it exists."],
  ["recap", "Campaign recap", "Connect the verified lessons and make one goal-specific invitation."],
] as const;

function scheduledDate(startAt: Date, endAt: Date, index: number) {
  const span = Math.max(0, endAt.getTime() - startAt.getTime());
  return new Date(startAt.getTime() + (span * index) / Math.max(1, STAGES.length - 1));
}

function factEvidence(fact: CampaignEvidenceFact) {
  return { facts: [{ title: fact.title, claim: fact.claim, sourceUrl: fact.sourceUrl }] };
}

export function buildCampaignPlan(input: {
  project: { id: string; name: string; repository: string; url: string; description: string };
  facts: CampaignEvidenceFact[];
  signals: CampaignEvidenceSignal[];
  startAt: Date;
  endAt: Date;
  ctaMode: string;
  ctaTextX?: string | null;
  ctaTextLinkedIn?: string | null;
  destinationUrl?: string | null;
}): CampaignPlanItem[] {
  const proof = input.facts.find((fact) =>
    /\b\d+(?:\.\d+)?(?:%|ms|s|x|k|mb|gb)?\b|release|benchmark|measured/i.test(
      `${fact.title} ${fact.claim}`,
    ),
  );
  const factForSequence: Record<number, CampaignEvidenceFact | undefined> = {
    2: input.facts[0],
    3: input.facts[1],
    4: input.facts[2],
    6: proof,
  };

  return STAGES.map(([stage, label, purpose], index) => {
    const sequence = index + 1;
    const base = {
      sequence,
      stage,
      label,
      purpose,
      scheduledFor: scheduledDate(input.startAt, input.endAt, index),
      cta:
        sequence === STAGES.length
          ? {
              mode: input.ctaMode,
              x: input.ctaTextX ?? null,
              linkedin: input.ctaTextLinkedIn ?? null,
              destinationUrl: input.destinationUrl ?? null,
            }
          : stage === "audience"
            ? { mode: "question" }
            : { mode: "none" },
    };

    if (stage === "problem") {
      return {
        ...base,
        status: "planned" as const,
        evidenceKind: "project_context",
        evidence: {
          project: input.project.name,
          repository: input.project.repository,
          url: input.project.url,
          verifiedDescription: input.project.description,
        },
      };
    }
    if (stage === "audience") {
      const signal = input.signals[0];
      if (!signal) {
        return {
          ...base,
          status: "blocked" as const,
          evidenceKind: "audience_signal",
          evidence: {},
          blockReason: "Save a relevant audience question or objection in Distribution first.",
        };
      }
      return {
        ...base,
        status: "planned" as const,
        evidenceKind: "audience_signal",
        contentSignalId: signal.id,
        evidence: { signal },
      };
    }
    if (stage === "recap") {
      if (input.facts.length < 2) {
        return {
          ...base,
          status: "blocked" as const,
          evidenceKind: "fact_bundle",
          evidence: {},
          blockReason: "Approve at least two distinct project facts before drafting a recap.",
        };
      }
      return {
        ...base,
        status: "planned" as const,
        evidenceKind: "fact_bundle",
        evidence: { facts: input.facts.slice(0, 3) },
      };
    }

    const fact = factForSequence[sequence];
    if (!fact) {
      const reason = stage === "proof"
        ? "Approve a release, benchmark, or measured project fact before drafting proof."
        : `Approve a distinct project fact for the ${label.toLowerCase()} stage.`;
      return {
        ...base,
        status: "blocked" as const,
        evidenceKind: "project_fact",
        evidence: {},
        blockReason: reason,
      };
    }
    return {
      ...base,
      status: "planned" as const,
      evidenceKind: "project_fact",
      projectFactId: fact.id,
      evidence: factEvidence(fact),
    };
  });
}

export const CAMPAIGN_STAGE_COUNT = STAGES.length;
