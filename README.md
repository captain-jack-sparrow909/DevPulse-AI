# DevPulse AI

**Research-first** content studio for software engineers. It turns live tech signals into ready-to-post X and LinkedIn copy—with optional screenshots—on a **slot-by-slot** schedule.

You **always post manually**. DevPulse never calls X or LinkedIn write APIs.

| | |
|---|---|
| Design | [`docs/DESIGN.md`](./docs/DESIGN.md) |
| Product scope | [`project-scope.md`](./project-scope.md) |
| Content strategy | [`docs/CONTENT-STRATEGY.md`](./docs/CONTENT-STRATEGY.md) |
| Engagement engine | [`docs/ENGAGEMENT-ENGINE.md`](./docs/ENGAGEMENT-ENGINE.md) |
| Engagement feedback | [`docs/ENGAGEMENT-FEEDBACK.md`](./docs/ENGAGEMENT-FEEDBACK.md) |
| Adaptive growth | [`docs/ADAPTIVE-GROWTH.md`](./docs/ADAPTIVE-GROWTH.md) |
| Visual content | [`docs/VISUAL-CONTENT.md`](./docs/VISUAL-CONTENT.md) |
| Project intelligence | [`docs/PROJECT-INTELLIGENCE.md`](./docs/PROJECT-INTELLIGENCE.md) |
| Distribution engine | [`docs/DISTRIBUTION-ENGINE.md`](./docs/DISTRIBUTION-ENGINE.md) |
| Campaign orchestration | [`docs/CAMPAIGNS.md`](./docs/CAMPAIGNS.md) |
| Attribution | [`docs/ATTRIBUTION.md`](./docs/ATTRIBUTION.md) |
| Production operations | [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) |
| Weekly growth review | [`docs/WEEKLY-GROWTH.md`](./docs/WEEKLY-GROWTH.md) |
| App | [`apps/web`](./apps/web) |

---

## Why this exists

Most AI tools invent posts from a blank prompt. DevPulse:

1. Starts from **owned-project facts** for DevPulse AI, Röntgen AI, and IntelliTab
2. Adds only product-relevant GitHub/RSS, arXiv/Hugging Face, or limited HN/Reddit evidence for the matching editorial lane
3. **Writes one post per due slot** (not 12 at once) so afternoon news can appear the same day
4. **Scores** quality and rewrites weak drafts
5. Optionally **screenshots** the source page with Playwright when an image helps engagement
6. Leaves you a **ready pack**: copy text → attach image → post yourself → mark as posted
7. Runs controlled X/LinkedIn experiments and applies a winning pattern only after your approval
8. Renders grounded branded PNG cards and LinkedIn carousel PDFs for manual attachment
9. Turns recent owned-repository changes into reviewable facts before they can influence generation
10. Organizes manual distribution, grounded replies, relationships, and audience-driven follow-up content
11. Coordinates evidence-backed product campaigns with measurable goals and manual review
12. Measures the privacy-safe funnel from impressions to clicks, conversions, and follower growth
13. Observes production health, stage timings, cron freshness, and checkpoint-safe recovery
14. Produces an approval-gated weekly continue/reduce/test plan from measured growth evidence

---

## Core rules

| Rule | Detail |
|------|--------|
| Manual posting only | No tweet create / LinkedIn share from this app |
| Research policy | Product-first, lane-specific, and relevance-filtered |
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
| Research | Owned projects + selective GitHub/RSS, arXiv/Hugging Face, and limited HN/Reddit |
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
2. Run cron (below) so slots auto-generate — **Generate** is only a manual override  
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

**Scheduling:** Vercel built-in Cron is **not used** (Hobby = once/day → stale data; frequent schedules break deploys).  
Use a free external cron (cron-job.org or GitHub Actions) every **15 minutes** →  
`GET /api/cron/slot` + header `Authorization: Bearer $CRON_SECRET`.  
Guide: [`docs/DEPLOY-VERCEL.md`](./docs/DEPLOY-VERCEL.md).

**Supabase free tier:** use the Supavisor transaction pooler for `DATABASE_URL` (`:6543`) and session pooler for `DIRECT_URL` (`:5432`). The direct `db.…:5432` host requires IPv6 or Supabase's IPv4 add-on. Optional UI flag **Allow early** can draft the next unfilled slot before its clock time.

---

## App map

| Route | Purpose |
|-------|---------|
| `/dashboard` | Stats, recent posts, system status |
| `/generate` | Due-slot generation + today’s slot board |
| `/posts` | History, search, filters |
| `/posts/[id]` | Edit, approve, copy, screenshot, mark posted |
| `/research` | Ingested sources |
| `/analytics` | Actual performance, recommendations, and bulk CSV metric import |
| `/experiments` | Controlled hook, ending, and X-format tests with approval-gated learning |
| `/projects` | Owned-repository sync, noise audit, and approval-gated project facts |
| `/engagement` | Manual conversation opportunities and locally saved reply drafts |
| `/distribution` | Daily publishing cycles, ranked conversations, relationships, and content signals |
| `/campaigns` | Goal-driven product narratives, evidence gates, campaign drafts, and results |
| `/attribution` | Tracked links, explicit conversions, funnel diagnosis, and CTA evidence |
| `/operations` | Production service health, runtime history, deployment readiness, and recovery queue |
| `/growth-review` | Historical seven-day comparisons and approval-gated continue, reduce, and test decisions |
| `/r/[slug]` | Public privacy-safe aggregate redirect for user-created tracked links |
| `/schedule` | Slot timeline |
| `/settings` | Topics, writing style, cadence, timezone, models |
| `/api/cron/slot` | Cron: one due-slot generation per user |
| `/api/generate` | Authenticated manual “generate due slot” |
| `/api/operations/health` | Authenticated live dependency probes |
| `/api/operations/recovery` | Authenticated checkpoint-safe retries |
| `/api/growth-reviews` | Authenticated deterministic weekly evidence snapshot and decision generation |

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
            ├── integrations/    # active collectors + historical adapters
            ├── research/        # product-first source policy and persistence
            ├── schedule/        # slots, promote-ready
            ├── screenshots/     # Playwright capture
            └── publish/         # manual-only policy helpers
```

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|--------|
| 1 | Done | Auth, dashboard, research, slot pipeline, screenshots, manual post UX |
| 2 | Done | Product-first source policy, owned-project facts, focused research lanes |
| 3 | Done | Platform-native dual packs, grounding audits, quality scoring and rewrite loops |
| 4 | Done | Performance snapshots, analytics and manual engagement opportunities |
| 5 | Done | Generation snapshots, controlled experiments, CSV import and approval-gated learning |
| 6 | Done | Visual brand settings, grounded technical cards, carousels and media experiments |
| 7 | Done | Incremental owned-repository intelligence, significance filtering and reviewed fact sources |
| 8 | Done | Manual distribution workflows, grounded reply assistance, relationship tracking and audience signals |
| 9 | Done | Evidence-gated product campaigns, platform-native narrative stages and campaign analytics |
| 10 | Done | Privacy-safe link attribution, explicit conversion evidence, funnel analytics and CTA experiments |

---

## Safety

- **Never** posts to X or LinkedIn via API  
- X credentials (if set) are used only for **optional research fetch**  
- Cron requires `CRON_SECRET` in production  
- Content hashes reduce duplicate drafts  
- Keep `.env` out of git; use `.env.example` as the template only  
