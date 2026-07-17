# Production Hardening — Phase 16

Phase 16 adds a shallow deployment check around the deeper Operations workspace.

## Readiness

`GET /api/ready` performs one database query and validates required deployment configuration. It returns:

- `200 ready` when required services and configuration are available.
- `200 degraded` when only optional configuration has warnings.
- `503 unready` when the database is unavailable or required production configuration is missing.

The response never includes environment values, connector errors, credentials, prompts, or post content. Use **Operations** for authenticated deep probes of AI, R2, GitHub, the visual renderer, cron freshness, and recovery state.

## Smoke test

After a deployment:

```bash
cd apps/web
npm run smoke -- https://your-production-domain.example
```

The script checks `/`, `/login`, and `/api/ready` with a ten-second per-route timeout. A failure prevents treating the deployment as healthy.

Local `next start` smoke checks may use HTTP on localhost. Remote production URLs must use HTTPS.

## Failure and security baseline

- Authenticated page errors show a safe retry path and point to Operations.
- A global error boundary handles root failures without exposing stack details.
- Missing routes return a branded 404.
- Every route receives `nosniff`, frame denial, strict referrer, and restrictive camera/microphone/geolocation headers.
- Composite indexes support status queues, platform measurement history, distribution state, and due schedules.
