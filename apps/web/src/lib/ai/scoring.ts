export interface QualityScores {
  novelty: number;
  accuracy: number;
  hook: number;
  readability: number;
  virality: number;
  technical: number;
  engagement: number;
  overall: number;
}

export function heuristicScore(content: string, platform: string): QualityScores {
  const len = content.trim().length;
  const hasCode = /```|`[^`]+`/.test(content);
  const hasLink = /https?:\/\//.test(content);
  const lines = content.split("\n").filter(Boolean).length;
  const buzzwords = (
    content.match(/\b(game-?changer|unlock|delve|leverage|synergy|revolutionize|cutting-edge)\b/gi) ||
    []
  ).length;
  const questions = (content.match(/\?/g) || []).length;

  let readability = 7;
  if (platform === "x") {
    readability = len <= 280 ? 8.5 : len <= 500 ? 7 : 5;
  } else {
    readability = len >= 500 && len <= 2000 ? 8.5 : len >= 300 ? 7 : 5.5;
  }

  const novelty = Math.min(9, 6 + (hasLink ? 1 : 0) + (hasCode ? 1 : 0) + Math.min(lines, 3) * 0.3);
  const accuracy = hasLink ? 8 : 7;
  const hook = Math.min(9, 6.5 + questions * 0.5 + (content.split("\n")[0]?.length || 0 > 20 ? 0.8 : 0));
  const virality = Math.min(9, 6 + questions * 0.4 + (hasCode ? 0.6 : 0) - buzzwords * 0.8);
  const technical = Math.min(9.5, 6.5 + (hasCode ? 1.5 : 0) + (hasLink ? 0.5 : 0));
  const engagement = Math.min(9, (hook + virality + readability) / 3 + 0.5);
  let overall =
    novelty * 0.12 +
    accuracy * 0.15 +
    hook * 0.15 +
    readability * 0.12 +
    virality * 0.12 +
    technical * 0.18 +
    engagement * 0.16;
  overall = Math.max(0, Math.min(10, overall - buzzwords * 0.5));

  const clamp = (n: number) => Math.round(n * 10) / 10;
  return {
    novelty: clamp(novelty),
    accuracy: clamp(accuracy),
    hook: clamp(hook),
    readability: clamp(readability),
    virality: clamp(virality),
    technical: clamp(technical),
    engagement: clamp(engagement),
    overall: clamp(overall),
  };
}

export function parseScores(jsonText: string): QualityScores | null {
  try {
    const data = JSON.parse(jsonText) as Record<string, number>;
    const keys = [
      "novelty",
      "accuracy",
      "hook",
      "readability",
      "virality",
      "technical",
      "engagement",
      "overall",
    ] as const;
    const scores = {} as QualityScores;
    for (const k of keys) {
      const v = Number(data[k] ?? data[k === "hook" ? "hookQuality" : k]);
      if (Number.isNaN(v)) return null;
      scores[k] = Math.max(0, Math.min(10, Math.round(v * 10) / 10));
    }
    return scores;
  } catch {
    return null;
  }
}
