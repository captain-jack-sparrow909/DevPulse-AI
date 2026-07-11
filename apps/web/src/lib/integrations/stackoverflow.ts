import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

interface SoItem {
  question_id: number;
  title: string;
  link: string;
  score: number;
  view_count: number;
  answer_count: number;
  tags?: string[];
}

/**
 * Stack Exchange API — works without a key (shared IP quota).
 * Optional STACKEXCHANGE_KEY for higher daily quota.
 * Note: `tagged` uses AND for multiple tags, so we query tags separately.
 */
export async function fetchStackOverflow(limit = 10): Promise<RawSourceItem[]> {
  const key = process.env.STACKEXCHANGE_KEY?.trim();
  const tags = [
    "typescript",
    "reactjs",
    "kubernetes",
    "machine-learning",
    "openai-api",
    "llm",
    "next.js",
  ];
  const all: RawSourceItem[] = [];

  await Promise.all(
    tags.map(async (tag) => {
      try {
        const params = new URLSearchParams({
          order: "desc",
          sort: "hot",
          tagged: tag,
          site: "stackoverflow",
          pagesize: "3",
        });
        if (key) params.set("key", key);

        const res = await researchFetch(
          `https://api.stackexchange.com/2.3/questions?${params}`,
          {
            headers: { "User-Agent": "DevPulse-AI/1.0" },
            timeoutMs: 12_000,
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { items?: SoItem[] };
        for (const q of data.items ?? []) {
          all.push({
            provider: "stackoverflow",
            externalId: String(q.question_id),
            title: `SO [${tag}]: ${q.title}`,
            url: q.link,
            summary: `score ${q.score} · ${q.answer_count} answers · tags: ${(q.tags || []).slice(0, 5).join(", ")}`,
            score: q.score + q.view_count / 500,
            priority: 4,
            raw: q,
          });
        }
      } catch {
        // ignore tag failures
      }
    }),
  );

  const seen = new Set<string>();
  return all
    .filter((i) => {
      if (seen.has(i.externalId)) return false;
      seen.add(i.externalId);
      return true;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}
