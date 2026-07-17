import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatabaseUrl } from "@/lib/db-url";

const transaction = "postgresql://user:password@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
const session = "postgresql://user:password@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres";

test("production selects transaction pooling and enables PgBouncer compatibility", () => {
  const resolved = new URL(resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: transaction, DATABASE_URL_POOLED: transaction })!);
  assert.equal(resolved.port, "6543");
  assert.equal(resolved.searchParams.get("pgbouncer"), "true");
  assert.equal(resolved.searchParams.get("sslmode"), "require");
});

test("development prefers the persistent session URL", () => {
  const resolved = new URL(resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: transaction, DIRECT_URL: session })!);
  assert.equal(resolved.port, "5432");
  assert.equal(resolved.searchParams.has("pgbouncer"), false);
});

test("development safely converts a Supabase shared transaction URL to session mode", () => {
  const resolved = new URL(resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: transaction })!);
  assert.equal(resolved.port, "5432");
  assert.equal(resolved.searchParams.get("connection_limit"), "2");
});
