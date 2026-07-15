/** X hard limit per post (tweet). Threads = multiple posts of this size. */
export const X_CHAR_LIMIT = 280;

/** LinkedIn practical sweet spot we target when writing. */
export const LINKEDIN_MIN = 500;
export const LINKEDIN_MAX = 3000;

/**
 * Split text into X-sized chunks (≤280), preferring paragraph / sentence breaks.
 * Used as a safety net after the writer (and for older single-format posts).
 */
export function splitIntoXChunks(text: string, limit = X_CHAR_LIMIT): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= limit) return [cleaned];

  // If already marked as a thread with --- separators
  if (cleaned.includes("\n\n---\n\n")) {
    const parts = cleaned
      .split(/\n\n---\n\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.flatMap((p) => splitIntoXChunks(p, limit));
  }

  const chunks: string[] = [];
  let remaining = cleaned;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining.trim());
      break;
    }

    const slice = remaining.slice(0, limit);
    // Prefer break at paragraph
    let breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"));
    if (breakAt < limit * 0.4) {
      // Prefer sentence end
      const sentenceEnds = [...slice.matchAll(/[.!?…]["']?\s/g)].map((m) => m.index ?? -1);
      breakAt = sentenceEnds.length ? sentenceEnds[sentenceEnds.length - 1]! + 1 : -1;
    }
    if (breakAt < limit * 0.4) {
      // Prefer word boundary
      breakAt = slice.lastIndexOf(" ");
    }
    if (breakAt < limit * 0.3) {
      breakAt = limit;
    }

    const part = remaining.slice(0, breakAt).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(breakAt).trim();
  }

  // Number multi-part threads for clarity when posting manually
  if (chunks.length > 1) {
    return chunks.map((c, i) => {
      const suffix = ` ${i + 1}/${chunks.length}`;
      // If adding numbering would overflow, skip numbering
      if (c.length + suffix.length <= limit) {
        // Only add if not already numbered
        if (!/^\d+\/\d+/.test(c) && !c.endsWith(`${i + 1}/${chunks.length}`)) {
          return c;
        }
      }
      return c;
    });
  }

  return chunks;
}

/** Ensure every tweet is ≤ limit (hard clamp as last resort). */
export function enforceXLimit(parts: string[], limit = X_CHAR_LIMIT): string[] {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length <= limit ? [p] : splitIntoXChunks(p, limit)));
}

export function parseThreadJson(threadJson: string | null | undefined): string[] {
  if (!threadJson) return [];
  try {
    const parsed = JSON.parse(threadJson) as unknown;
    if (Array.isArray(parsed)) {
      return enforceXLimit(parsed.map(String));
    }
  } catch {
    // fall through
  }
  return [];
}

/**
 * Resolve dual-format content from a post row (supports legacy single-platform rows).
 */
export function resolveDualContent(post: {
  content: string;
  contentLinkedIn?: string | null;
  threadJson?: string | null;
  platform?: string | null;
}): { linkedIn: string; xThread: string[] } {
  const linkedIn = (post.contentLinkedIn || post.content || "").trim();

  let xThread = parseThreadJson(post.threadJson);
  if (xThread.length === 0) {
    // Legacy: single X post stored in content
    if (post.platform === "x") {
      xThread = enforceXLimit([post.content]);
    } else {
      // Derive X thread from LinkedIn body
      xThread = splitIntoXChunks(linkedIn);
    }
  } else {
    xThread = enforceXLimit(xThread);
  }

  return { linkedIn, xThread };
}

export function xThreadAsCopyText(parts: string[]): string {
  if (parts.length <= 1) return parts[0] || "";
  return parts.map((p, i) => `${i + 1}/${parts.length}\n${p}`).join("\n\n");
}
