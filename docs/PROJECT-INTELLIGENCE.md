# Phase 7 — Project intelligence

Phase 7 converts recent activity in owned GitHub repositories into an auditable, human-reviewed source ledger. It keeps product-led posts fresh without letting an LLM invent implementation history, outcomes, or tradeoffs.

## Workflow

1. Open **Projects** and sync all active repositories or one repository.
2. DevPulse reads recent commits, merged pull requests, and releases from GitHub.
3. A deterministic significance filter removes dependency locks, generated output, formatting-only work, merge commits, and other low-signal changes.
4. Each meaningful event becomes a pending fact with its GitHub URL, event identifier, date, changed files, and recorded diff statistics where GitHub supplies them.
5. Inspect the upstream evidence and approve or reject the fact.
6. Only approved facts become `project` sources for generation. Unused approved facts rank first; every use is counted.
7. The selected source continues through the existing grounding audit, generation snapshot, visual brief, and manual posting workflow.

Approval only makes a fact eligible. It never generates or publishes a post automatically.

## Sync boundaries

- Sync is read-only and never writes to GitHub.
- The first sync looks back at most 30 days and caps each endpoint to a small recent window.
- Later syncs overlap the last timestamp by five minutes, while database uniqueness prevents duplicate events.
- Public repositories work without a token. `GITHUB_TOKEN` is recommended because unauthenticated GitHub REST requests have a much lower rate limit.
- A failed repository is isolated: its error is recorded without discarding results from another repository.

The implementation uses GitHub's official [commits](https://docs.github.com/en/rest/commits/commits), [pull requests](https://docs.github.com/en/rest/pulls/pulls), and [releases](https://docs.github.com/en/rest/releases/releases) REST endpoints.

## Evidence model

- `OwnedRepository` stores the read-only registry and incremental sync cursor.
- `RepositoryChange` stores upstream evidence plus the significance decision and noise reason.
- `ProjectFact` stores the bounded claim, evidence JSON, review state, confidence, and usage count.

Facts begin as `pending`. Only `approved` rows are loaded by `projectSourcesForUser`. Rejected facts remain in the ledger for auditability.

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
