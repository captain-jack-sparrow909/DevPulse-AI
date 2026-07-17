type DatabaseEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "DATABASE_URL" | "DATABASE_URL_POOLED" | "DATABASE_URL_SESSION" | "DIRECT_URL">>;

function withCommonParams(url: URL, connectionLimit: string): string {
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", connectionLimit);
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "30");
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

function transactionPoolUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.port === "6543" && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", "2");
    return withCommonParams(url, "2");
  } catch {
    return raw;
  }
}

function sessionPoolUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") url.port = "5432";
    url.searchParams.delete("pgbouncer");
    url.searchParams.set("connection_limit", "2");
    return withCommonParams(url, "2");
  } catch {
    return raw;
  }
}

export function resolveDatabaseUrl(env: DatabaseEnvironment = process.env): string | undefined {
  const primary = env.DATABASE_URL?.trim();
  const pooled = env.DATABASE_URL_POOLED?.trim();
  const session = env.DATABASE_URL_SESSION?.trim() || env.DIRECT_URL?.trim();

  if (env.NODE_ENV === "production") {
    const runtime = pooled || primary;
    return runtime ? transactionPoolUrl(runtime) : undefined;
  }

  const persistent = session || primary || pooled;
  return persistent ? sessionPoolUrl(persistent) : undefined;
}
