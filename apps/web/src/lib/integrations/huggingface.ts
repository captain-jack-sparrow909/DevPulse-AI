import type { RawSourceItem } from "./types";

interface HfModel {
  id: string;
  modelId?: string;
  likes?: number;
  downloads?: number;
  pipeline_tag?: string;
  lastModified?: string;
}

/**
 * Hugging Face public API — no token required for low volume.
 * Optional HF_TOKEN raises rate limits.
 */
export async function fetchHuggingFace(limit = 12): Promise<RawSourceItem[]> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "DevPulse-AI/1.0",
      Accept: "application/json",
    };
    const token = process.env.HF_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(
      `https://huggingface.co/api/models?sort=likes&direction=-1&limit=${limit}&filter=text-generation`,
      { headers, next: { revalidate: 900 }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const models = (await res.json()) as HfModel[];

    return models.map((m) => {
      const id = m.modelId || m.id;
      return {
        provider: "huggingface" as const,
        externalId: id,
        title: `HF model: ${id}${m.pipeline_tag ? ` (${m.pipeline_tag})` : ""}`,
        url: `https://huggingface.co/${id}`,
        summary: `Likes ${m.likes ?? 0} · Downloads ${m.downloads ?? 0}`,
        score: (m.likes ?? 0) / 50 + (m.downloads ?? 0) / 100_000,
        priority: 5,
        raw: m,
      };
    });
  } catch {
    return [];
  }
}
