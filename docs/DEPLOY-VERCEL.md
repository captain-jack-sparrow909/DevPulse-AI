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
| `DATABASE_URL` | Prefer Supabase **transaction pooler** `:6543` (`…pooler.supabase.com:6543/…?pgbouncer=true&connection_limit=2&pool_timeout=30&sslmode=require`). **Do not** use only `db.…supabase.co:5432` on Vercel — cron will fail with “Can't reach database server”. |
| `DATABASE_URL_POOLED` | Optional backup of the pooler URL. On Vercel the app prefers this if set. |
| `DIRECT_URL` | Supavisor **session pooler** `:5432` for `prisma db push`. Use the direct `db.…:5432` URL only with IPv6 or Supabase's IPv4 add-on. |
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

For `prisma db push` on an IPv4-only network, copy the **Session pooler** URI from Supabase's **Connect** panel into `DIRECT_URL`. The direct `db.…supabase.co:5432` hostname resolves to IPv6 unless the IPv4 add-on is enabled.

### Cron error: `Can't reach database server at db.…:5432`

Vercel is using the **direct** host. Serverless often cannot reach it reliably.

1. Supabase → **Project Settings → Database → Connect**
2. Pick **Transaction pooler** (port **6543**), not Direct
3. On Vercel set `DATABASE_URL` (and optionally `DATABASE_URL_POOLED`) to that pooler URI with:

   `?pgbouncer=true&connection_limit=2&pool_timeout=30&sslmode=require`

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
1. Returns **202 in under 1s** (cron-job.org 30s cap) then runs work via `waitUntil` **in the same invocation** (no self-HTTP — Vercel returns **508 Infinite loop** if the route fetches itself).
2. Inside ~**52s**, runs as many phases as fit:
   - Project lesson: no external research chunk
   - Architecture: product-relevant GitHub + priority-5 official RSS
   - Benchmark: selective product-related arXiv + Hugging Face
   - Opinion: limited product-relevant HN + Reddit
   - Curated discovery: architecture chunk + selective research chunk
   - **Write** dual post from stored sources
3. If the budget ends mid-job, status stays `research`/`write` and the **next 15‑min cron resumes** (often finishes write alone).
4. Preps ~**50 min before** due. Screenshots: use **Recapture** in the UI.

**Do not** set `CRON_SYNC=1` with a 30s client timeout.

Phase 4 adds performance snapshots and engagement opportunities. Phase 5 adds growth experiments and generation snapshots. Phase 6 adds brand settings, generated visual assets, and media-type tracking. Phase 7 adds owned repositories, repository changes, and reviewed project facts. Phase 8 adds distribution workflows, creator relationships, and audience content signals. Phase 9 adds campaigns, evidence-gated campaign items, and campaign goal snapshots. Phase 10 adds tracked links, temporary click windows, explicit conversions, and CTA experiments. Phase 11 adds operational runs, stage events, service-health snapshots, cron freshness, and recovery controls. Phases 12–14 add weekly reviews, measurement quality, and approval-gated execution plans. Apply the current Prisma schema once before opening these workspaces:

```bash
cd apps/web
npx prisma db push
```

### Option A — cron-job.org (free, recommended)

cron-job.org free plan max request timeout is **30 seconds**. That is fine: our endpoint returns **202** immediately; research+LLM keeps running on Vercel.

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
| Request timeout | **30s** (max on free plan — OK, response is instant 202) |
| Enable job | On |

4. Save → **Run now** once to test  
5. Expect HTTP **202** with `{ "ok": true, "accepted": true, ... }` in well under 30s  
6. Confirm in **Vercel → Logs**: `dispatching detached worker…` then `worker finished status=200` / `created=1`  
7. Check **Posts** within ~1–2 minutes of a prep/due window — empty due slots retry every 15 min automatically  

Optional query fallback if custom headers are awkward:  
`https://YOUR-APP.vercel.app/api/cron/slot?secret=YOUR_CRON_SECRET`

Local debug only: `?wait=1` or env `CRON_SYNC=1` waits for full generation (not for cron-job.org).

### Manual generation behavior

The authenticated `POST /api/generate` endpoint also returns **202 immediately**. The Generate and slot-board UIs poll `GET /api/generate?operationRunId=…` for phase, log, and completion updates while the pipeline continues through `waitUntil`. Do not put a long client timeout in front of this endpoint.

### Performance deployment checklist

- Keep Vercel functions and Supabase in the same geographic region; this is the largest remaining latency lever.
- Use the transaction pooler on Vercel and keep `connection_limit=2` to avoid a connection burst from parallel server-component queries.
- Keep the session pooler on `DIRECT_URL` for local development and Prisma schema commands.
- Redeploy after changing any database URL so warm functions do not retain the previous Prisma client.

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
| **Serverless timeout** | Hobby max **60s**. Cron uses **fast research** (~20s budget, lean providers, no screenshot) so write can finish. If you still see 504, check Vercel logs for research stampede. |
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
- [ ] **Operations** → Run health checks reports database, AI, R2, GitHub, visual renderer, and deployment status
- [ ] After one external cron tick, **Operations** reports cron healthy and less than 45 minutes old
- [ ] **Weekly review** generates three decisions and both PDF and CSV downloads open correctly
- [ ] **Analytics** shows checkpoint coverage, accepts a follower checkpoint, and skips a repeated CSV import
- [ ] **Execution plan** creates seven anchors, stays locked before review decisions, exports `.ics`, and only guides generation after approval
