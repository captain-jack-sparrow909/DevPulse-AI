import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

/**
 * arXiv API — free Atom feed search for recent AI/ML papers.
 */
/** Categories from information-sources.md: cs.AI, cs.LG, cs.CL, cs.CV, cs.RO */
export async function fetchArxiv(
  limit = 14,
  options: { terms?: readonly string[] } = {},
): Promise<RawSourceItem[]> {
  try {
    const categories = "(cat:cs.AI OR cat:cs.LG OR cat:cs.CL OR cat:cs.CV OR cat:cs.RO)";
    const focus = options.terms
      ?.slice(0, 8)
      .map((term) => `all:\"${term.replace(/[\"\\]/g, " ").trim()}\"`)
      .filter((term) => term !== 'all:\"\"')
      .join(" OR ");
    const query = encodeURIComponent(focus ? `${categories} AND (${focus})` : categories);
    const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;
    const res = await researchFetch(url, {
      headers: { "User-Agent": "DevPulse-AI/1.0" },
      timeoutMs: 15_000,
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const entries = xml.split("<entry>").slice(1);
    return entries.map((entry, index) => {
      const id = matchTag(entry, "id") || `arxiv-${index}`;
      const title = clean(matchTag(entry, "title") || "Untitled paper");
      const summary = clean(matchTag(entry, "summary") || "").slice(0, 600);
      const link =
        entry.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/)?.[1] ||
        entry.match(/<id>([^<]+)<\/id>/)?.[1] ||
        id;
      const absId = id
        .replace("http://arxiv.org/abs/", "")
        .replace("https://arxiv.org/abs/", "");

      return {
        provider: "arxiv" as const,
        externalId: absId,
        title: `arXiv: ${title}`,
        url: link.startsWith("http") ? link : `https://arxiv.org/abs/${absId}`,
        summary,
        score: 55,
        priority: 5,
        raw: { id, title },
      };
    });
  } catch {
    return [];
  }
}

function matchTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1] ?? null;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
}
