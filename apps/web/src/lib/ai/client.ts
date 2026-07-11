import OpenAI from "openai";

export function getDeepSeekClient(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

export async function chatCompletion(params: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const client = getDeepSeekClient();
  if (!client) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const response = await client.chat.completions.create({
    model,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 2048,
    response_format: params.json ? { type: "json_object" } : undefined,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
