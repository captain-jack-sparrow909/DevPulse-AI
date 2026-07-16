import { chatCompletion, isAiConfigured } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { auditReply, replyLimit, safeReplyFallback } from "@/lib/distribution/ranking";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "been", "before", "being", "from", "have",
  "into", "just", "more", "most", "that", "their", "there", "these", "they", "this", "using",
  "what", "when", "where", "which", "with", "would", "your",
]);

function terms(value: string) {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9.+#-]{2,}/g)
      ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
  );
}

function overlap(a: string, b: string) {
  const left = terms(a);
  const right = terms(b);
  let count = 0;
  for (const term of left) if (right.has(term)) count += 1;
  return count;
}

function unsupportedNumbers(reply: string, evidence: string) {
  const allowed = new Set(evidence.match(/\b\d+(?:\.\d+)?(?:%|ms|s|x|k|mb|gb)?\b/gi) ?? []);
  return (reply.match(/\b\d+(?:\.\d+)?(?:%|ms|s|x|k|mb|gb)?\b/gi) ?? []).filter(
    (value) => !allowed.has(value),
  );
}

export async function generateGroundedReply(userId: string, opportunityId: string) {
  const [opportunity, facts] = await Promise.all([
    prisma.engagementOpportunity.findFirst({
      where: { id: opportunityId, userId },
      include: { relationship: true },
    }),
    prisma.projectFact.findMany({
      where: { userId, reviewStatus: "approved", repository: { active: true } },
      include: { repository: { select: { name: true, fullName: true } } },
      orderBy: [{ useCount: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
  ]);
  if (!opportunity) throw new Error("Opportunity not found");
  const conversation = `${opportunity.topic ?? ""}\n${opportunity.context}`;
  const fact = facts
    .map((candidate) => ({ candidate, score: overlap(conversation, `${candidate.title} ${candidate.claim}`) }))
    .sort((a, b) => b.score - a.score)[0];
  const grounding = fact && fact.score > 0
    ? `Optional relevant owned-project evidence from ${fact.candidate.repository.name}: ${fact.candidate.claim}`
    : "No owned-project fact is sufficiently relevant. Do not mention a product.";
  const fallback = safeReplyFallback(opportunity.topic);
  if (!isAiConfigured()) return { reply: fallback, mode: "fallback", factId: null };

  try {
    const raw = await chatCompletion({
      system: `You draft thoughtful manual social replies for a solo software engineer. Write one reply only, with no preface. Address a specific point in the supplied conversation. Add one useful technical observation or one focused question. Never flatter generically, use hashtags, include a URL, ask for follows, or invent implementation history, metrics, outcomes, or personal experience. Use first person only when the evidence explicitly supports it. Mention an owned product only when the supplied project evidence directly answers the conversation. Maximum ${replyLimit(opportunity.platform)} characters.`,
      user: `Platform: ${opportunity.platform}\nAuthor: ${opportunity.author ?? "unknown"}\nTopic: ${opportunity.topic ?? "unspecified"}\nConversation:\n${opportunity.context}\n\nGrounding boundary:\n${grounding}`,
      temperature: 0.45,
      maxTokens: 240,
    });
    const reply = raw.replace(/^['"]|['"]$/g, "").trim();
    const evidence = `${conversation}\n${grounding}`;
    const failures = auditReply(reply, opportunity.platform);
    if (unsupportedNumbers(reply, evidence).length) failures.push("Reply introduces unsupported numbers");
    if (failures.length) return { reply: fallback, mode: "fallback", factId: null, warnings: failures };
    return {
      reply,
      mode: "ai",
      factId: fact && fact.score > 0 ? fact.candidate.id : null,
    };
  } catch (error) {
    return {
      reply: fallback,
      mode: "fallback",
      factId: null,
      warnings: [error instanceof Error ? error.message : "Reply generation failed"],
    };
  }
}
