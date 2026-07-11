# Deploy DevPulse AI on Vercel

Repo: [captain-jack-sparrow909/DevPulse-AI](https://github.com/captain-jack-sparrow909/DevPulse-AI)

The Next.js app lives in **`apps/web`**. Point Vercel at that folder.

---

## 1. Import the project

1. Open [vercel.com/new](https://vercel.com/new)
2. **Import** `captain-jack-sparrow909/DevPulse-AI`
3. Configure:

| Setting | Value |
|--------|--------|
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js |
| **Build Command** | `prisma generate && next build` (or leave default from `vercel.json`) |
| **Install Command** | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` |
| **Output Directory** | *(default — leave empty)* |
| **Node.js** | 20.x |

`apps/web/vercel.json` already sets install/build commands and a **cron** every 15 minutes.

---

## 2. Environment variables

In **Project → Settings → Environment Variables**, add these for **Production** (and Preview if you want):

### Required

| Name | Notes |
|------|--------|
| `DATABASE_URL` | Supabase **pooler** `:6543` with `?pgbouncer=true&connection_limit=5&sslmode=require` |
| `DIRECT_URL` | Supabase **direct** `:5432` with `?sslmode=require` (for Prisma generate / tooling) |
| `BETTER_AUTH_SECRET` | Long random string (≥32 chars) |
| `BETTER_AUTH_URL` | Your production URL, e.g. `https://devpulse-ai.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | **Same** as `BETTER_AUTH_URL` |
| `CRON_SECRET` | Random secret; Vercel Cron + manual curls use `Authorization: Bearer …` |
| `DEEPSEEK_API_KEY` | Writing / scoring |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | `deepseek-chat` |

### Strongly recommended (research)

| Name |
|------|
| `GITHUB_TOKEN` |
| `HF_TOKEN` |
| `DEVTO_API_KEY` |
| `STACKEXCHANGE_KEY` |
| `PRODUCTHUNT_TOKEN` |
| `TAVILY_API_KEY` |
| `X_BEARER_TOKEN` |

Copy values from your local `apps/web/.env` (never commit that file).

### After first deploy

1. Note the production URL (e.g. `https://devpulse-ai-xxx.vercel.app`)
2. Update `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to that URL
3. **Redeploy** so auth cookies / redirects work

Optional: add a custom domain and set those two vars to `https://yourdomain.com`.

---

## 3. Deploy

Click **Deploy**. First build runs `prisma generate` + `next build`.

If build fails on Prisma:

- Confirm `DATABASE_URL` / `DIRECT_URL` are set
- Locally: `cd apps/web && npx prisma db push` against Supabase (schema should already be there)

---

## 4. Cron (auto-generate slots)

`vercel.json` registers:

```text
*/15 * * * *  →  GET /api/cron/slot
```

On the **Hobby** plan, Vercel Cron is available for production. Each tick:

1. Deletes posts/research older than 30 days  
2. Deletes local screenshots older than 1 day (no-op if no disk on serverless)  
3. Promotes due approved posts  
4. Generates at most one dual pack per user if a slot is due  

Protects with `CRON_SECRET` when set. Vercel’s cron requests should send the project’s auth; if your handler only accepts Bearer secret, add the secret in Vercel env and ensure Hobby/Pro cron headers match — our handler also accepts `x-vercel-cron: 1`.

---

## 5. Known free-tier limits

| Topic | Behavior on Vercel Hobby |
|-------|---------------------------|
| **Serverless timeout** | `maxDuration` set to **60s**. Full research + DeepSeek may approach the limit; if cron times out, run **Generate** from the UI or upgrade for longer timeouts. |
| **Playwright screenshots** | **Disabled** on Vercel (`VERCEL=1`). Capture still works in local `npm run dev`. |
| **Ephemeral disk** | Screenshot files do not persist across deploys; R2 later if you want cloud images. |
| **Supabase pause** | Cron every 15 min keeps the DB active. |

---

## 6. Post-deploy checklist

- [ ] Open `/register` and create your account (fresh Supabase user if DB was empty)
- [ ] Open `/research` → **Refresh research now**
- [ ] Open `/generate` → generate or wait for cron
- [ ] Confirm cron logs: **Project → Logs** or **Cron Jobs**
- [ ] Auth works with production URL (sign in / cookies)

---

## CLI alternative

```bash
cd apps/web
npx vercel login
npx vercel link          # link to the GitHub project
npx vercel env pull      # optional
npx vercel --prod
```

When linking, set root directory to `apps/web` if prompted.
