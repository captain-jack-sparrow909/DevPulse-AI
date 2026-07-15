import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Resolve DB URL:
 * - Prefer the explicit transaction-pooler URL when one is configured.
 * - Always add Prisma's PgBouncer compatibility parameters to a :6543 URL,
 *   including during local development. Supavisor transaction mode cannot
 *   safely use session-level prepared statements.
 * - Fall back to DATABASE_URL unchanged for direct or session connections.
 */
function resolveDatabaseUrl(): string | undefined {
  const primary = process.env.DATABASE_URL?.trim();
  const pooled = process.env.DATABASE_URL_POOLED?.trim();

  if (pooled && pooled.includes(":6543")) return ensurePoolerParams(pooled);
  if (primary && primary.includes(":6543")) return ensurePoolerParams(primary);
  return primary;
}

function ensurePoolerParams(url: string): string {
  // Avoid connection_limit=1 (starves Promise.all); 5 is safe for free tier + serverless
  try {
    const hasQuery = url.includes("?");
    const params = new URLSearchParams(hasQuery ? url.split("?")[1] : "");
    if (!params.has("pgbouncer")) params.set("pgbouncer", "true");
    if (!params.has("connection_limit") || params.get("connection_limit") === "1") {
      params.set("connection_limit", "5");
    }
    if (!params.has("pool_timeout")) params.set("pool_timeout", "30");
    if (!params.has("sslmode")) params.set("sslmode", "require");
    const base = hasQuery ? url.split("?")[0] : url;
    return `${base}?${params.toString()}`;
  } catch {
    return url;
  }
}

const databaseUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
