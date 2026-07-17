# DevPulse AI — Design Document

**Product:** AI-powered, research-first content generation platform for a solo software engineer.  
**Primary surfaces:** X (Twitter) + LinkedIn  
**Cadence:** Adaptive by default—two X-oriented draft windows per day and four LinkedIn publishing days per week, with human approval required before any publish.

---

## 1. Brainstorm — What Makes This Different

Most AI content tools are **prompt-first**: “write 10 posts about AI.” That produces generic, hallucinated, repetitive content.

DevPulse is **research-first**:

1. **Ingest** fresh signals (HN, GitHub trending, arXiv, Reddit, RSS).
2. **Deduplicate + rank** topics by novelty and relevance to configured interests.
3. **Angle generation** (tip, thread, comparison, hot take, architecture breakdown…).
4. **Write → score → rewrite** until quality threshold (default 8.5/10).
5. **Human approval** is a hard gate — no auto-publish.
6. **Schedule selectively** across one or two adaptive daily draft windows.
7. **Measure** real engagement without confusing generation scores with distribution (Phase 4).
8. **Learn carefully** through controlled, approval-gated experiments (Phase 5).
9. **Repurpose visually** with grounded branded cards and carousels (Phase 6).
10. **Refresh owned-project evidence** from reviewed repository changes (Phase 7).
11. **Operate distribution manually** with ranked conversations and measurable follow-up (Phase 8).
12. **Build product narratives** through evidence-gated campaigns with measurable goals (Phase 9).
13. **Attribute outcomes safely** from aggregate clicks to explicit conversions (Phase 10).
14. **Operate reliably** with health probes, telemetry, and checkpoint-safe recovery (Phase 11).
15. **Decide from comparable evidence** in a weekly approval-gated review (Phases 12–13).
16. **Execute deliberately** through a seven-day anchor plan that still requires manual publishing (Phase 14).
17. **Publish selectively** through platform-specific quotas, quality gates, cooldowns, and measured timing (Phase 15).

For a single user on free/cheap tiers, complexity must stay low: one deployable app, DB-backed jobs instead of Redis at first, free public APIs for research, DeepSeek for LLM, Supabase when ready.

---

## 2. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime shape | **Next.js full-stack** (App Router) | TypeScript everywhere, one deploy (Vercel), no separate Nest/FastAPI until needed |
| Monorepo | `apps/web` + `packages/*` | Matches scope; shared types/AI/db without over-fragmenting |
| Database | **Prisma + Postgres (Supabase)** | One durable data model locally and in production |
| Auth | **Better Auth** (email/password) | Scope requirement; works offline with SQLite |
| Queue | **DB job table + cron** (not Redis/BullMQ yet) | Free tier; low adaptive volume does not need Redis |
| AI provider | **DeepSeek** (OpenAI-compatible API) | Cheapest quality for this volume |
| Research | Free public APIs first (HN, GitHub, arXiv, Reddit JSON, RSS) | No paid keys for Phase 1–2; Tavily optional later |
| Publish | **Manual only** — never call X/LinkedIn write APIs | X write API is paid/restricted; user posts by hand |
| Screenshots | **Playwright** (Chromium) captures source pages when helpful | Optional image per post for higher engagement |
| Agents | Modular agent interfaces; Phase 1 = sequential pipeline; Phase 3 = LangGraph | Ship value before orchestration framework |
| Storage | Local filesystem / optional R2 later | No S3 cost for solo use |
| Schedule | Adaptive default: 2 daily draft windows; LinkedIn 4 days/week | Favors attention and evidence over calendar volume |

### Daily draft windows (local timezone, configurable)

```
09:00, 18:00
```

### Selective slot-based generation

Do **not** generate content merely to fill a calendar. Each adaptive window triggers its own research + write evaluation:

1. Cron (~every 15 min) finds the earliest **due** slot without a post for today  
2. Fresh research (HN/GitHub/arXiv/Reddit/…) runs at that moment  
3. At most **one** draft is written when it clears every publishing gate
4. A weak or repetitive window is intentionally skipped
5. X and LinkedIn publishing recommendations are evaluated independently

Endpoint: `GET/POST /api/cron/slot` (protected by `CRON_SECRET`). Fills the **latest** due empty slot; older misses are auto-skipped. Manual override: **Generate** page (not required for normal operation).

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
- **SocialPerformanceSnapshot** — cumulative manual X/LinkedIn metrics (Phase 4)
- **GrowthExperiment / GrowthExperimentVariant** — controlled assignments (Phase 5)
- **StrategyRecommendation** — approval-gated learned preference (Phase 5)
- **PromptVersion** — versioned prompts
- **GenerationJob** — pipeline job status
- **WeeklyGrowthReview / WeeklyGrowthDecision** — persisted evidence and explicit decisions (Phase 12)
- **WeeklyExecutionPlan / ExecutionPlanItem** — approval-gated seven-day anchor plan (Phase 14)

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

