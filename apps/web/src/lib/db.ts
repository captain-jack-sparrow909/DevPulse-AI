import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Single PrismaClient across hot reloads (Next.js).
 * Supabase free tier: avoid connection_limit=1 — parallel RSC queries need a small pool.
 * Prefer DIRECT_URL (port 5432) for local dev; use pooler URL on serverless if needed.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
