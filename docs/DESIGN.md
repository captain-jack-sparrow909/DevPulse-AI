# DevPulse AI — Design Document

**Product:** AI-powered, research-first content generation platform for a solo software engineer.  
**Primary surfaces:** X (Twitter) + LinkedIn  
**Cadence:** Exactly **12 posts/day**, first ready **6:00**, last ready **21:00**, human approval required before any publish.

---

## 1. Brainstorm — What Makes This Different

Most AI content tools are **prompt-first**: “write 10 posts about AI.” That produces generic, hallucinated, repetitive content.

DevPulse is **research-first**:

1. **Ingest** fresh signals (HN, GitHub trending, arXiv, Reddit, RSS).
2. **Deduplicate + rank** topics by novelty and relevance to configured interests.
3. **Angle generation** (tip, thread, comparison, hot take, architecture breakdown…).
4. **Write → score → rewrite** until quality threshold (default 8.5/10).
5. **Human approval** is a hard gate — no auto-publish.
6. **Schedule** across 6am–9pm (12 slots).
7. **Learn** from engagement over time (Phase 5).

For a single user on free/cheap tiers, complexity must stay low: one deployable app, DB-backed jobs instead of Redis at first, free public APIs for research, DeepSeek for LLM, Supabase when ready.

---

## 2. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime shape | **Next.js full-stack** (App Router) | TypeScript everywhere, one deploy (Vercel), no separate Nest/FastAPI until needed |
| Monorepo | `apps/web` + `packages/*` | Matches scope; shared types/AI/db without over-fragmenting |
| Database | **Prisma + SQLite (local)** / **Postgres (Supabase prod)** | Zero-config local; free Supabase later; cron wipe when ~450MB |
| Auth | **Better Auth** (email/password) | Scope requirement; works offline with SQLite |
| Queue | **DB job table + cron** (not Redis/BullMQ yet) | Free tier; 12 jobs/day doesn’t need Redis |
| AI provider | **DeepSeek** (OpenAI-compatible API) | Cheapest quality for this volume |
| Research | Free public APIs first (HN, GitHub, arXiv, Reddit JSON, RSS) | No paid keys for Phase 1–2; Tavily optional later |
| Publish | **Manual only** — never call X/LinkedIn write APIs | X write API is paid/restricted; user posts by hand |
| Screenshots | **Playwright** (Chromium) captures source pages when helpful | Optional image per post for higher engagement |
| Agents | Modular agent interfaces; Phase 1 = sequential pipeline; Phase 3 = LangGraph | Ship value before orchestration framework |
| Storage | Local filesystem / optional R2 later | No S3 cost for solo use |
| Schedule | 12 slots: 06:00–21:00, ~82 min apart | Matches “first 6am, last 9pm, 12 posts” |

### Daily schedule slots (local timezone, configurable)

```
06:00, 07:22, 08:44, 10:06, 11:28, 12:50,
14:12, 15:34, 16:56, 18:18, 19:40, 21:00
```

### Slot-based generation (not batch-of-12)

Do **not** generate all 12 posts at 6:00. Each slot triggers its own research + write run when due:

1. Cron (~every 15 min) finds the earliest **due** slot without a post for today  
2. Fresh research (HN/GitHub/arXiv/Reddit/…) runs at that moment  
3. Exactly **one** post is written for that slot  
4. Later slots re-research so afternoon news can appear the same day  

Endpoint: `GET/POST /api/cron/slot` (protected by `CRON_SECRET`). Manual: **Generate → Generate due slot now**.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js)                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Dashboard│  │ Review & │  │ Settings │  │ Auth        │ │
│  │ Calendar │  │ Approve  │  │ Topics   │  │ Better Auth │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       └─────────────┴─────────────┴───────────────┘        │
│                         API routes / server actions         │
└────────────────────────────┬────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
 packages/ai            packages/db            packages/shared
 agents + prompts       Prisma schema          types + constants
 DeepSeek client        repositories
     │
     ▼
 Integrations: HN · GitHub · arXiv · Reddit · RSS · (X/LinkedIn later)
