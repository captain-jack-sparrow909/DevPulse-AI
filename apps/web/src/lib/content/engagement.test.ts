import assert from "node:assert/strict";
import test from "node:test";
import { scoreDualDraft } from "@/lib/ai/scoring";
import { DEFAULT_CONTENT_STRATEGY, projectSources } from "@/lib/content/strategy";
import {
  auditDualDraft,
  engagementBriefForSlot,
  maxTextSimilarity,
  normalizeDraft,
  parseDraftCandidates,
  selectBestDraft,
  type DualDraft,
} from "@/lib/content/engagement";

const projectLesson = DEFAULT_CONTENT_STRATEGY.contentMix[0]!;
const sourceUrl = "https://github.com/captain-jack-sparrow909/IntelliTab";

const strongDraft: DualDraft = {
  title: "Removing HTTP from local code completion",
  hook: "The fastest local code-completion request may be the one that never touches HTTP.",
  linkedIn: `The fastest local code-completion request may be the one that never touches HTTP.

IntelliTab keeps a Python MLX process alive and talks to it from the VS Code extension through length-prefixed JSON over stdin and stdout.

That boundary removes REST startup and serialization overhead from the hot path. It also makes cancellation, streaming, and progressive rendering explicit parts of the protocol instead of incidental UI behavior.

The reusable lesson is not “always avoid HTTP.” It is to make the latency budget decide the process boundary. A local, single-client tool has different constraints from a shared network service.

If you were optimizing this loop, would you spend the next latency budget on context selection or decoding?`,
  xThread: [
    "The fastest local code-completion request may be the one that never touches HTTP.",
    "IntelliTab keeps MLX warm behind length-prefixed stdin/stdout IPC. That makes streaming and cancel-on-type part of the protocol—and keeps REST overhead out of the hot path.",
  ],
};

test("engagement brief varies format while respecting the content type", () => {
  const first = engagementBriefForSlot(0, projectLesson);
  const second = engagementBriefForSlot(1, projectLesson);
  assert.equal(first.hookPattern, "build-decision");
  assert.notEqual(first.endingPattern, second.endingPattern);
  assert.notEqual(first.xFormat, second.xFormat);
});

test("candidate parser accepts the Phase 3 two-pack response", () => {
  const raw = JSON.stringify({ candidates: [strongDraft, { ...strongDraft, title: "Variant B" }] });
  const parsed = parseDraftCandidates(raw, "Fallback");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1]?.title, "Variant B");
});

test("normalization enforces X limits and adds the source citation", () => {
  const normalized = normalizeDraft(
    { ...strongDraft, xThread: ["A concrete technical point. ".repeat(20)] },
    sourceUrl,
  );
  assert.ok(normalized.xThread.every((part) => part.length <= 280));
  assert.ok(normalized.xThread.some((part) => part.includes(sourceUrl)));
});

test("normalization removes Markdown link syntax unsupported by X", () => {
  const normalized = normalizeDraft(
    {
      ...strongDraft,
      xThread: [`[IntelliTab](${sourceUrl}) keeps inference local.`],
    },
    sourceUrl,
  );
  assert.ok(!normalized.xThread.join(" ").includes("[IntelliTab]("));
  assert.ok(normalized.xThread.join(" ").includes(sourceUrl));
});

test("normalization replaces an overlong opening with the supplied concise hook", () => {
  const longOpening = "A very long opening that buries the actual point before the reader can understand the tradeoff. ".repeat(3).trim();
  const normalized = normalizeDraft(
    {
      ...strongDraft,
      hook: "Native IPC removes an avoidable network boundary from local code completion.",
      linkedIn: `${longOpening}\n\n${strongDraft.linkedIn}`,
    },
    sourceUrl,
  );
  assert.equal(
    normalized.linkedIn.split("\n")[0],
    "Native IPC removes an avoidable network boundary from local code completion.",
  );
});

test("audit rejects short, generic, placeholder-filled drafts", () => {
  const brief = engagementBriefForSlot(0, projectLesson);
  const weak = normalizeDraft(
    {
      title: "Game changer",
      hook: "Introducing a game changer",
      linkedIn:
        "Introducing a game changer. Unlock the power of AI in today's fast-paced digital landscape. The future is here. YOUR_PASSWORD. Thoughts?",
      xThread: ["This changes everything. Thoughts?"],
    },
    sourceUrl,
  );
  const audit = auditDualDraft(weak, brief);
  assert.ok(audit.hardFailures.length >= 3);
  assert.ok(audit.score < 5);
});

