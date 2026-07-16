

# 1. Product Vision

```text
Build an AI-powered content generation platform for software engineers.

The application should automatically generate 10–15 high-quality social media posts per day focused on:

- Artificial Intelligence
- Machine Learning
- LLMs
- Agentic AI
- Full-stack development
- JavaScript
- TypeScript
- Python
- Cloud
- AWS
- Kubernetes
- Open Source
- Trending GitHub repositories
- Trending AI papers
- Tech news

The primary platforms are:
- X (Twitter)
- LinkedIn

Each generated post should feel human-written, educational, and engaging rather than generic AI-generated content.
```

---

# 2. Goals

```text
Goals:

- Generate content automatically every day, there should be 12 posts exactly throughout the day.
- Research current trends before writing.
- Avoid hallucinated facts.
- Cite sources internally.
- Never duplicate previous posts.
- Maintain a consistent writing style.
- Produce viral-quality content.
```

---

# 3. Features

```text
Core Features

- User authentication
- Dashboard
- AI post generation
- Trend discovery
- GitHub trending integration
- Hacker News integration
- Reddit integration
- AI paper integration
- Save drafts
- Schedule posts, first post should be ready by 6am in the morning, last post should be ready by 9pm, there're 12 posts in total, the rest you can decide with a delay between them
- Publish to X, but not without my approval, my approval is must
- Publish to LinkedIn, but not without my approval, my approval is must
- Analytics
- Post history
- Search previous posts
- Topic management
- Writing style management
- AI model settings
```

---

# 4. AI Workflow

```text
Workflow:

1. Collect latest news.
2. Collect GitHub trending repositories.
3. Collect AI research papers.
4. Collect Reddit discussions.
5. Cluster topics.
6. Rank by importance.
7. Generate content ideas.
8. Generate hooks.
9. Generate posts.
10. Score posts.
11. Rewrite low-quality posts.
12. Save approved posts.
13. Schedule publishing.
```

---

# 5. Agents

```text
Create specialized AI agents.

Research Agent
- Finds trends.

Summarizer Agent
- Summarizes articles.

Content Planner
- Selects topics.

Writer Agent
- Writes posts.

Editor Agent
- Improves grammar.

Fact Checker
- Verifies claims.

SEO Agent
- Improves discoverability.

Publisher Agent
- Publishes posts.

Analytics Agent
- Learns from engagement.
```

---

# 6. Writing Style

```text
Writing style:

- Sounds like a senior software engineer.
- Avoid marketing buzzwords.
- Educational.
- Opinionated only when supported by evidence.
- Short paragraphs.
- Uses code snippets where helpful.
- Uses emojis sparingly.
- No clickbait.
- Avoid AI clichés.
```

---

# 7. X Rules

```text
Generate:

- Single tweets
- Tweet threads
- Polls
- Quote tweets
- Tips
- Code snippets
- Comparisons
- Hot takes
- Tutorials

Character limit:
280

Optimize for engagement.
```

---

# 8. LinkedIn Rules

```text
Generate:

- Long-form posts
- Storytelling
- Technical breakdowns
- Lessons learned
- Architecture posts
- Career advice
- AI insights

Length:
500–2000 characters.
```

---

# 9. Tech Stack
Note: below is for reference, we must use those technologies which provide free service if number of requests is low, since this app is 
not for public to use, only I'm going to use it, so the requests wouldn't be that high and there're many platforms that give free access if the requests are low, for example I can use vercel for deployments, Tavily provide free api access if requests are low, supabase provide a free db access which is limited to 500 mb once the storage reaches like 450mb we should have a cron that will wipeout the DB since by that time the trends would have changed so no need to have them stored, instead of S3 we've Cloudflare R2; for AI model I will get Deepseek subscription which is the cheapest of all AI providers, for others we must try to find if there is any other service providing the same for free if the requests are low and are within some limits.

```text
Frontend
- Next.js
- React
- Tailwind
- shadcn/ui

Backend
- FastAPI
or
- Node.js + NestJS

AI
- LangGraph
- LangChain

Database
- PostgreSQL

ORM
- Prisma

Queue
- Redis
- BullMQ

Scheduling
- Cron

Storage
- S3

Authentication
- Better Auth

Deployment
- Docker
```

---

# 10. Code Standards

```text
Requirements:

- TypeScript everywhere.
- Modular architecture.
- Clean Architecture.
- SOLID principles.
- Repository pattern.
- Dependency Injection.
- Unit tests.
- Integration tests.
- E2E tests.
- Documentation.
- API versioning.
```

---

# 11. Database Design

```text
Entities

Users

Posts

Topics

Sources

Tags

Research

Drafts

Schedules

PublishingJobs

Analytics

Templates

WritingStyles

Models

PromptVersions
```

---

# 12. AI Prompt System

```text
Prompt templates should be versioned.

Support:

System prompt

Developer prompt

User prompt

Few-shot examples

Output validation

JSON schema

Automatic retries
```

---

# 13. Content Quality


Example:

```text
Score each post based on:

Novelty

Accuracy

Hook quality

Readability

Virality

Technical correctness

Engagement potential

Overall score
```

Reject anything below a threshold (for example, 8.5/10) and regenerate it.

---

# 14. APIs

Include integrations such as:

* X API
* LinkedIn API
* GitHub API
* Hacker News API
* Reddit API
* arXiv API
* Google News RSS
* RSS feeds from major engineering blogs

---

# 15. Folder Structure

Ask Claude to generate something like:

```text
apps/
packages/
agents/
prompts/
workers/
database/
scripts/
docs/
tests/
```

---

# 16. Roadmap

Ask Claude to implement in phases instead of trying to build everything at once.

```text
Phase 1 — completed
- Authentication, dashboard, slot generation, screenshots, and manual posting workflow

Phase 2 — completed
- Product-first research, owned-project fact cards, GitHub/RSS and selective external evidence

Phase 3 — completed
- Platform-native X/LinkedIn generation, grounding audits, scoring, and rewrite loops

Phase 4 — completed
- Manual performance snapshots, analytics, and engagement opportunities

Phase 5 — completed
- Generation provenance, controlled growth experiments, bulk metrics, and approval-gated learning

Phase 6 — completed
- Grounded branded technical cards, LinkedIn carousels, visual settings, and media experiments

Phase 7 — completed
- Owned-repository sync, meaningful-change filtering, fact review, and approved evidence sources

Phase 8 — completed
- Manual platform distribution cycles, ranked conversations, relationship tracking, grounded replies, and audience content signals
```

## One additional recommendation

One feature that can make this stand out from typical AI post generators is to make it **research-first instead of prompt-first**. Rather than asking an LLM to invent posts, have the system:

1. Continuously ingest fresh sources (GitHub, arXiv, Hacker News, Reddit, company engineering blogs, AI news).
2. Deduplicate and rank topics by relevance and novelty.
3. Generate multiple content angles for each topic (tutorial, opinion, comparison, quick tip, thread, architecture breakdown).
4. Learn from engagement data over time to improve future recommendations.
