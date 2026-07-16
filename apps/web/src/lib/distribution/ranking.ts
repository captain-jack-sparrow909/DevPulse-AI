export interface OpportunityRankInput {
  context: string;
  topic?: string | null;
  author?: string | null;
  discoveredAt: Date;
  status: string;
  relationshipPriority?: number | null;
}

const HIGH_SIGNAL_TERMS = [
  "agent",
  "architecture",
  "code",
  "database",
  "developer",
  "inference",
  "latency",
  "llm",
  "local ai",
  "next.js",
  "prompt",
  "rag",
  "typescript",
  "vscode",
];

export function rankOpportunity(input: OpportunityRankInput, now = new Date()) {
  if (input.status !== "new") return { score: 0, reason: "Already handled" };
  const text = `${input.topic ?? ""} ${input.context}`.toLowerCase();
  const matched = HIGH_SIGNAL_TERMS.filter((term) => text.includes(term));
  const ageHours = Math.max(0, (now.getTime() - input.discoveredAt.getTime()) / 3_600_000);
  let score = 35;
  score += Math.min(30, matched.length * 6);
  if (input.author) score += 8;
  if (ageHours <= 6) score += 20;
  else if (ageHours <= 24) score += 12;
  else if (ageHours >= 96) score -= 20;
  score += Math.round((input.relationshipPriority ?? 0) * 0.2);
  score = Math.max(0, Math.min(100, score));
  const reason = [
    ageHours <= 24 ? "active conversation" : "older conversation",
    matched.length ? `${matched.slice(0, 3).join(", ")} relevance` : "general relevance",
    input.relationshipPriority ? "known relationship" : null,
  ].filter(Boolean).join(" · ");
  return { score, reason };
}

export function replyLimit(platform: string) {
  return platform === "x" ? 280 : 750;
}

export function auditReply(reply: string, platform: string) {
  const failures: string[] = [];
  const trimmed = reply.trim();
  if (trimmed.length < 25) failures.push("Reply is too short to add useful context");
  if (trimmed.length > replyLimit(platform)) failures.push("Reply exceeds the platform limit");
  if (/https?:\/\//i.test(trimmed)) failures.push("Reply contains a link");
  if (/\b(great post|nice post|thanks for sharing|game changer|revolutionary)\b/i.test(trimmed)) {
    failures.push("Reply uses generic engagement language");
  }
  if ((trimmed.match(/#/g) ?? []).length) failures.push("Reply contains a hashtag");
  return failures;
}

export function safeReplyFallback(topic?: string | null) {
  const focus = topic?.trim().replace(/[.!?]+$/, "").slice(0, 120);
  return focus
    ? `The implementation constraint behind ${focus} is the interesting part. Which tradeoff had the biggest effect on the final design?`
    : "The implementation constraint is the interesting part here. Which tradeoff had the biggest effect on the final design?";
}
