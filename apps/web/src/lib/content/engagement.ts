import type { ContentMixItem } from "@/lib/content/strategy";
import { enforceXLimit, LINKEDIN_MAX, X_CHAR_LIMIT } from "@/lib/content/platforms";

export interface DualDraft {
  title: string;
  hook: string;
  linkedIn: string;
  xThread: string[];
}

export type HookPattern =
  | "build-decision"
  | "technical-tension"
  | "evidence-first"
  | "contrarian"
  | "why-it-matters";

export type EndingPattern = "targeted-question" | "tradeoff-invitation" | "practical-takeaway";

export interface EngagementBrief {
  hookPattern: HookPattern;
  endingPattern: EndingPattern;
  xFormat: "single-insight" | "mini-thread" | "code-or-architecture";
  linkedInStructure: string;
  platformOverrides?: {
    x?: {
      hookPattern?: HookPattern;
      endingPattern?: EndingPattern;
      xFormat?: EngagementBrief["xFormat"];
    };
    linkedin?: {
      hookPattern?: HookPattern;
      endingPattern?: EndingPattern;
    };
  };
}

export interface DraftAudit {
  score: number;
  hardFailures: string[];
  warnings: string[];
  metrics: {
    hook: number;
    specificity: number;
    conversation: number;
    scanability: number;
    platformFit: number;
    originality: number;
  };
}

export interface DraftGrounding {
  provider: string;
  title: string;
  summary?: string | null;
}

const GENERIC_PATTERNS = [
  /\bgame[ -]?changer\b/gi,
  /\brevolutionary\b/gi,
  /\bunlock(?:ing)? (?:the )?(?:power|potential)\b/gi,
  /\bin today'?s (?:fast-paced|rapidly evolving|digital) (?:world|landscape)\b/gi,
  /\bthe future is here\b/gi,
  /\bdelve into\b/gi,
  /\bleverage (?:the power of|cutting-edge)\b/gi,
  /\bexciting times\b/gi,
  /\bworth a look\b/gi,
  /\bthis changes everything\b/gi,
];

