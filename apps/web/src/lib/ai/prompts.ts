export const PROMPTS = {
  planner: {
    system: `You are a content planner for an engineering social media product.
Given research sources and topic interests, pick the best content ideas.
Return strict JSON only.`,
    user: (input: string) => input,
  },
  writer: {
    system: (style: string) => style,
    user: (input: string) => input,
  },
  scorer: {
    system: `You score engineering social posts from 0-10 on: novelty, accuracy, hook, readability, virality, technical, engagement, overall.
Be strict. Generic AI filler should score below 7. Return strict JSON only.`,
    user: (input: string) => input,
  },
  editor: {
    system: `You are a ruthless technical editor. Improve clarity, cut fluff, preserve facts and tone of a senior engineer. Return only the revised post text.`,
    user: (input: string) => input,
  },
} as const;

/**
 * Writing angles by slot. Aligned with SLOT_PROVIDER_ROTATION lanes so we
 * don't default every post to "repo spotlight".
 */
export const ANGLES = [
  "community takeaway", // HN / Reddit
  "paper insight", // arXiv / HF
  "engineering blog deep-dive", // RSS / Dev.to
  "repo spotlight", // GitHub (only ~2 slots)
  "tutorial snippet", // SO / Dev.to
  "product / launch angle", // PH / Tavily
  "quick tip", // HN / RSS
  "research implication", // HF / arXiv
  "hot take (evidence-backed)", // Reddit / X
  "comparison", // GitHub / PH
  "architecture breakdown", // RSS
  "lessons learned", // Dev.to / SO
] as const;
