import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
  topics?: string[];
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DevPulse-AI",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * GitHub signals: recent popular repos + AI-related search.
 * Optional GITHUB_TOKEN raises rate limit from 60 → 5000 req/hr.
 */
export async function fetchGithubTrending(limit = 15): Promise<RawSourceItem[]> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const queries = [
      `created:>${weekAgo} stars:>80 (topic:ai OR topic:llm OR topic:machine-learning OR language:Python OR language:TypeScript)`,
      `pushed:>${weekAgo} stars:>200 topic:agents`,
    ];

    const all: RawSourceItem[] = [];
    await Promise.all(
      queries.map(async (qRaw) => {
        try {
          const q = encodeURIComponent(qRaw);
          const res = await researchFetch(
            `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`,
            {
              headers: githubHeaders(),
              timeoutMs: 12_000,
            },
          );
          if (!res.ok) return;
          const data = (await res.json()) as { items?: GhRepo[] };
          for (const repo of data.items ?? []) {
            all.push({
              provider: "github",
              externalId: repo.full_name,
              title: `GitHub: ${repo.full_name}${repo.language ? ` (${repo.language})` : ""}`,
              url: repo.html_url,
              summary: repo.description || undefined,
              score: repo.stargazers_count + repo.forks_count * 0.5,
              priority: 5,
              raw: repo,
            });
          }
        } catch {
          // ignore query failures
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
  } catch {
    return [];
  }
}