test("selector chooses the concrete platform-native candidate", () => {
  const brief = engagementBriefForSlot(0, projectLesson);
  const paddedWeak: DualDraft = {
    title: "The future of AI",
    hook: "Introducing the future of AI",
    linkedIn: `Introducing the future of AI.

This game-changer will unlock the power of cutting-edge technology for everyone.

It is revolutionary, exciting, and worth a look for anyone navigating today's rapidly evolving landscape.

The future is here, and this changes everything for software engineering teams everywhere.

What do you think?`,
    xThread: ["This game-changer changes everything. What do you think?"],
  };
  const selected = selectBestDraft([paddedWeak, strongDraft], sourceUrl, brief);
  assert.equal(selected?.draft.title, strongDraft.title);
  assert.equal(selected?.audit.hardFailures.length, 0);
});

test("dual quality score includes the engagement audit", () => {
  const brief = engagementBriefForSlot(0, projectLesson);
  const normalized = normalizeDraft(strongDraft, sourceUrl);
  const audit = auditDualDraft(normalized, brief);
  const score = scoreDualDraft(normalized, audit);
  assert.ok(score.hook >= 7);
  assert.ok(score.engagement >= 6.5);
  assert.ok(score.overall >= 6.5);
});

test("near-duplicate hook similarity catches recycled openings", () => {
  const similarity = maxTextSimilarity(
    "The fastest code completion request may be the one that never touches HTTP",
    [
      "A useful database migration lesson",
      "The fastest code completion request is the one that never reaches HTTP",
    ],
  );
  assert.ok(similarity > 0.7);
});

test("owned-project grounding rejects fabricated history and schema fields", () => {
  const source = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:devpulse-ai:phased-execution",
  )!;
  const fabricated = normalizeDraft(
    {
      title: "Resumable cron phases",
      hook: "Early on, our third cron phase forced every failed run to restart.",
      linkedIn: `Early on, our third cron phase forced every failed run to restart.

We added a retry_count column and a phase enum to Postgres after phase 3 failed.

Now our pipeline resumes from phase 1, saves API costs, and avoids expensive recomputation.

The lesson is to persist every transition before moving to the next phase.`,
      xThread: [
        "Early on, our phase 3 failures restarted phase 1.",
        "We fixed it with a retry_count column.",
      ],
    },
    source.url,
  );
  const brief = engagementBriefForSlot(0, projectLesson);
  const audit = auditDualDraft(fabricated, brief, {
    provider: source.provider,
    title: source.title,
    summary: source.summary,
  });
  assert.ok(audit.hardFailures.some((failure) => failure.includes("collective voice")));
  assert.ok(audit.hardFailures.some((failure) => failure.includes("historical failure")));
  assert.ok(audit.hardFailures.some((failure) => failure.includes("unsupported numbers")));
  assert.ok(audit.hardFailures.some((failure) => failure.includes("retry_count")));
});

test("IntelliTab verified facts include its documented 4-bit default model", () => {
  const source = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:intellitab:local-model-target",
  );
  assert.match(source?.summary || "", /Qwen2\.5-Coder-3B base in 4-bit form/);
});

test("owned-project grounding rejects invented causal history and no-overhead claims", () => {
  const source = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:intellitab:native-ipc",
  )!;
  const draft = normalizeDraft(
    {
      ...strongDraft,
      linkedIn: `IntelliTab uses native IPC between VS Code and a persistent MLX process.

There is no HTTP and no overhead in the completion path.

Dual-model routing and speculative decoding were designed in from day one.

This forced a clean separation between the extension and the Python process.`,
    },
    source.url,
  );
  const audit = auditDualDraft(draft, engagementBriefForSlot(0, projectLesson), {
    provider: source.provider,
    title: source.title,
    summary: source.summary,
  });
  assert.ok(audit.hardFailures.some((failure) => failure.includes("historical failure")));
  assert.ok(audit.hardFailures.some((failure) => failure.includes("causal relationship")));
  assert.ok(audit.hardFailures.some((failure) => failure.includes("absolute performance")));
});

test("Röntgen grounding rejects inferred prompts, context, evaluations, and tradeoffs", () => {
  const source = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:rontgen-ai:product-map",
  )!;
  const reportedDraft = normalizeDraft(
    {
      title: "Six products instead of one AI chat",
      hook: "One AI chat that does everything forces tradeoffs in every feature.",
      linkedIn: `One AI chat that does everything — code review, SQL queries, repo docs, PR automation — sounds clean but forces tradeoffs in every feature.

Röntgen AI splits into six products: Blueprint (architecture review), Pulse (spreadsheet and SQL chat), Atlas (repository explanation), Sentinel (PR review), Forge (issue-to-PR), and Radar (incident RCA).

Each gets its own prompt strategy and evaluation.

Tradeoff accepted: more products to maintain, but each can be optimized independently. Pulse needs schema-aware context; Sentinel needs diff-aware prompts. A monolith would compromise both.`,
      xThread: [
        "Each Röntgen product gets its own prompt strategy and evaluation.",
        "Pulse needs schema-aware context; Sentinel needs diff-aware prompts.",
        "More products to maintain, but each can be optimized independently.",
      ],
    },
    source.url,
  );
  const audit = auditDualDraft(
    reportedDraft,
    engagementBriefForSlot(0, projectLesson),
    { provider: source.provider, title: source.title, summary: source.summary },
  );

  assert.ok(
    audit.hardFailures.some((failure) =>
      failure.includes("unsupported architecture concepts"),
    ),
  );
  assert.ok(
    audit.hardFailures.some((failure) =>
      failure.includes("maintenance or tradeoff"),
    ),
  );
  assert.match(audit.hardFailures.join(" "), /prompt/);
  assert.match(audit.hardFailures.join(" "), /schema/);
  assert.match(audit.hardFailures.join(" "), /diff/);
});

