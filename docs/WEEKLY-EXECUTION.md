# Weekly execution plans

Phase 14 converts the latest persisted weekly growth review into a seven-day operating plan. It is an execution layer, not a social scheduler: DevPulse never publishes to X or LinkedIn and plan approval never creates a `Post`.

## Workflow

1. Generate a weekly review in `/growth-review`.
2. Apply or reject all three evidence-bounded review decisions.
3. Create a draft in `/execution`.
4. Inspect the seven anchor briefs and reject any weak anchor.
5. Approve the plan. At least three anchors must remain and approved windows cannot overlap.
6. When the matching daily slot is generated, the approved anchor supplies its content type, owned project, angle, and media direction.
7. Review the resulting normal post draft and publish it manually.
8. Confirm publication, capture the valid 24-hour checkpoint, then mark the anchor measured or skip it explicitly.

The other daily slots retain the configured content strategy. Phase 14 adds one anchor per day; it does not replace the configured five-slot cadence.

## State model

- Plan: `draft → approved → completed`, with `cancelled` as an explicit exit.
- Item: `proposed → approved → drafted → published → measured`.
- Before approval an item may be `rejected`; after approval it may be `skipped`.

An item cannot be marked published until its linked post is `posted_manually`. It cannot be marked measured until the linked post has a performance snapshot between 18 and 36 hours after manual publication.

## Calendar export

The `.ics` download contains a 30-minute reminder for every active anchor in the plan timezone. It is passive calendar data and cannot trigger generation or publishing.

## Safety guarantees

- Draft plan creation is read-only with respect to strategy and post generation.
- Plan approval is blocked until the weekly review is fully decided.
- Every generated post retains the normal human review and manual publishing boundary.
- Rejected and skipped items cannot influence generation.
- Objectives and briefs come from persisted review evidence, content strategy, active experiments, and compatible active campaigns.
