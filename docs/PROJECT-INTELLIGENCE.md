# Phase 7 — Project intelligence

Phase 7 converts recent activity in owned GitHub repositories into an auditable, human-reviewed source ledger. It keeps product-led posts fresh without letting an LLM invent implementation history, outcomes, or tradeoffs.

## Workflow

1. DevPulse checks active repositories automatically every four hours. You can also sync all repositories or one repository from **Projects**.
2. DevPulse compares the saved commit SHA with the current default-branch head, then reads recent commits, merged pull requests, releases, README files, product documentation, and product-definition files when the repository changed.
3. A deterministic significance filter removes dependency locks, generated output, formatting-only work, merge commits, and other low-signal changes.
4. Each meaningful event or documented capability becomes a pending fact with a commit-pinned GitHub URL, event or blob identifier, line evidence, date, changed files, and recorded diff statistics where GitHub supplies them.
5. Inspect the upstream evidence and approve or reject the fact.
6. Only approved facts become `project` sources for generation. Unused approved facts rank first; every use is counted.
7. The selected source continues through the existing grounding audit, generation snapshot, visual brief, and manual posting workflow.

Approval only makes a fact eligible. It never generates or publishes a post automatically.

## Sync boundaries

- Sync is read-only and never writes to GitHub.
- The existing 15-minute external generation cron processes at most one repository after 3.5 hours on an otherwise idle tick. With the three configured repositories, the full refresh cycle stays inside the 3–4 hour target without exceeding Vercel Hobby cron limits.
- `/api/cron/projects` remains available for a dedicated external scheduler or Vercel Pro cron; it skips repositories still inside the freshness window.
- Unchanged repositories stop after a lightweight default-branch head check. Documents are scanned once after this feature is deployed even when the saved head is already current.
- The first sync looks back at most 30 days and caps each endpoint to a small recent window.
- Later syncs overlap the last timestamp by five minutes, while database uniqueness prevents duplicate events.
- Public repositories work without a token. `GITHUB_TOKEN` is recommended because unauthenticated GitHub REST requests have a much lower rate limit.
- A failed repository is isolated: its error is recorded without discarding results from another repository.

The implementation uses GitHub's official [commits](https://docs.github.com/en/rest/commits/commits), [pull requests](https://docs.github.com/en/rest/pulls/pulls), [releases](https://docs.github.com/en/rest/releases/releases), [Git trees](https://docs.github.com/en/rest/git/trees), and [repository contents](https://docs.github.com/en/rest/repos/contents) REST endpoints.

## Evidence model

- `OwnedRepository` stores the read-only registry and incremental sync cursor.
- `RepositoryChange` stores upstream evidence plus the significance decision and noise reason.
- `ProjectFact` stores the bounded claim, evidence JSON, review state, confidence, and usage count.

Facts begin as `pending`. Only `approved` rows are loaded by `projectSourcesForUser`. Rejected facts remain in the ledger for auditability.

When a repository has approved dynamic facts, those facts replace its generic static fallback cards. Creator-confirmed cards remain eligible alongside dynamic evidence. A stale badge appears after four hours, and generation logs the stale repository warning.

## Significance rules

Releases are always reviewable. Merged pull requests start with a high signal score. Commits need implementation terms, source-file changes, or a material diff to cross the threshold. Routine titles and generated/dependency-only files are penalized or excluded.

The score is a triage mechanism—not a truth score. Human review remains authoritative.

## Database update

After pulling Phase 7, apply the Prisma schema once:

```bash
cd apps/web
npx prisma db push
```

Then restart the development server so the generated Prisma client and Next.js server use the new models.