### Phase 2 — Product-first research
- Owned-project fact cards and lane-specific external research
- Narrow GitHub/RSS, arXiv/Hugging Face, and community-source policy

### Phase 3 — Engagement-quality engine
- Platform-native LinkedIn copy and X threads
- Multiple candidates, grounding audits, hook deduplication, and quality gates

### Phase 4 — Engagement feedback
- Manual cumulative X/LinkedIn performance snapshots
- Analytics breakdowns and product-relevant conversation opportunities

### Phase 5 — Adaptive growth
- Immutable generation snapshots and balanced controlled experiments
- Bulk CSV performance import
- Evidence-gated recommendations that require explicit approval

### Phase 6 — Visual content
- Brand settings and deterministic 4:5 technical cards
- Flattened LinkedIn carousel PDFs and manual download packs
- Media-type experiments and analytics breakdowns

### Phase 7 — Project intelligence
- Read-only incremental sync for owned GitHub repositories
- Deterministic routine-change filtering with an auditable noise reason
- Pending project facts linked to commits, merged pull requests, or releases
- Human approval before a fact can influence generation or visual briefs
- Usage-aware ranking so fresh, unused approved evidence is preferred

### Phase 8 — Distribution and conversation engine
- Independent X and LinkedIn publishing checklists
- Freshness, relevance, and relationship-aware conversation ranking
- Grounded reply drafts with strict manual posting
- Creator relationship history built from recorded manual interactions
- Comment-to-content signals and assisted-versus-baseline analytics

### Phase 9 — Campaigns and launch orchestration
- Seven-stage product narratives across X and LinkedIn
- Approved project facts and audience signals as explicit evidence gates
- Campaign drafts stored as normal posts without consuming regular slots
- Manual activate, pause, reorder, skip, review, and completion controls
- Goal snapshots and campaign-versus-isolated-post performance comparison

### Phase 10 — Attribution and conversion intelligence
- Privacy-safe aggregate redirects with no visitor identifiers
- Post, platform, campaign-stage, CTA, and experiment-variant attribution
- Explicit conversion events with visible provenance
- Complete impression → click → conversion → follow funnel diagnosis
- CTA wording and placement dimensions in controlled Phase 5 experiments

### Phase 11 — Production operations and reliability
- Operational attempts separated from durable generation checkpoints
- Stage timings and bounded error classification without secrets or content bodies
- Live PostgreSQL, DeepSeek, R2, GitHub, visual-renderer, cron, and deployment checks
- Stale invocation detection and checkpoint-safe generation, visual, and repository recovery
- Thirty-day operations and health history

### Phase 12 — Weekly growth decision engine
- Persisted seven-day performance cohorts compared with the preceding seven days
- Funnel, experiment, distribution, campaign, and reliability evidence in one deterministic review
- Exactly three decisions: continue/increase, stop/reduce, and test next
- Explicit approval per decision; review generation never mutates strategy
- One-slot content-mix changes with stale snapshot checks and draft-only experiment proposals
- Historical next-week briefs with PDF and CSV export

### Phase 13 — Measurement automation and data quality
- Independent X/LinkedIn capture tasks at 1h, 24h, 72h, and 7d
- Bounded post-age windows and latest valid 24h cohorts for weekly comparisons
- Coverage-based confidence instead of raw snapshot counts
- Cumulative-regression, timing, duplicate-age, and follower-pair audits
- Idempotent file checksums and row keys for DevPulse/X/LinkedIn CSV imports
- Explicit account follower checkpoints kept separate from per-post attribution

### Phase 14 — Weekly execution planner
- Seven anchor briefs derived deterministically from the latest weekly review
- Item rejection before approval and explicit skipping after approval
- Approval blocked until all review decisions are decided
- Matching-slot content, project, angle, and media guidance without creating or publishing posts
- Passive iCalendar export and explicit drafted, published, and measured lifecycle
- Valid 24-hour checkpoint required before an anchor can be marked measured

### Phase 15 — Adaptive publishing
- X and LinkedIn quotas evaluated independently from their distribution workflows
- Strict source-evidence, overall-quality, novelty, project-cooldown, and content-type gates
- Intentionally skipped windows are successful quality decisions, not pipeline failures
- Posting-hour recommendations learned from comparable platform snapshots
- Publishing command center ranks the best eligible draft and explains every holdback

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
