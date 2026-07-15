# DevPulse AI — Content Strategy

This strategy narrows DevPulse from a broad technology-news feed into a recognizable engineering point of view.

## Target audience

Software engineers building AI-powered products, production agent systems, and modern full-stack developer tools.

## Positioning

The creator is a software engineer building real AI products in public and sharing architecture decisions, measured tradeoffs, failures, and reusable implementation lessons.

## Editorial pillars

1. **Production AI agents and LLM systems** — tool use, evaluation, inference, RAG, orchestration, latency, and operations.
2. **TypeScript, Next.js, and full-stack architecture** — APIs, authentication, databases, serverless systems, state machines, cloud infrastructure, and reliability.
3. **Building real AI products in public** — concrete lessons from owned projects and related engineering work.

## Owned projects

Owned projects are seeded into each research run as first-party context. They outrank high-volume external sources for project-lesson slots, but do not dominate curated-discovery slots.

| Project | Content territory |
|---------|-------------------|
| **DevPulse AI** | Resumable AI pipelines, cron orchestration, slot scheduling, Prisma/Postgres, DeepSeek, approval state, and R2 media storage |
| **Röntgen AI** | Architecture review, data chat, repository explanation, PR review, issue-to-PR workflows, production RCA, metering, and multi-product platform design |
| **IntelliTab** | Local MLX inference, VS Code extensions, FIM completion, adaptive context, native IPC, cancellation, streaming, speculative decoding, and latency |

Project descriptions are trusted facts. The writer must not invent personal experiences, failures, implementation details, metrics, or outcomes beyond supplied project context.

## Content mix

Each ten-post editorial cycle is product-first:

| Type | Weight |
|------|-------:|
| Real project lesson | 5 |
| Architecture or code breakdown | 2 |
| Evidence-backed opinion | 1 |
| Experiment or benchmark | 1 |
| Curated external discovery | 1 |

The scheduler distributes these weights across the cycle rather than grouping identical types together.

Existing rows that still contain the original Phase 2 `4/2/2/1/1` default are upgraded in memory to `5/2/1/1/1`. Custom mixes are preserved.

## Product-first source policy

Generation no longer collects every available feed for every post. Sources are restricted by the assigned content type:

| Content type | Allowed external research |
|--------------|---------------------------|
| Real project lesson | None; owned-project facts only |
| Architecture breakdown | Product-relevant GitHub repositories and priority-5 official AI/engineering RSS |
| Experiment or benchmark | Product-relevant arXiv papers and Hugging Face models |
| Evidence-backed opinion | Product-relevant Hacker News and Reddit discussions, capped at three candidates per provider |
| Curated discovery | Product-relevant GitHub, official RSS, arXiv, and Hugging Face |

Every external candidate must match the technologies or problem areas of DevPulse AI, Röntgen AI, or IntelliTab. Dev.to, Stack Overflow, Product Hunt, Tavily, and X search are not used for post generation. Their historical provider values remain readable so old database rows do not break.

## Candidate ranking

Candidates are ordered by:

1. Audience and pillar relevance
2. Assigned content type for the slot
3. Owned-project relevance
4. Source reuse and provider diversity penalties
5. Normalized source popularity

Off-brand exclusions are applied before writing. Defaults include medical/dermatology content, consumer lifestyle, generic career advice, unrelated product launches, and beginner examples with no production lesson.

## Configuration

The complete strategy is editable in **Settings → Content strategy**:

- Target audience
- Creator positioning
- Editorial pillar descriptions and keywords
- Owned project descriptions and keywords
- Content-mix weights
- Excluded topics

Strategy data is stored per user in the `ContentStrategy` Prisma model.

## Deployment requirement

After pulling this change, apply the Prisma schema before starting generation:

```bash
cd apps/web
npx prisma db push
```

Do this against the intended Supabase project before deploying the application code. On an IPv4-only network, set `DIRECT_URL` to the Supavisor **session pooler** URI on port `5432` from Supabase's **Connect** panel. Generation now ensures every user has a default strategy row, so the new table must exist first.
