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
 * Product-first fallback angles. The content-strategy label normally wins;
 * these remain for demo and compatibility paths.
 */
export const ANGLES = [
  "real project lesson",
  "architecture tradeoff",
  "real project lesson",
  "measured experiment",
  "implementation decision",
  "evidence-backed opinion",
  "building-in-public lesson",
  "architecture breakdown",
  "product constraint",
  "curated product-adjacent discovery",
] as const;
