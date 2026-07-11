import type { RawSourceItem } from "./types";

/**
 * Product Hunt — optional PRODUCTHUNT_TOKEN (Developer Token / GraphQL).
 * Without a token this returns [] (API is authenticated).
 * Free alternatives for AI launches are covered by HN + RSS.
 */
export async function fetchProductHunt(limit = 8): Promise<RawSourceItem[]> {
  const token = process.env.PRODUCTHUNT_TOKEN?.trim();
  if (!token) return [];

  try {
    const query = `
      query {
        posts(first: ${limit}, order: VOTES) {
          edges {
            node {
              id
              name
              tagline
              url
              votesCount
              website
            }
          }
        }
      }
    `;
    const res = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "DevPulse-AI/1.0",
      },
      body: JSON.stringify({ query }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        posts?: {
          edges?: Array<{
            node: {
              id: string;
              name: string;
              tagline?: string;
              url: string;
              votesCount?: number;
            };
          }>;
        };
      };
    };

    return (json.data?.posts?.edges ?? []).map(({ node }) => ({
      provider: "producthunt" as const,
      externalId: node.id,
      title: `PH: ${node.name}`,
      url: node.url,
      summary: node.tagline,
      score: node.votesCount ?? 0,
      priority: 3,
      raw: node,
    }));
  } catch {
    return [];
  }
}
