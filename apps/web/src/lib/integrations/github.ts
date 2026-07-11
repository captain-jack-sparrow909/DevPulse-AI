import type { RawSourceItem } from "./types";

interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
}

/**
 * GitHub search for recently created / popular tech repos.
 * No auth required for low volume; uses public search API.
 */
export async function fetchGithubTrending(limit = 15): Promise<RawSourceItem[]> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const q = encodeURIComponent(
      `created:>${weekAgo} stars:>50 language:TypeScript OR language:Python OR language:JavaScript`,
    );
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "DevPulse-AI",
        },
        next: { revalidate: 600 },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: GhRepo[] };
    const items = data.items ?? [];

    return items.map((repo) => ({
      provider: "github" as const,
      externalId: repo.full_name,
      title: `${repo.full_name}${repo.language ? ` (${repo.language})` : ""}`,
      url: repo.html_url,
      summary: repo.description || undefined,
      score: repo.stargazers_count,
      raw: repo,
    }));
  } catch {
    return [];
  }
}
