import { prisma } from "@/lib/db";
import { collectAllSources, describeSourceMix, type RawSourceItem } from "@/lib/integrations";
import { getContentStrategy } from "@/lib/content/strategy-store";
import { projectSources } from "@/lib/content/strategy";

/**
 * Diversify the list so one provider cannot flood storage/ranking.
 * Take top N per provider, then fill remaining by score.
 * (Writing-time mix is enforced separately via slot lanes + daily quotas.)
 */
export function diversifySources(items: RawSourceItem[], maxTotal = 120, perProvider = 12): RawSourceItem[] {
  const byProvider = new Map<string, RawSourceItem[]>();
  for (const item of items) {
    const list = byProvider.get(item.provider) || [];
    list.push(item);
    byProvider.set(item.provider, list);
  }

  const picked: RawSourceItem[] = [];
  const seen = new Set<string>();

  for (const [, list] of byProvider) {
    const sorted = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    for (const item of sorted.slice(0, perProvider)) {
      const key = `${item.provider}:${item.externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(item);
    }
  }

  const rest = [...items]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .filter((i) => !seen.has(`${i.provider}:${i.externalId}`));

  for (const item of rest) {
    if (picked.length >= maxTotal) break;
    picked.push(item);
  }

  return picked.slice(0, maxTotal);
}

export interface IngestResult {
  researchRunId: string;
  sourcesFound: number;
  mix: string;
  byProvider: Record<string, number>;
  logs: string[];
}

/**
 * Refresh the complete active product-first catalog (no post writing).
 */
export async function ingestResearchFeed(userId: string): Promise<IngestResult> {
  const logs: string[] = [];
  const log = (m: string) => logs.push(`[${new Date().toISOString()}] ${m}`);

  const researchRun = await prisma.researchRun.create({
    data: { userId, status: "running" },
  });

  try {
    log("Collecting owned projects and targeted active providers…");
    const strategy = await getContentStrategy(userId);
    const [curated, community] = await Promise.all([
      collectAllSources({
        contentType: "curated_discovery",
        strategy,
      }),
      collectAllSources({
        contentType: "evidence_opinion",
        strategy,
      }),
    ]);
    const raw = [...projectSources(strategy), ...curated, ...community];
    log(`Raw fetch: ${raw.length} · ${describeSourceMix(raw)}`);

    const diversified = diversifySources(raw, 150, 16);
    log(`After diversity pass: ${diversified.length} · ${describeSourceMix(diversified)}`);

    const byProvider: Record<string, number> = {};
    for (const item of diversified) {
      byProvider[item.provider] = (byProvider[item.provider] || 0) + 1;

      await prisma.source.upsert({
        where: {
          provider_externalId: {
            provider: item.provider,
            externalId: item.externalId.slice(0, 190),
          },
        },
        create: {
          provider: item.provider,
          externalId: item.externalId.slice(0, 190),
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          rawJson: item.raw ? JSON.stringify(item.raw).slice(0, 50_000) : null,
          researchRunId: researchRun.id,
        },
        update: {
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          rawJson: item.raw ? JSON.stringify(item.raw).slice(0, 50_000) : null,
          researchRunId: researchRun.id,
          fetchedAt: new Date(),
        },
      });
    }

    await prisma.researchRun.update({
      where: { id: researchRun.id },
      data: {
        status: "completed",
        sourcesFound: diversified.length,
        topicsRanked: JSON.stringify(
          diversified.slice(0, 30).map((s) => ({
            title: s.title,
            provider: s.provider,
            url: s.url,
          })),
        ),
        completedAt: new Date(),
      },
    });

    log(`Saved ${diversified.length} sources to DB`);

    return {
      researchRunId: researchRun.id,
      sourcesFound: diversified.length,
      mix: describeSourceMix(diversified),
      byProvider,
      logs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    log(`FAILED: ${message}`);
    await prisma.researchRun.update({
      where: { id: researchRun.id },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
    throw err;
  }
}
