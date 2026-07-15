import { prisma } from "@/lib/db";
import {
  DEFAULT_CONTENT_STRATEGY,
  normalizeContentStrategy,
  strategyFromRecord,
  strategyToRecord,
  type ContentStrategyConfig,
} from "@/lib/content/strategy";

export async function ensureContentStrategy(userId: string) {
  const defaults = strategyToRecord(DEFAULT_CONTENT_STRATEGY);
  return prisma.contentStrategy.upsert({
    where: { userId },
    create: { userId, ...defaults },
    update: {},
  });
}

export async function getContentStrategy(userId: string): Promise<ContentStrategyConfig> {
  const row = await ensureContentStrategy(userId);
  return strategyFromRecord(row);
}

export async function saveContentStrategy(
  userId: string,
  input: Partial<ContentStrategyConfig>,
): Promise<ContentStrategyConfig> {
  const normalized = normalizeContentStrategy(input);
  const data = strategyToRecord(normalized);
  const row = await prisma.contentStrategy.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return strategyFromRecord(row);
}
