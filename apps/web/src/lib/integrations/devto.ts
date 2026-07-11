import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

interface DevToArticle {
  id: number;
  title: string;
  description?: string;
  url: string;
  public_reactions_count?: number;
  comments_count?: number;
  tag_list?: string[] | string;
  user?: { name?: string };
}

/**
 * Dev.to / Forem public API — free, no key required.
 * Optional DEVTO_API_KEY if you hit rate limits.
 */
export async function fetchDevTo(limit = 12): Promise<RawSourceItem[]> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "DevPulse-AI/1.0",
      Accept: "application/json",
    };
    const key = process.env.DEVTO_API_KEY?.trim();
    if (key) headers["api-key"] = key;

    const tags = ["ai", "machinelearning", "typescript", "javascript", "webdev"];
    const all: RawSourceItem[] = [];

    await Promise.all(
      tags.map(async (tag) => {
        try {
          const res = await researchFetch(
            `https://dev.to/api/articles?tag=${tag}&top=7&per_page=${Math.ceil(limit / tags.length)}`,
            { headers, timeoutMs: 12_000 },
          );
          if (!res.ok) return;
          const articles = (await res.json()) as DevToArticle[];
          for (const a of articles) {
            const tagsList = Array.isArray(a.tag_list)
              ? a.tag_list.join(", ")
              : a.tag_list || tag;
            all.push({
              provider: "devto",
              externalId: String(a.id),
              title: `Dev.to: ${a.title}`,
              url: a.url,
              summary: a.description || `by ${a.user?.name || "unknown"} · ${tagsList}`,
              score: (a.public_reactions_count ?? 0) + (a.comments_count ?? 0) * 2,
              priority: 4,
              raw: a,
            });
          }
        } catch {
          // ignore tag failures
        }
      }),
    );

    // Dedupe by id
    const seen = new Set<string>();
    return all
      .filter((i) => {
        if (seen.has(i.externalId)) return false;
        seen.add(i.externalId);
        return true;
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}
