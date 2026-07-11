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

export const ANGLES = [
  "quick tip",
  "thread outline",
  "comparison",
  "hot take (evidence-backed)",
  "architecture breakdown",
  "lessons learned",
  "tutorial snippet",
  "repo spotlight",
  "paper insight",
] as const;