test("DevPulse grounding preserves manual publishing and optional screenshot modality", () => {
  const sources = projectSources(DEFAULT_CONTENT_STRATEGY);
  const publishing = sources.find(
    (item) => item.externalId === "owned:devpulse-ai:manual-publishing",
  )!;
  const media = sources.find(
    (item) => item.externalId === "owned:devpulse-ai:optional-media",
  )!;
  const misleadingPublishing = normalizeDraft(
    {
      ...strongDraft,
      linkedIn: `${strongDraft.linkedIn}\n\nDevPulse AI never posts without human approval.`,
      xThread: ["DevPulse AI never posts without human approval."],
    },
    publishing.url,
  );
  const guaranteedMedia = normalizeDraft(
    {
      ...strongDraft,
      linkedIn: `${strongDraft.linkedIn}\n\nScreenshots are captured separately and stored in Cloudflare R2 after generation.`,
      xThread: ["Screenshots are captured separately and stored in Cloudflare R2."],
    },
    media.url,
  );
  const publishingAudit = auditDualDraft(
    misleadingPublishing,
    engagementBriefForSlot(0, projectLesson),
    { provider: publishing.provider, title: publishing.title, summary: publishing.summary },
  );
  const mediaAudit = auditDualDraft(
    guaranteedMedia,
    engagementBriefForSlot(0, projectLesson),
    { provider: media.provider, title: media.title, summary: media.summary },
  );
  assert.ok(
    publishingAudit.hardFailures.some((failure) =>
      failure.includes("approval can trigger publishing"),
    ),
  );
  assert.ok(
    mediaAudit.hardFailures.some((failure) =>
      failure.includes("optional screenshot storage"),
    ),
  );
});

test("candidate selection considers alternate hooks before abandoning a source", () => {
  const repeated = strongDraft;
  const alternateHook = "Native IPC changes which boundary owns a local completion request.";
  const alternate: DualDraft = {
    ...strongDraft,
    title: "A different IntelliTab angle",
    hook: alternateHook,
    linkedIn: strongDraft.linkedIn.replace(strongDraft.hook, alternateHook),
  };
  const selected = selectBestDraft(
    [repeated, alternate],
    sourceUrl,
    engagementBriefForSlot(0, projectLesson),
    undefined,
    { recentHooks: [strongDraft.hook] },
  );
  assert.equal(selected?.draft.hook, alternateHook);
});

test("candidate selection removes isolated unsafe narrative without another model call", () => {
  const source = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:intellitab:native-ipc",
  )!;
  const nativeIpcDraft: DualDraft = {
    title: "IntelliTab's local completion boundary",
    hook: "IntelliTab keeps its local completion path off HTTP.",
    linkedIn: `IntelliTab keeps its local completion path off HTTP.

The VS Code extension communicates with a persistent Python MLX server through length-prefixed JSON over stdin and stdout.

The README explicitly says this path does not use a REST server, Ollama, or an OpenAI-compatible API. It uses native IPC.

The useful architecture question is whether network compatibility is actually a requirement for a local, single-user tool.`,
    xThread: [
      "IntelliTab keeps its local completion path off HTTP.",
      "The VS Code extension communicates with a persistent Python MLX server through length-prefixed JSON over stdin/stdout. The README describes native IPC, not REST, Ollama, or an OpenAI-compatible API.",
    ],
  };
  const unsafe: DualDraft = {
    ...nativeIpcDraft,
    linkedIn: `${nativeIpcDraft.linkedIn}\n\nDual-model routing was designed in from day one. This forced a clean IPC boundary.`,
    xThread: [
      ...nativeIpcDraft.xThread,
      "Dual-model routing was designed in from day one. This forced a clean IPC boundary.",
    ],
  };
  const selected = selectBestDraft(
    [unsafe],
    source.url,
    engagementBriefForSlot(0, projectLesson),
    { provider: source.provider, title: source.title, summary: source.summary },
  );
  assert.equal(selected?.audit.hardFailures.length, 0);
  assert.ok(selected?.audit.warnings.some((warning) => warning.includes("Removed unsupported")));
  assert.ok(!selected?.draft.linkedIn.includes("from day one"));
});
