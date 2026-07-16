# Phase 5 — Adaptive growth and controlled experiments

Phase 5 closes the loop between generation and real platform outcomes. It changes one writing variable at a time, stores the exact generation context on every new post, and requires explicit approval before a winning pattern can influence future drafts.

## Generation provenance

Every newly generated post stores an immutable JSON snapshot containing:

- Slot and scheduled time
- Content type and current content mix
- Base hook, ending, X format, and LinkedIn structure
- Platform-specific experiment or learned overrides
- Selected source identity
- Assigned experiment and variant
- Applied recommendation IDs

Historical posts created before Phase 5 remain valid; they simply have no generation snapshot or experiment assignment.

If an assigned draft's LinkedIn or X copy is manually edited, DevPulse preserves its provenance but automatically excludes it from experiment results because it no longer represents the assigned treatment exactly.

## Experiment workflow

1. Create a draft experiment on `/experiments`.
2. Choose X or LinkedIn, one variable, one primary metric, and a minimum sample.
3. Activate the experiment. Activating one experiment pauses any other active experiment so a generated post is never assigned to competing tests.
4. Future slots are balanced across the experiment's two variants before writing.
5. Post manually and capture cumulative platform metrics at a consistent age.
6. DevPulse compares the latest snapshot for each post on the target platform.
7. When every variant reaches the minimum sample and the observed difference is material, create a recommendation.
8. Apply or reject the recommendation. Only an applied recommendation can affect later generation.

Supported experiment dimensions:

- Hook pattern: build decision versus technical tension
- Ending pattern: targeted question versus practical takeaway
- X format: standalone insight versus mini-thread

X and LinkedIn results are never pooled into one winner. Each experiment has one target platform.

## Metrics

Experiments can optimize for engagement, replies/comments, saves, profile visits, follow conversion, or link clicks. Rate metrics use cumulative totals from the latest post/platform snapshot rather than averaging percentages from mismatched reach levels.

The minimum sample is a guardrail, not a claim of statistical significance. DevPulse labels close results inconclusive and asks for more comparable observations.

## Bulk performance import

Analytics now provides a CSV template prefilled with recent manually posted IDs. Each post has a separate X and LinkedIn row. Imports are validated as one batch:

- `postId` must belong to the signed-in user
- `platform` must be `x` or `linkedin`
- Numeric metrics are clamped to non-negative integers
- Invalid dates or unknown post IDs reject the batch
- One import is capped at 200 rows

## Safety boundaries

- DevPulse never auto-publishes posts or replies.
- Draft experiments do not affect generation until activated.
- Recommendations do not affect generation until applied.
- Applying a recommendation supersedes the previous applied preference for the same platform and experiment dimension.
- Owned-project factual grounding and Phase 3 quality gates remain active during experiments.

## Database update

Phase 5 adds `GrowthExperiment`, `GrowthExperimentVariant`, `StrategyRecommendation`, `Post.experimentVariantId`, `Post.experimentEligible`, and `Post.generationSnapshotJson`.

```bash
cd apps/web
npx prisma db push
```

Use the Supabase session-pooler `DIRECT_URL` for schema operations.
