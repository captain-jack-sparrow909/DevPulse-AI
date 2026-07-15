import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { RawSourceItem } from "@/lib/integrations/types";

export interface StoredSourceItem {
  id: string;
  item: RawSourceItem;
}

export function sourceItemKey(item: Pick<RawSourceItem, "provider" | "externalId">): string {
  return `${item.provider}:${item.externalId.slice(0, 190)}`;
}

/**
 * Upsert source candidates with bounded concurrency.
 * Supavisor transaction mode is much slower when dozens of upserts acquire a
 * connection one-by-one. Four workers stay below the configured pool limit of
 * five while leaving one connection available for job/status queries.
 */
export async function upsertResearchSources(
  researchRunId: string,
  items: RawSourceItem[],
  concurrency = 4,
): Promise<Map<string, StoredSourceItem>> {
  const unique = [...new Map(items.map((item) => [sourceItemKey(item), item])).values()];
  if (unique.length === 0) return new Map();

  try {
    const values = unique.map((item) =>
      Prisma.sql`(
        ${randomUUID()},
        ${item.provider},
        ${item.externalId.slice(0, 190)},
        ${item.title.slice(0, 500)},
        ${item.url},
        ${item.summary?.slice(0, 2000) ?? null},
        ${item.score ?? 0},
        ${item.raw ? JSON.stringify(item.raw).slice(0, 50_000) : null},
        ${researchRunId},
        CURRENT_TIMESTAMP
      )`,
    );
    const rows = await prisma.$queryRaw<Array<{ id: string; provider: string; externalId: string }>>(
      Prisma.sql`
        INSERT INTO "Source"
          ("id", "provider", "externalId", "title", "url", "summary", "score", "rawJson", "researchRunId", "fetchedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("provider", "externalId") DO UPDATE SET
          "title" = EXCLUDED."title",
          "url" = EXCLUDED."url",
          "summary" = EXCLUDED."summary",
          "score" = EXCLUDED."score",
          "rawJson" = EXCLUDED."rawJson",
          "researchRunId" = EXCLUDED."researchRunId",
          "fetchedAt" = CURRENT_TIMESTAMP
        RETURNING "id", "provider", "externalId"
      `,
    );
    const itemByKey = new Map(unique.map((item) => [sourceItemKey(item), item]));
    return new Map(
      rows.flatMap((row) => {
        const key = `${row.provider}:${row.externalId}`;
        const item = itemByKey.get(key);
        return item ? [[key, { id: row.id, item }] as const] : [];
      }),
    );
  } catch (error) {
    console.warn(
      "[source-store] Bulk upsert failed; falling back to bounded Prisma upserts:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const stored = new Array<StoredSourceItem | undefined>(unique.length);
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const item = unique[index]!;
      const externalId = item.externalId.slice(0, 190);
      const rawJson = item.raw ? JSON.stringify(item.raw).slice(0, 50_000) : null;
      const saved = await prisma.source.upsert({
        where: {
          provider_externalId: { provider: item.provider, externalId },
        },
        create: {
          provider: item.provider,
          externalId,
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          rawJson,
          researchRunId,
        },
        update: {
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          rawJson,
          researchRunId,
          fetchedAt: new Date(),
        },
      });
      stored[index] = { id: saved.id, item };
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, unique.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return new Map(
    stored
      .filter((entry): entry is StoredSourceItem => Boolean(entry))
      .map((entry) => [sourceItemKey(entry.item), entry]),
  );
}
