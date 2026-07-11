# DevPulse AI

**Research-first** content studio for software engineers. It turns live tech signals into ready-to-post X and LinkedIn copy—with optional screenshots—on a **slot-by-slot** schedule.

You **always post manually**. DevPulse never calls X or LinkedIn write APIs.

| | |
|---|---|
| Design | [`docs/DESIGN.md`](./docs/DESIGN.md) |
| Product scope | [`project-scope.md`](./project-scope.md) |
| App | [`apps/web`](./apps/web) |

---

## Why this exists

Most AI tools invent posts from a blank prompt. DevPulse:

1. **Ingests** live sources (Hacker News, GitHub, arXiv, Reddit; optional X **read-only** research)
2. **Ranks** them against your topics
3. **Writes one post per due slot** (not 12 at once) so afternoon news can appear the same day
4. **Scores** quality and rewrites weak drafts
5. Optionally **screenshots** the source page with Playwright when an image helps engagement
6. Leaves you a **ready pack**: copy text → attach image → post yourself → mark as posted

---

## Core rules

| Rule | Detail |
|------|--------|
| Manual posting only | No tweet create / LinkedIn share from this app |
| X API (if any) | **Research / read only** (`X_BEARER_TOKEN`) |
| Slot generation | Exactly **one** post when a slot is due; fresh research each run |
| Timezone default | **Asia/Dubai** (UAE, UTC+4) — editable in Settings |
| Daily cadence | **12 slots**, first **06:00**, last **21:00** (evenly spaced) |
| Approval | Review → approve → ready → you post → “I posted this manually” |

---

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16, React 19, Tailwind |
| Auth | Better Auth (email / password) |
| DB | SQLite locally · Postgres / Supabase later |
| ORM | Prisma 5 |
| AI | DeepSeek (OpenAI-compatible); demo mode without a key |
| Research | HN, GitHub, arXiv, Reddit (free); optional X bearer for search |
| Screenshots | Playwright (Chromium) → `public/screenshots/` |
| Cron | `GET /api/cron/slot` every ~15 min (`vercel.json`) |

---

## Quick start

```bash
# from repo root
cd apps/web
cp .env.example .env   # fill in secrets; never commit .env
npm install
npx playwright install chromium   # for screenshots
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Register** an account  
2. Run cron (below) **or** open **Generate → Generate due slot now**  
3. Each due slot produces **one** post with **live** research  
4. **Posts** → review / edit → **Approve for slot**  
5. When **Ready to post**: **Copy for manual post**, download screenshot if any, post on X/LinkedIn yourself  
6. Click **I posted this manually**

### Environment

See [`apps/web/.env.example`](./apps/web/.env.example) for all variables. Important ones:

```env
DATABASE_URL="file:./dev.db"
BETTER_AUTH_SECRET="long-random-secret"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

DEEPSEEK_API_KEY=""          # writing / scoring
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"

CRON_SECRET=""               # protect /api/cron/slot

# X — research only (never write). Prefer bearer for search.
X_BEARER_TOKEN=""
```

Without `DEEPSEEK_API_KEY`, research still runs; posts use grounded demo templates.

---

## Slot-based generation

Do **not** generate all 12 posts at 06:00.

```
06:00  → research + write slot 1
07:22  → research again + write slot 2
 …
21:00  → research again + write slot 12
```

Cron finds the earliest **due** slot without a post for today and creates **at most one** dual-format post pack (LinkedIn + X) per user per tick. It also runs retention cleanup and keeps Supabase active.

```bash
# terminal 1 — app
cd apps/web && npm run dev

# terminal 2 — always-on cron (every 15 min)
cd apps/web && npm run cron:loop

# one-shot
cd apps/web && npm run cron:once
```

Each tick: **cleanup** (posts/research &gt; 30 days, screenshots &gt; 1 day) → **promote due slots** → **generate if a slot is due**. Approving a post only flips status — the row is already in Supabase when generated.

**Vercel Hobby:** built-in Cron is limited to **once per day** (`0 6 * * *` in `vercel.json`).  
`*/15 * * * *` will **fail the deploy** on free tier. For 15‑minute slots, use a free external cron  
(e.g. cron-job.org) hitting `/api/cron/slot` with `Authorization: Bearer $CRON_SECRET`.  
See [`docs/DEPLOY-VERCEL.md`](./docs/DEPLOY-VERCEL.md).

**Supabase free tier:** use `DATABASE_URL` + `DIRECT_URL`. Optional UI flag **Allow early** can draft the next unfilled slot before its clock time.

---

## App map

| Route | Purpose |
|-------|---------|
| `/dashboard` | Stats, recent posts, system status |
| `/generate` | Due-slot generation + today’s slot board |
| `/posts` | History, search, filters |
| `/posts/[id]` | Edit, approve, copy, screenshot, mark posted |
| `/research` | Ingested sources |
| `/schedule` | Slot timeline |
| `/settings` | Topics, writing style, cadence, timezone, models |
| `/api/cron/slot` | Cron: one due-slot generation per user |
| `/api/generate` | Authenticated manual “generate due slot” |

### Post statuses

`draft` → `pending_review` → `approved` → `scheduled` → **`ready`** → **`posted_manually`**  
(also `rejected` / `failed`)

---

## Scripts

From **repo root**:

```bash
npm run dev        # Next.js dev server (apps/web)
npm run build      # Production build
npm run db:push    # prisma db push
npm run db:studio  # Prisma Studio
npm run lint       # ESLint
```

From **apps/web**:

```bash
npm run dev
npm run build
npm run start
npx prisma db push
npx playwright install chromium
```

---

## Free-tier notes

- **Vercel** — hosting + cron  
- **Supabase** — free Postgres; wipe near ~450MB when trends are stale  
- **DeepSeek** — cheap generation  
- **Tavily** — optional later for search  
- **Cloudflare R2** — optional object storage (screenshots currently local)  
- No Redis required for 12 posts/day  

---

## Project layout

```text
DevPulse AI/
├── README.md
├── project-scope.md
├── docs/DESIGN.md
├── package.json                 # root scripts → apps/web
└── apps/web/
    ├── .env.example
    ├── vercel.json              # cron every 15 min
    ├── prisma/schema.prisma
    ├── public/screenshots/      # Playwright captures (gitignored)
    └── src/
        ├── app/                 # UI + API routes
        ├── components/
        └── lib/
            ├── ai/              # pipeline, scoring, DeepSeek
            ├── integrations/    # HN, GitHub, arXiv, Reddit, X research
            ├── schedule/        # slots, promote-ready
            ├── screenshots/     # Playwright capture
            └── publish/         # manual-only policy helpers
```

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|--------|
| 1 | Done | Auth, dashboard, research, slot pipeline, screenshots, manual post UX |
| 2 | Planned | More RSS / news / clustering |
| 3 | Planned | LangGraph agent graph |
| 4 | Planned | Manual posting UX polish (clipboard pack, notifications) |
| 5 | Planned | Analytics feedback loop |

---

## Safety

- **Never** posts to X or LinkedIn via API  
- X credentials (if set) are used only for **optional research fetch**  
- Cron requires `CRON_SECRET` in production  
- Content hashes reduce duplicate drafts  
- Keep `.env` out of git; use `.env.example` as the template only  