const WEAK_OPENING = /^(introducing|check out|just discovered|excited to share|here'?s why|did you know|ever wondered|in today'?s|the future of)\b/i;
const GENERIC_QUESTION = /(?:what do you think|thoughts\??|agree\??|what are your thoughts)\s*$/i;
const PLACEHOLDER = /\b(?:your[_ -]?password|your[_ -]?region|insert here|todo|lorem ipsum|n\/a)\b/i;
const TECHNICAL_SIGNAL = /\b(?:api|latency|cache|database|postgres|typescript|python|next\.js|react|node|serverless|queue|retry|idempot|schema|token|model|agent|inference|benchmark|throughput|memory|process|ipc|oauth|auth|stream|context|tool|prisma|supabase|mlx|vscode|github)\b/gi;
const UNSUPPORTED_HISTORY = /\b(?:early on|at first|initially|from day one|from the start|we used to|after (?:it|the|a) failed|meant restarting)\b/i;
const UNSUPPORTED_CAUSAL = /\b(?:this|that) (?:forced|caused|led to|meant)\b/i;
const UNSUPPORTED_ABSOLUTE = /\b(?:no|zero) (?:overhead|latency|cost|failures?|tradeoffs?)\b/i;
const UNSUPPORTED_TRADEOFF = /\b(?:forces? tradeoffs?|tradeoff accepted|optimized? independently|more [^.]{0,80} to maintain|monolith[^.]{0,100}compromise)\b/i;
const APPROVAL_IMPLIES_AUTOPUBLISH = /\b(?:never|does not|doesn't) (?:automatically )?posts?[^.]{0,100}\bwithout (?:human )?approval\b/i;
const OPTIONAL_SCREENSHOT_ASSERTION = /\b(?:screenshots?|captures?|images?|cloudflare r2)\b[^.]{0,140}\b(?:captur(?:e|es|ed)|stor(?:e|es|ed))\b|\b(?:captur(?:e|es|ed)|stor(?:e|es|ed))\b[^.]{0,140}\b(?:screenshots?|images?|cloudflare r2)\b/i;
const MODAL_QUALIFIER = /\b(?:optional(?:ly)?|can|could|may|might|if|when requested|on demand)\b/i;

/**
 * Architecture concepts are only safe when the selected owned-project source
 * explicitly contains the same concept. This catches plausible-sounding
 * internals such as "schema-aware context" or "diff-aware prompts" that a
 * model may infer from a product's responsibility but the repository facts do
 * not actually establish.
 */
const PROJECT_TECH_CONCEPTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "prompt", pattern: /\bprompts?\b/i },
  { label: "evaluation", pattern: /\bevaluat(?:e|es|ed|ion|ions)\b/i },
  { label: "schema", pattern: /\bschemas?\b/i },
  { label: "diff", pattern: /\bdiffs?\b/i },
  { label: "context", pattern: /\bcontexts?\b/i },
  { label: "routing", pattern: /\b(?:router|routers|routing|routes?)\b/i },
  { label: "monolith", pattern: /\bmonolith(?:ic)?\b/i },
  { label: "microservice", pattern: /\bmicroservices?\b/i },
  { label: "cache", pattern: /\bcach(?:e|es|ed|ing)\b/i },
  { label: "queue", pattern: /\bqueues?\b/i },
  { label: "database", pattern: /\bdatabases?\b/i },
  { label: "webhook", pattern: /\bwebhooks?\b/i },
  { label: "embedding", pattern: /\bembeddings?\b/i },
  { label: "vector", pattern: /\bvectors?\b/i },
  { label: "model", pattern: /\bmodels?\b/i },
  { label: "server", pattern: /\bservers?\b/i },
  { label: "process", pattern: /\bprocess(?:es)?\b/i },
  { label: "worker", pattern: /\bworkers?\b/i },
  { label: "API", pattern: /\bapis?\b/i },
  { label: "HTTP", pattern: /\bhttp\b/i },
  { label: "IPC", pattern: /\bipc\b/i },
  { label: "retry", pattern: /\bretr(?:y|ies|ied)\b/i },
  { label: "token", pattern: /\btokens?\b/i },
  { label: "latency", pattern: /\blatency\b/i },
  { label: "streaming", pattern: /\bstream(?:s|ed|ing)?\b/i },
  { label: "cancellation", pattern: /\bcancel(?:s|led|lation|-on-type)?\b/i },
  { label: "benchmark", pattern: /\bbenchmarks?\b/i },
  { label: "metric", pattern: /\bmetrics?\b/i },
  { label: "state machine", pattern: /\bstate machines?\b/i },
  { label: "screenshot", pattern: /\bscreenshots?\b/i },
  { label: "Cloudflare R2", pattern: /\b(?:cloudflare )?r2\b/i },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

function sanitizePlatformText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 — $2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unsupportedProjectConcepts(
  claimText: string,
  sourceFacts: string,
): string[] {
  return PROJECT_TECH_CONCEPTS.filter(
    ({ pattern }) => pattern.test(claimText) && !pattern.test(sourceFacts),
  ).map(({ label }) => label);
}

function sourceRequiresManualPosting(sourceFacts: string): boolean {
  return (
    /manual posting/i.test(sourceFacts) ||
    /creator posts?[^.]{0,80}\bmanually\b/i.test(sourceFacts) ||
    /never publishes? to x or linkedin/i.test(sourceFacts)
  );
}

function hasUnsupportedProjectClaim(
  sentence: string,
  sourceFacts?: string,
): boolean {
  if (!sourceFacts) return false;
  return (
    unsupportedProjectConcepts(sentence, sourceFacts).length > 0 ||
    (UNSUPPORTED_TRADEOFF.test(sentence) && !UNSUPPORTED_TRADEOFF.test(sourceFacts)) ||
    (APPROVAL_IMPLIES_AUTOPUBLISH.test(sentence) && sourceRequiresManualPosting(sourceFacts)) ||
    (OPTIONAL_SCREENSHOT_ASSERTION.test(sentence) &&
      /optional screenshot|can store/i.test(sourceFacts) &&
      !MODAL_QUALIFIER.test(sentence))
  );
}

