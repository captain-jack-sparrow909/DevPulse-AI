import { contentHash } from "@/lib/hash";
import type { DualDraft } from "@/lib/content/engagement";

export interface IdeaSourceIdentity {
  provider: string;
  externalId: string;
}

export interface HistoricalDraftInput {
  id: string;
  title?: string | null;
  hook?: string | null;
  content: string;
  contentLinkedIn?: string | null;
  threadJson?: string | null;
  ideaFingerprint?: string | null;
  sources: IdeaSourceIdentity[];
}

interface TextSignature {
  tokens: Set<string>;
  wordPairs: Set<string>;
  characterGrams: Set<string>;
}

export interface PreparedHistoricalDraft {
  id: string;
  ideaFingerprints: Set<string>;
  body: TextSignature;
  hook: TextSignature;
}

export interface DuplicateMatch {
  postId: string;
  kind: "idea" | "content" | "hook";
  similarity: number;
  reason: string;
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "been", "before", "being",
  "between", "both", "build", "building", "could", "does", "from", "have",
  "into", "just", "more", "most", "only", "other", "over", "same", "should",
  "some", "than", "that", "their", "there", "these", "they", "this", "through",
  "using", "very", "what", "when", "where", "which", "while", "with", "without",
  "would", "your",
]);

function canonicalWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ""))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function ngrams(values: string[], size: number): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index <= values.length - size; index += 1) {
    result.add(values.slice(index, index + size).join(" "));
  }
  return result;
}

function characterNgrams(value: string, size: number): Set<string> {
  const compact = value.replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let index = 0; index <= compact.length - size; index += 1) {
    result.add(compact.slice(index, index + size));
  }
  return result;
}

function signature(text: string): TextSignature {
  const words = canonicalWords(text);
  return {
    tokens: new Set(words),
    wordPairs: ngrams(words, 2),
    characterGrams: characterNgrams(words.join(" "), 5),
  };
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function dice(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

export function wholeDraftSimilarity(left: TextSignature, right: TextSignature): number {
  if (left.tokens.size < 8 || right.tokens.size < 8) return 0;
  const tokenScore = jaccard(left.tokens, right.tokens);
  const pairScore = dice(left.wordPairs, right.wordPairs);
  const characterScore = dice(left.characterGrams, right.characterGrams);
  return tokenScore * 0.45 + pairScore * 0.35 + characterScore * 0.2;
}

function parseThread(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function draftBody(input: {
  title?: string | null;
  linkedIn: string;
  xThread: string[];
}): string {
  return [input.title || "", input.linkedIn, ...input.xThread].join("\n");
}

/** Stable identity of the evidence/idea, independent of wording. */
export function ideaFingerprintForSource(source: IdeaSourceIdentity): string {
  return contentHash(
    `idea:v1:${source.provider.trim().toLowerCase()}:${source.externalId.trim().toLowerCase()}`,
  );
}

export function prepareHistoricalDrafts(
  posts: HistoricalDraftInput[],
): PreparedHistoricalDraft[] {
  return posts.map((post) => {
    const xThread = parseThread(post.threadJson);
    const linkedIn = post.contentLinkedIn || post.content;
    return {
      id: post.id,
      ideaFingerprints: new Set([
        ...(post.ideaFingerprint ? [post.ideaFingerprint] : []),
        ...post.sources.map(ideaFingerprintForSource),
      ]),
      body: signature(draftBody({ title: post.title, linkedIn, xThread })),
      hook: signature(post.hook || linkedIn.split("\n").find(Boolean) || post.title || ""),
    };
  });
}

export function usedIdeaPostMap(
  history: PreparedHistoricalDraft[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const post of history) {
    for (const fingerprint of post.ideaFingerprints) {
      if (!result.has(fingerprint)) result.set(fingerprint, post.id);
    }
  }
  return result;
}

/**
 * Deterministic, in-memory duplicate check. It deliberately makes no model or
 * network call so the Vercel generation path stays within its existing budget.
 */
export function findNearDuplicateDraft(
  draft: DualDraft,
  ideaFingerprint: string,
  history: PreparedHistoricalDraft[],
): DuplicateMatch | null {
  const body = signature(
    draftBody({ title: draft.title, linkedIn: draft.linkedIn, xThread: draft.xThread }),
  );
  const hook = signature(draft.hook);

  for (const previous of history) {
    if (previous.ideaFingerprints.has(ideaFingerprint)) {
      return {
        postId: previous.id,
        kind: "idea",
        similarity: 1,
        reason: "the same source or repository fact already produced a post",
      };
    }

    const bodySimilarity = wholeDraftSimilarity(body, previous.body);
    if (bodySimilarity >= 0.68) {
      return {
        postId: previous.id,
        kind: "content",
        similarity: bodySimilarity,
        reason: "the complete draft repeats a recent post",
      };
    }

    const hookSimilarity = wholeDraftSimilarity(hook, previous.hook);
    if (hookSimilarity >= 0.8) {
      return {
        postId: previous.id,
        kind: "hook",
        similarity: hookSimilarity,
        reason: "the hook repeats a recent post",
      };
    }
  }
  return null;
}

