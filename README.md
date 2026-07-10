# DevPulse AI

**Research-first** AI content platform for software engineers. Generates high-quality X and LinkedIn posts from live signals (Hacker News, GitHub, arXiv, Reddit)—not from empty prompts.

Nothing is published without **your explicit approval**.

## Product principles

1. **Ingest** fresh sources  
2. **Rank** by relevance to your topics  
3. **Write** with a senior-engineer voice  
4. **Score** quality (reject / rewrite weak drafts)  
5. **Schedule** 12 posts between **6:00–21:00**  
6. **You approve** before any publish attempt  

Design notes: [`docs/DESIGN.md`](./docs/DESIGN.md) · Scope: [`project-scope.md`](./project-scope.md)

## Stack (Phase 1)

| Layer | Choice | Why |
|-------|--------|-----|
| App | Next.js 16 + React 19 + Tailwind | TypeScript everywhere, Vercel-friendly |
| Auth | Better Auth | Email/password, Prisma adapter |
| DB | SQLite (local) / Postgres later | Zero-config local; Supabase free tier ready |
| ORM | Prisma 5 | Simple schema + migrations |
| AI | DeepSeek (OpenAI-compatible) | Cheap; optional for demo mode |
| Research | HN, GitHub, arXiv, Reddit (free) | No paid keys required |

## Quick start

```bash
cd apps/web
cp .env.example .env   # already present with local defaults
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

1. **Register** an account  
2. Open **Generate** → run the pipeline  
3. Review posts → **Approve & schedule**  
4. **Publish** only after approval (dry-run without X/LinkedIn keys)

### Optional: real LLM writing

Add to `apps/web/.env`:

```env
DEEPSEEK_API_KEY=sk-...
```

Without a key, DevPulse still pulls **real research sources** and drafts **demo posts** grounded in those URLs.

### Optional: production DB

Point `DATABASE_URL` at Supabase Postgres and change `provider` in `prisma/schema.prisma` to `postgresql`.

## App map

| Route | Purpose |
|-------|---------|
| `/dashboard` | Stats, recent posts, system status |
| `/generate` | Run research → write → score pipeline |
| `/posts` | History + search/filter |
| `/posts/[id]` | Edit, approve, reject, publish |
| `/research` | Ingested sources |
| `/schedule` | 12 daily slots |
| `/settings` | Topics, writing style, cadence, models |

## Free-tier ops notes

- **Vercel** for hosting  
- **Supabase** free DB — add a wipe cron near ~450MB (trends go stale)  
- **DeepSeek** for generation  
- **Tavily** (optional later) for web search  
- **Cloudflare R2** if you need object storage  
- Skip Redis until volume demands it (DB jobs are enough for 12 posts/day)

## Roadmap

- **Phase 1** ✅ Auth, dashboard, research ingest, AI pipeline, approval, schedule UI  
- **Phase 2** More RSS / news / clustering  
- **Phase 3** LangGraph agent graph  
- **Phase 4** Live X + LinkedIn OAuth publish  
- **Phase 5** Analytics feedback loop  

## Scripts

From repo root:

```bash
npm run dev        # Next dev server
npm run build      # Production build
npm run db:push    # Sync Prisma schema
npm run db:studio  # Prisma Studio
```

## Safety

- Publish APIs refuse posts that are not `approved` / `scheduled`  
- Missing social credentials → **dry-run only** (status updated in-app, nothing sent)  
- Content hashes reduce duplicate drafts  