```

### AI pipeline (research-first)

```
ResearchAgent → Summarizer → ContentPlanner → Writer
    → FactChecker → Editor → SEO → QualityScorer
    → (rewrite if score < threshold) → Draft + Schedule
```

Phase 1 implements this as a **typed sequential pipeline** with real free research sources and DeepSeek writing. LangGraph can wrap the same agent interfaces later.

---

## 4. Data Model (core)

- **User** — Better Auth user
- **Topic** — interest tags (AI, K8s, TypeScript…)
- **WritingStyle** — tone rules / system prompt fragments
- **ModelConfig** — provider, model name, temperature
- **Source** — ingested item (url, title, summary, provider)
- **ResearchRun** — batch of research for a day
- **Post** — content for X or LinkedIn, scores, status
- **Schedule** — planned publish time
- **PublishingJob** — approval + publish attempt
- **AnalyticsEvent** — engagement (Phase 5)
- **PromptVersion** — versioned prompts
- **GenerationJob** — pipeline job status

### Post statuses

`draft → pending_review → approved → scheduled → ready → posted_manually | rejected | failed`

- **ready**: slot time reached (or forced) — copy text + optional screenshot and post yourself on X/LinkedIn  
- **posted_manually**: you confirmed you posted outside DevPulse  
- **Never** auto-posts to social networks  

### Images (Playwright)

When a post benefits from media (repos, papers, demos, many LinkedIn posts), Chromium captures a viewport screenshot of the source URL into `public/screenshots/`. Text-only tips/hot takes skip images.

---

## 5. Free-tier service map

| Concern | Free / cheap choice |
|---------|---------------------|
| Hosting | Vercel |
| DB | Supabase free (wipe near 450MB) |
| AI | DeepSeek |
| Search (optional) | Tavily free tier |
| Object storage | Cloudflare R2 free tier |
| Redis | Skip until needed (or Upstash free) |
| Research APIs | HN/GitHub/arXiv/Reddit/RSS (no key or free) |

---

## 6. Phased delivery

### Phase 1 (this build) — Foundation
- Auth, dashboard, topics, writing styles, model settings
- Research ingestion (HN, GitHub trending, arXiv, Reddit)
- AI post generation pipeline + quality scoring
- Drafts, search, history
- Approval gate + schedule slots UI
- Publish adapters stubbed (safe no-op without keys)

### Phase 2 — Richer research
- More RSS, Google News, Tavily, clustering improvements

### Phase 3 — LangGraph agents
- Graph orchestration, parallel research, better rewrite loops

### Phase 4 — Manual posting UX polish
- Slot notifications, clipboard pack (text + image), mobile-friendly ready queue
- Optional X **read-only** research via Bearer token (never write)

### Phase 5 — Analytics loop
- Engagement import (manual metrics or export CSV), ranking feedback

---

## 7. Security & quality bars

- Never publish without approval.
- Store source URLs on every generated post (internal citations).
- Reject posts below quality threshold; auto-rewrite once.
- Dedup by content hash / embedding-ish title similarity.
- Secrets only in env; never commit keys.

---

## 8. PR Plan (incremental)

1. **PR1: Monorepo scaffold** — workspaces, Next.js, Tailwind, shadcn baseline  
2. **PR2: DB + Auth** — Prisma schema, Better Auth, session middleware  
3. **PR3: Dashboard shell** — navigation, post list, search  
4. **PR4: Research integrations** — HN/GitHub/arXiv/Reddit collectors  
5. **PR5: AI pipeline** — agents, DeepSeek, scoring, generation API  
6. **PR6: Review & schedule** — approve/reject, 12-slot scheduler  
7. **PR7: Settings** — topics, styles, model config  
8. **PR8: Docs & polish** — README, env example, seed data  

*(Implemented as a single cohesive Phase 1 codebase in this repo for speed; PRs above remain the logical review units.)*

---

## 9. Open questions (defaults applied)

| Question | Default for this build |
|----------|------------------------|
| Timezone | `Asia/Dubai` (UAE, UTC+4; editable in settings) |
| Platforms per run | Generate both X + LinkedIn variants when possible |
| Auth method | Email + password (solo user) |
| Quality threshold | 8.0 for demo reliability (configurable; scope suggested 8.5) |