function stripUnsafeNarrative(text: string, sourceFacts?: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter(
          (sentence) =>
            !UNSUPPORTED_HISTORY.test(sentence) &&
            !UNSUPPORTED_CAUSAL.test(sentence) &&
            !UNSUPPORTED_ABSOLUTE.test(sentence) &&
            !hasUnsupportedProjectClaim(sentence, sourceFacts),
        )
        .join(" "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function repairUnsafeProjectNarrative(
  draft: DualDraft,
  grounding: DraftGrounding,
): DualDraft {
  const sourceFacts = `${grounding.title} ${grounding.summary || ""}`.toLowerCase();
  return {
    ...draft,
    hook: stripUnsafeNarrative(draft.hook, sourceFacts),
    linkedIn: stripUnsafeNarrative(draft.linkedIn, sourceFacts),
    xThread: draft.xThread
      .map((part) => stripUnsafeNarrative(part, sourceFacts))
      .filter(Boolean),
  };
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9+#.]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function jaccard(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function maxTextSimilarity(text: string, previous: string[]): number {
  return previous.reduce((highest, candidate) => Math.max(highest, jaccard(text, candidate)), 0);
}

export function engagementBriefForSlot(
  slotIndex: number,
  contentType: ContentMixItem,
): EngagementBrief {
  const hookByType: Record<ContentMixItem["type"], HookPattern> = {
    project_lesson: "build-decision",
    architecture_breakdown: "technical-tension",
    evidence_opinion: "contrarian",
    experiment_benchmark: "evidence-first",
    curated_discovery: "why-it-matters",
  };
  const endings: EndingPattern[] = [
    "targeted-question",
    "practical-takeaway",
    "tradeoff-invitation",
  ];
  const xFormats: EngagementBrief["xFormat"][] = [
    "single-insight",
    "mini-thread",
    "code-or-architecture",
  ];
  const structures = [
    "tension → concrete decision or evidence → reusable lesson → focused close",
    "specific observation → how it works → tradeoff → practical implication",
    "common assumption → source-backed correction → example → focused close",
  ];

  return {
    hookPattern: hookByType[contentType.type],
    endingPattern: endings[slotIndex % endings.length]!,
    xFormat: xFormats[slotIndex % xFormats.length]!,
    linkedInStructure: structures[slotIndex % structures.length]!,
  };
}

export function buildEngagementPrompt(brief: EngagementBrief): string {
  const endingInstruction = (pattern: EndingPattern) => ({
    "targeted-question":
      "End with one specific question about the engineering tradeoff. Never use 'Thoughts?' or 'What do you think?',",
    "tradeoff-invitation":
      "Close by inviting engineers to compare one named tradeoff or implementation choice; do not ask a generic engagement question.",
    "practical-takeaway":
      "Close with a concise action or diagnostic the reader can apply. Do not force a question.",
  })[pattern];
  const linkedInHook = brief.platformOverrides?.linkedin?.hookPattern ?? brief.hookPattern;
  const xHook = brief.platformOverrides?.x?.hookPattern ?? brief.hookPattern;
  const linkedInEnding = brief.platformOverrides?.linkedin?.endingPattern ?? brief.endingPattern;
  const xEnding = brief.platformOverrides?.x?.endingPattern ?? brief.endingPattern;
  const xFormat = brief.platformOverrides?.x?.xFormat ?? brief.xFormat;

  return `Engagement playbook for this slot:
- LinkedIn hook pattern: ${linkedInHook}. X hook pattern: ${xHook}. Each first line must expose a real constraint, decision, result, or surprising implication in under 140 characters.
- LinkedIn structure: ${brief.linkedInStructure}.
- LinkedIn should be 450–1,400 characters, use short paragraphs, and put a concrete technical detail within the first three lines.
- LinkedIn close: ${endingInstruction(linkedInEnding)}
- X close: ${endingInstruction(xEnding)}
- X format: ${xFormat}. Prefer one strong standalone post when the idea fits; use a 2–3 post thread only when each post advances the explanation.
- The first X post must stand alone. Never open with "Thread", a topic label, or a vague teaser.
- Write X and LinkedIn independently for their platforms. Do not split or compress the LinkedIn copy into tweets.
- Use zero hashtags by default and no more than one when genuinely useful. No engagement bait.
- Treat the selected source as the sole factual basis. Other project descriptions are positioning context, not facts to merge into this post.
- For an owned-project source, first-person builder framing such as "I'm building..." is allowed. Keep every architecture claim tied to the supplied project description.
- An architecture breakdown is not permission to infer internals. If the source only lists product boundaries or responsibilities, explain only those boundaries. Do not invent prompts, evaluations, schemas, diffs, context assembly, routing, models, services, maintenance costs, or optimization choices.
- Preserve factual modality. "Optional", "can", "may", and "target" must never become a guaranteed action or result.
- Manual approval and manual posting are separate boundaries. Never write "the app does not post without approval", because that implies approval can trigger publishing. If the source says posting is manual, say the app never publishes and the creator posts manually.
- Never use "we", "our", or "us" for an owned project; this is an individual creator account. Use "I" only for the supplied builder context, or name the project directly.
- Do not infer a before/after story from an architecture description. Never invent an earlier failure, a fix, a database field, an enum, a retry counter, cost savings, speedup, benchmark, or outcome.
- Do not use causal history such as "designed from day one", "this forced", or "this led to" unless that relationship is explicitly supplied. Describe independently verified design choices without inventing why they happened.
- Avoid absolutes such as "no overhead" or "zero latency". Name the specific boundary or overhead that the design avoids.
- Before returning JSON, silently verify every sentence against the selected source. If an outcome is not supplied, describe the design and its purpose—not a result that supposedly happened.

Generate TWO distinct candidate packs from the same facts:
- Candidate A: insight-first and concise.
- Candidate B: tension/tradeoff-first with a different hook and structure.

Return strict JSON only:
{"candidates":[{"title":"...","hook":"...","linkedin":"...","xThread":["..."]},{"title":"...","hook":"...","linkedin":"...","xThread":["..."]}]}`;
}

function draftFromUnknown(value: unknown, fallbackTitle: string): DualDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const linkedInValue = row.linkedin ?? row.linkedIn ?? row.content;
  if (typeof linkedInValue !== "string" || !linkedInValue.trim()) return null;
  const threadValue = row.xThread ?? row.threadParts;
  const xThread = Array.isArray(threadValue)
    ? threadValue.filter((part): part is string => typeof part === "string")
    : [];
  const linkedIn = linkedInValue.trim();
  return {
    title:
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim().slice(0, 120)
        : fallbackTitle.slice(0, 120),
    hook:
      typeof row.hook === "string" && row.hook.trim()
        ? row.hook.trim()
        : linkedIn.split("\n")[0]?.trim() || fallbackTitle,
    linkedIn,
    xThread,
  };
}

export function parseDraftCandidates(raw: string, fallbackTitle: string): DualDraft[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const values = Array.isArray(parsed.candidates) ? parsed.candidates : [parsed];
    return values
      .map((value) => draftFromUnknown(value, fallbackTitle))
      .filter((draft): draft is DualDraft => draft !== null)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export function normalizeDraft(draft: DualDraft, sourceUrl: string): DualDraft {
  let xThread = enforceXLimit(draft.xThread.map(sanitizePlatformText));
  if (xThread.length === 0) {
    xThread = enforceXLimit([draft.hook || draft.linkedIn.split("\n")[0] || draft.title]);
  }

  if (sourceUrl && !xThread.some((part) => part.includes(sourceUrl))) {
    const lastIndex = xThread.length - 1;
    const last = xThread[lastIndex] || "";
    const withUrl = `${last}\n\n${sourceUrl}`.trim();
    if (withUrl.length <= X_CHAR_LIMIT) xThread[lastIndex] = withUrl;
    else xThread.push(sourceUrl);
  }

  let linkedIn = sanitizePlatformText(draft.linkedIn.replace(/\r\n/g, "\n"));
  let firstLine = linkedIn.split("\n").find((line) => line.trim())?.trim();
  const suppliedHook = sanitizePlatformText(draft.hook);
  if (
    firstLine &&
    (firstLine.length > 140 || firstLine.length < 12) &&
    suppliedHook.length >= 12 &&
    suppliedHook.length <= 140
  ) {
    linkedIn = linkedIn.replace(firstLine, suppliedHook);
    firstLine = suppliedHook;
  }
  return {
    title: draft.title.trim().slice(0, 120),
    hook: firstLine || draft.hook.trim() || draft.title.trim(),
    linkedIn,
    xThread: enforceXLimit(xThread),
  };
}

export function auditDualDraft(
  draft: DualDraft,
  brief: EngagementBrief,
  grounding?: DraftGrounding,
): DraftAudit {
  const hardFailures: string[] = [];
  const warnings: string[] = [];
  const linkedIn = draft.linkedIn.trim();
  const firstLine = linkedIn.split("\n").find((line) => line.trim())?.trim() || "";
  const finalParagraph = linkedIn.split(/\n\s*\n/).filter(Boolean).at(-1)?.trim() || "";
  const allText = `${linkedIn}\n${draft.xThread.join("\n")}`;
  const genericCount = countMatches(allText, GENERIC_PATTERNS);
  const hashtags = allText.match(/(^|\s)#[a-z0-9_]+/gi)?.length ?? 0;
  const technicalSignals = allText.match(TECHNICAL_SIGNAL)?.length ?? 0;
  const concreteSignals = (allText.match(/\b\d+(?:\.\d+)?(?:%|ms|s|x|k|mb|gb|tokens?)?\b/gi)?.length ?? 0) +
    (allText.match(/`[^`]+`|→|->|\b[A-Z][A-Za-z]+\.[a-zA-Z]+\b/g)?.length ?? 0);
  const paragraphs = linkedIn.split(/\n\s*\n/).filter((part) => part.trim()).length;
  const maxTweet = Math.max(0, ...draft.xThread.map((part) => part.length));
  const similarity = jaccard(linkedIn, draft.xThread.join(" "));
  const targetedQuestion = finalParagraph.includes("?") && !GENERIC_QUESTION.test(finalParagraph);

  if (linkedIn.length < 350) hardFailures.push("LinkedIn draft is too short to teach a useful lesson");
  if (linkedIn.length > LINKEDIN_MAX) hardFailures.push("LinkedIn draft exceeds the platform limit");
  if (draft.xThread.length === 0) hardFailures.push("X draft is missing");
  if (draft.xThread.length > 8) hardFailures.push("X thread is longer than eight posts");
  if (maxTweet > X_CHAR_LIMIT) hardFailures.push("An X post exceeds 280 characters");
  if (PLACEHOLDER.test(allText)) hardFailures.push("Draft contains placeholder text");
  if (firstLine.length < 12) hardFailures.push("Opening line is too short to work as a hook");
  if (firstLine.length > 240) hardFailures.push("Opening line is too long to work as a hook");
  if (genericCount >= 3) hardFailures.push("Draft relies on generic AI or marketing language");

  if (grounding?.provider === "project") {
    const sourceFacts = `${grounding.title} ${grounding.summary || ""}`.toLowerCase();
    const claimText = allText.replace(/https?:\/\/\S+/g, " ");
    if (/\b(?:we|our|us)\b/i.test(claimText)) {
      hardFailures.push("Owned-project draft uses collective voice instead of the creator's voice");
    }
    if (UNSUPPORTED_HISTORY.test(claimText)) {
      hardFailures.push("Owned-project draft invents an unsupported historical failure story");
    }
    if (UNSUPPORTED_CAUSAL.test(claimText)) {
      hardFailures.push("Owned-project draft invents an unsupported causal relationship");
    }
    if (UNSUPPORTED_ABSOLUTE.test(claimText)) {
      hardFailures.push("Owned-project draft makes an unsupported absolute performance claim");
    }
    if (UNSUPPORTED_TRADEOFF.test(claimText) && !UNSUPPORTED_TRADEOFF.test(sourceFacts)) {
      hardFailures.push("Owned-project draft invents an unsupported maintenance or tradeoff claim");
    }
    if (
      APPROVAL_IMPLIES_AUTOPUBLISH.test(claimText) &&
      sourceRequiresManualPosting(sourceFacts)
    ) {
      hardFailures.push("Owned-project draft incorrectly implies approval can trigger publishing");
    }
    const screenshotAssertions = claimText
      .split(/(?<=[.!?])\s+/)
      .filter(
        (sentence) =>
          OPTIONAL_SCREENSHOT_ASSERTION.test(sentence) &&
          !MODAL_QUALIFIER.test(sentence),
      );
    if (
      screenshotAssertions.length &&
      /optional screenshot|can store/i.test(sourceFacts)
    ) {
      hardFailures.push("Owned-project draft turns optional screenshot storage into a guaranteed step");
    }

    const unsupportedConcepts = unsupportedProjectConcepts(claimText, sourceFacts);
    if (unsupportedConcepts.length) {
      hardFailures.push(
        `Owned-project draft invents unsupported architecture concepts: ${unsupportedConcepts.join(", ")}`,
      );
    }

    const sourceNumbers = new Set(sourceFacts.match(/\b\d+(?:\.\d+)?\b/g) ?? []);
    const unsupportedNumbers = [...new Set(claimText.match(/\b\d+(?:\.\d+)?\b/g) ?? [])].filter(
      (value) => !sourceNumbers.has(value),
    );
    if (unsupportedNumbers.length) {
      hardFailures.push(`Owned-project draft introduces unsupported numbers: ${unsupportedNumbers.join(", ")}`);
    }

    const codeIdentifiers = [
      ...new Set(
        claimText.match(/\b(?:[a-z][a-z0-9]*_[a-z0-9_]+|[a-z]+(?:[A-Z][a-z0-9]+)+)\b/g) ?? [],
      ),
    ];
    const unsupportedIdentifiers = codeIdentifiers.filter((identifier) => {
      const normalized = identifier.toLowerCase();
      const negated = new RegExp(
        `\\b(?:does not|doesn't|not|never|no)\\b[^.]{0,120}\\b${escapeRegExp(normalized)}\\b`,
        "i",
      ).test(sourceFacts);
      return !sourceFacts.includes(normalized) || negated;
    });
    if (unsupportedIdentifiers.length) {
      hardFailures.push(
        `Owned-project draft invents schema or code identifiers: ${unsupportedIdentifiers.join(", ")}`,
      );
    }
  }

  if (WEAK_OPENING.test(firstLine)) warnings.push("Opening uses a generic lead-in");
  if (firstLine.length > 140) warnings.push("Opening is longer than the target 140 characters");
  if (genericCount > 0) warnings.push(`${genericCount} generic phrase(s) detected`);
  if (hashtags > 1) warnings.push("Too many hashtags");
  if (paragraphs < 4) warnings.push("LinkedIn post needs more scannable paragraph breaks");
  if (similarity > 0.78) warnings.push("X reads like compressed LinkedIn copy");
  if (GENERIC_QUESTION.test(finalParagraph)) warnings.push("Closing question is generic engagement bait");
  if (brief.endingPattern === "targeted-question" && !targetedQuestion) {
    warnings.push("Missing the requested targeted closing question");
  }

  let hook = 6;
  if (firstLine.length >= 25 && firstLine.length <= 140) hook += 1.5;
  if (/\b(?:but|until|instead|without|cost|tradeoff|faster|slower|failed|problem|constraint)\b/i.test(firstLine)) hook += 0.8;
  if (WEAK_OPENING.test(firstLine)) hook -= 2.5;
  if (firstLine.endsWith(":")) hook -= 0.5;

  const specificity = clamp(4.8 + Math.min(technicalSignals, 8) * 0.35 + Math.min(concreteSignals, 5) * 0.6 - genericCount);
  const conversation = clamp(
    brief.endingPattern === "targeted-question"
      ? targetedQuestion
        ? 9
        : 4.5
      : GENERIC_QUESTION.test(finalParagraph)
        ? 3.5
        : finalParagraph.length >= 35
          ? 8
          : 6,
  );
  const scanability = clamp(5.5 + Math.min(paragraphs, 8) * 0.45 - (paragraphs < 4 ? 1 : 0));
  const platformFit = clamp(
    9 -
      (maxTweet > X_CHAR_LIMIT ? 5 : 0) -
      Math.max(0, draft.xThread.length - 3) * 0.8 -
      (hashtags > 1 ? 1.5 : 0) -
      (linkedIn.length < 450 ? 1 : 0),
  );
  const originality = clamp(8.5 - genericCount * 1.4 - (similarity > 0.78 ? 1.5 : 0));
  const metrics = {
    hook: clamp(hook),
    specificity,
    conversation,
    scanability,
    platformFit,
    originality,
  };
  const score = clamp(
    metrics.hook * 0.22 +
      metrics.specificity * 0.22 +
      metrics.conversation * 0.14 +
      metrics.scanability * 0.12 +
      metrics.platformFit * 0.18 +
      metrics.originality * 0.12 -
      hardFailures.length * 1.5,
  );

  return { score, hardFailures, warnings, metrics };
}

export function selectBestDraft(
  candidates: DualDraft[],
  sourceUrl: string,
  brief: EngagementBrief,
  grounding?: DraftGrounding,
  options: { recentHooks?: string[] } = {},
): { draft: DualDraft; audit: DraftAudit } | null {
  const ranked = candidates
    .map((candidate) => {
      let draft = normalizeDraft(candidate, sourceUrl);
      let audit = auditDualDraft(draft, brief, grounding);
      const hasRepairableNarrative = audit.hardFailures.some(
        (failure) =>
          failure.includes("historical failure") ||
          failure.includes("causal relationship") ||
          failure.includes("absolute performance") ||
          failure.includes("maintenance or tradeoff") ||
          failure.includes("unsupported architecture concepts") ||
          failure.includes("approval can trigger publishing") ||
          failure.includes("optional screenshot storage"),
      );
      if (grounding?.provider === "project" && hasRepairableNarrative) {
        const repairedDraft = normalizeDraft(
          repairUnsafeProjectNarrative(draft, grounding),
          sourceUrl,
        );
        const repairedAudit = auditDualDraft(repairedDraft, brief, grounding);
        if (repairedAudit.hardFailures.length < audit.hardFailures.length) {
          repairedAudit.warnings.unshift("Removed unsupported project narrative before scoring");
          draft = repairedDraft;
          audit = repairedAudit;
        }
      }
      const hookSimilarity = maxTextSimilarity(
        draft.hook,
        options.recentHooks ?? [],
      );
      if (hookSimilarity > 0.72) {
        audit.hardFailures.push(
          `Hook repeats a recent post (${Math.round(hookSimilarity * 100)}% similar)`,
        );
      }
      return { draft, audit };
    })
    .sort((a, b) => {
      if (a.audit.hardFailures.length !== b.audit.hardFailures.length) {
        return a.audit.hardFailures.length - b.audit.hardFailures.length;
      }
      return b.audit.score - a.audit.score;
    });
  return ranked[0] ?? null;
}
