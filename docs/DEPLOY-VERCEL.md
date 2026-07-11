# Deploy DevPulse AI on Vercel

Repo: [captain-jack-sparrow909/DevPulse-AI](https://github.com/captain-jack-sparrow909/DevPulse-AI)

The Next.js app lives in **`apps/web`**. Point Vercel at that folder.

**Scheduling:** We do **not** use Vercel’s built-in Cron (Hobby only allows once/day, which makes posts stale). Use a **free external cron** every ~15 minutes instead.

---

## 1. Import the project

1. Open [vercel.com/new](https://vercel.com/new)
2. **Import** `captain-jack-sparrow909/DevPulse-AI`
3. Configure:

| Setting | Value |
|--------|--------|
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js |
| **Build Command** | `prisma generate && next build` (from `vercel.json`) |
| **Install Command** | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` |
| **Output Directory** | *(default — leave empty)* |
| **Node.js** | 20.x |

There is **no `crons` array** in `vercel.json` (on purpose — avoids Hobby deploy failures).

---

## 2. Environment variables

In **Project → Settings → Environment Variables**, add for **Production**:

### Required

| Name | Notes |
|------|--------|
| `DATABASE_URL` | Prefer Supabase **pooler** `:6543` (`…pooler.supabase.com:6543/…?pgbouncer=true&connection_limit=5&sslmode=require`). **Do not** use only `db.…supabase.co:5432` on Vercel — cron will fail with “Can't reach database server”. |
| `DATABASE_URL_POOLED` | Optional backup of the pooler URL. On Vercel the app prefers this if set. |
| `DIRECT_URL` | Direct `:5432` for local `prisma db push` only (optional on Vercel runtime). |
| `BETTER_AUTH_SECRET` | Long random string (≥32 chars) |
| `BETTER_AUTH_URL` | Your production URL, e.g. `https://devpulse-ai.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | **Same** as `BETTER_AUTH_URL` |
| `CRON_SECRET` | Random secret for external cron `Authorization: Bearer …` |
| `DEEPSEEK_API_KEY` | Writing / scoring |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | `deepseek-chat` |

### Strongly recommended (research)

`GITHUB_TOKEN`, `HF_TOKEN`, `DEVTO_API_KEY`, `STACKEXCHANGE_KEY`, `PRODUCTHUNT_TOKEN`, `TAVILY_API_KEY`, `X_BEARER_TOKEN`

Copy from local `apps/web/.env` (never commit that file).

### After first deploy

1. Copy production URL (e.g. `https://devpulse-ai-xxx.vercel.app`)
2. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to that URL
3. **Redeploy**

---

## 3. Deploy

Click **Deploy**. Build runs `prisma generate` + `next build`.

If Prisma fails: confirm `DATABASE_URL` / `DIRECT_URL`, and that you already ran `npx prisma db push` against Supabase locally.

### Cron error: `Can't reach database server at db.…:5432`

Vercel is using the **direct** host. Serverless often cannot reach it reliably.

1. Supabase → **Project Settings → Database → Connect**
2. Pick **Transaction pooler** (port **6543**), not Direct
3. On Vercel set `DATABASE_URL` (and optionally `DATABASE_URL_POOLED`) to that pooler URI with:

   `?pgbouncer=true&connection_limit=5&sslmode=require`

4. Confirm the project is **not paused** (Restore if needed)
5. Redeploy, then **Execute now** on cron-job.org

---

## 4. External cron (required for fresh slots)

Endpoint each tick:

```http
GET https://YOUR-APP.vercel.app/api/cron/slot
Authorization: Bearer YOUR_CRON_SECRET
```

Each call:
1. Deletes posts/research older than **30 days**
2. Screenshot cleanup (no-op on serverless disk)
3. Promotes due approved posts → `ready`
4. Generates **at most one** dual pack (LinkedIn + X) for the next due empty slot
5. Touches Supabase so free DB stays active

### Option A — cron-job.org (free, recommended)

1. Sign up at [https://cron-job.org](https://cron-job.org)
2. **Create cronjob**
3. Settings:

| Field | Value |
|-------|--------|
| Title | `DevPulse slot cron` |
| URL | `https://YOUR-APP.vercel.app/api/cron/slot` |
| Schedule | Every **15 minutes** (or every 10–20 min) |
| Request method | **GET** |
| Headers | `Authorization` = `Bearer YOUR_CRON_SECRET` (same as Vercel env) |
| Enable job | On |

4. Save → **Run now** once to test  
5. Expect a **fast** response: HTTP **202** with `{ "ok": true, "accepted": true, ... }`  
   (Work continues on Vercel for up to ~60s. cron-job.org often times out if it waits for the full research+LLM run.)  
6. Confirm in **Vercel → Logs** that the request is **200/202** and later log lines show `background ok`  
7. Check **Posts** in the app for a new pack when a slot is due  

Optional: increase cron-job.org **timeout** to 90s+ if the UI offers it (not required with the 202 quick-ack).

Optional: also set query fallback  
`https://YOUR-APP.vercel.app/api/cron/slot?secret=YOUR_CRON_SECRET`  
(if the service makes custom headers awkward).

### Option B — EasyCron / cron-job.net / GitHub Actions

Any HTTP GET scheduler works. Same URL + Bearer header.

### Option C — GitHub Actions (free minutes)

Create `.github/workflows/devpulse-cron.yml` on a schedule if you prefer GitHub’s timer:

```yaml
name: DevPulse slot cron
on:
  schedule:
    - cron: "*/15 * * * *"   # UTC
  workflow_dispatch:
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - name: Hit cron endpoint
        run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.CRON_BASE_URL }}/api/cron/slot"
```

Add repo secrets: `CRON_SECRET`, `CRON_BASE_URL` (`https://your-app.vercel.app`).

### Local always-on (while developing)

```bash
cd apps/web
npm run dev          # terminal 1
npm run cron:loop    # terminal 2 — every 15 min
```

---

## 5. Known free-tier limits

| Topic | Behavior |
|-------|----------|
| **Vercel Cron** | Not used (Hobby = max 1/day → stale data) |
| **External cron** | Free; drives fresh research all day |
| **Serverless timeout** | Hobby max **60s** for the route — heavy runs may timeout; retry next tick or Generate in UI |
| **Playwright** | Disabled on Vercel; works locally |
| **Supabase pause** | External cron traffic keeps the project active |

---

## 6. Post-deploy checklist

- [ ] Deploy succeeds (no cron config error)
- [ ] `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` = production URL
- [ ] `/register` works
- [ ] External cron **Run now** returns `ok: true`
- [ ] After a due slot, a pack appears under **Posts**
- [ ] Approve → stays in Supabase
