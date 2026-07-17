export type ConfigCheckStatus = "ready" | "warning" | "missing";

export interface DeploymentConfigCheck {
  key: string;
  label: string;
  status: ConfigCheckStatus;
  message: string;
}

function present(env: NodeJS.ProcessEnv, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function isLocalUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function validateDeploymentEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentConfigCheck[] {
  const production = env.NODE_ENV === "production" || Boolean(env.VERCEL);
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  const authUrl = env.BETTER_AUTH_URL?.trim();
  const r2Access = present(env, "CLOUDFLARE_ACCESS_KEY") || present(env, "CLOUDFLARE_ACCESS_KEY_ID") || present(env, "R2_ACCESS_KEY_ID");
  const r2Secret = present(env, "CLOUDFLARE_SECRET_KEY") || present(env, "CLOUDFLARE_SECRET_ACCESS_KEY") || present(env, "R2_SECRET_ACCESS_KEY");
  const r2Ready = present(env, "CLOUDFLARE_S3_ENDPOINT") && r2Access && r2Secret && (present(env, "R2_BUCKET") || present(env, "CLOUDFLARE_R2_BUCKET"));

  const checks: DeploymentConfigCheck[] = [
    {
      key: "database",
      label: "Database runtime",
      status: present(env, "DATABASE_URL") ? "ready" : "missing",
      message: present(env, "DATABASE_URL")
        ? env.DATABASE_URL?.includes(":6543") ? "Supabase transaction pooler configured." : "Configured, but use the :6543 transaction pooler on Vercel."
        : "DATABASE_URL is required.",
    },
    {
      key: "auth_secret",
      label: "Authentication secret",
      status: (env.BETTER_AUTH_SECRET?.trim().length ?? 0) >= 32 ? "ready" : "missing",
      message: (env.BETTER_AUTH_SECRET?.trim().length ?? 0) >= 32
        ? "Authentication secret is present."
        : "BETTER_AUTH_SECRET must contain at least 32 characters.",
    },
    {
      key: "app_url",
      label: "Production URLs",
      status: appUrl && authUrl && appUrl === authUrl && (!production || appUrl.startsWith("https://") || isLocalUrl(appUrl)) ? "ready" : "missing",
      message: appUrl && authUrl && appUrl === authUrl
        ? production && !appUrl.startsWith("https://") && !isLocalUrl(appUrl) ? "Production URLs must use HTTPS." : "Auth and public application URLs match."
        : "BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must both exist and match.",
    },
    {
      key: "cron",
      label: "Cron authentication",
      status: present(env, "CRON_SECRET") ? "ready" : production ? "missing" : "warning",
      message: present(env, "CRON_SECRET") ? "External cron endpoint is protected." : "Set CRON_SECRET before production deployment.",
    },
    {
      key: "ai",
      label: "DeepSeek",
      status: present(env, "DEEPSEEK_API_KEY") ? "ready" : "warning",
      message: present(env, "DEEPSEEK_API_KEY") ? "AI writing is configured." : "Missing key: generation falls back to demo templates.",
    },
    {
      key: "r2",
      label: "Cloudflare R2",
      status: r2Ready ? "ready" : production ? "missing" : "warning",
      message: r2Ready ? "Durable production media storage is configured." : "Complete the R2 endpoint, bucket, and S3 credential group.",
    },
    {
      key: "github",
      label: "GitHub API",
      status: present(env, "GITHUB_TOKEN") ? "ready" : "warning",
      message: present(env, "GITHUB_TOKEN") ? "Authenticated repository sync is configured." : "Optional token missing; public API rate limits are much lower.",
    },
  ];

  return checks.map((check) => {
    if (check.key === "database" && present(env, "DATABASE_URL") && production && !env.DATABASE_URL?.includes(":6543")) {
      return { ...check, status: "warning" as const };
    }
    return check;
  });
}
