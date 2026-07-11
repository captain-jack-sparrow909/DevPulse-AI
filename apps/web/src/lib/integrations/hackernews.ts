import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

interface HnItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  text?: string;
  type?: string;
}

export async function fetchHackerNews(limit = 20): Promise<RawSourceItem[]> {
  try {
    const res = await researchFetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      timeoutMs: 10_000,
    });
    if (!res.ok) return [];
    const ids = (await res.json()) as number[];
    const top = ids.slice(0, limit);

    const items = await Promise.all(
      top.map(async (id) => {
        try {
          const itemRes = await researchFetch(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            { timeoutMs: 8_000 },
          );
          if (!itemRes.ok) return null;
          return (await itemRes.json()) as HnItem;
        } catch {
          return null;
        }
      }),
    );

    return items
      .filter((item): item is HnItem => Boolean(item?.title))
      .map((item) => ({
        provider: "hackernews" as const,
        externalId: String(item.id),
        title: item.title!,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        summary: item.text?.slice(0, 500),
        score: item.score ?? 0,
        raw: item,
      }));
  } catch {
    return [];
  }
}
