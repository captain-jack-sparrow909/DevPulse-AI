import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Resolve DB URL:
 * - On Vercel, prefer pooler (DATABASE_URL_POOLED or DATABASE_URL with :6543)
 *   Direct :5432 often fails from serverless ("Can't reach database server").
 * - Locally, direct :5432 is fine for a small connection pool.
 */
function resolveDatabaseUrl(): string | undefined {
  const primary = process.env.DATABASE_URL?.trim();
  const pooled = process.env.DATABASE_URL_POOLED?.trim();
  const onVercel = process.env.VERCEL === "1";

  if (onVercel) {
    // Prefer explicit pooler URL
    if (pooled && pooled.includes(":6543")) return ensurePoolerParams(pooled);
    if (primary && primary.includes(":6543")) return ensurePoolerParams(primary);
    // Fall back to whatever is set (may still fail if only direct)
    return primary;
  }

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
