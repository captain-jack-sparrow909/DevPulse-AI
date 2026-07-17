# Production operations

Phase 11 adds a production control plane without changing DevPulse's manual-publishing boundary.

## What is observed

- Generation invocations from external cron, manual overrides, and recovery actions
- Visual PNG/PDF rendering and durable-storage stages
- Owned-repository synchronization
- Service-health checks and retention cleanup

`OperationalRun` stores the invocation outcome, duration, current stage, retry chain, bounded error classification, and recovery instruction. `OperationalEvent` stores stage timings. Metadata is limited to counts and internal identifiers; prompts, post bodies, credentials, and visitor identifiers are not operational telemetry.

## Health checks

The authenticated **Operations** page checks:

| Service | Probe |
|---|---|
| PostgreSQL | `SELECT 1` through Prisma |
| DeepSeek | Authenticated models request; no completion tokens |
| Cloudflare R2 | Two-byte write followed by deletion |
| GitHub | Authenticated rate-limit request |
| Visual renderer | In-memory font-backed PNG render |
| External cron | Age and outcome of the latest observed cron generation invocation |
| Deployment | Presence and consistency of required environment groups; values are never returned |

Health snapshots are historical. The newest snapshot per service is displayed, and idle cron runs refresh snapshots at most once every six hours.

## Recovery rules

- **Generation:** only failed Phase 2+ jobs with a valid persisted checkpoint can resume. Research continues at `nextChunkIndex`; completed research resumes at write. Existing sources are preserved.
- **Visual:** only failed assets can retry. The stored, previously audited visual brief is reused and the same asset row is completed.
- **Repository:** only the selected owned repository is re-synced. Existing incremental cursors and deduplication rules remain active.

Recovery never publishes to X or LinkedIn.

## Stale work and retention

Opening Operations marks operational heartbeats older than 20 minutes as failed, visual renders older than 15 minutes as failed, and repository syncs older than 20 minutes as failed. Operational runs, their cascading events, and health snapshots are retained for 30 days. Active runs are never deleted.

## Post-deploy verification

1. Apply the Prisma schema: `npx prisma db push`.
2. Deploy the current build to Vercel.
3. Open **Operations** and run health checks.
4. Trigger the external cron once.
5. Refresh Operations and confirm `cron` becomes healthy with an invocation less than 45 minutes old.
