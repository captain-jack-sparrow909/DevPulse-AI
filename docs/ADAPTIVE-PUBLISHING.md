# Adaptive Publishing — Phase 15

Phase 15 changes DevPulse from a calendar-filling generator into a selective publishing system. It still creates reviewable X and LinkedIn drafts and never publishes through either platform API.

## Defaults

- X: two draft windows per day.
- LinkedIn: four publishing days per week.
- Minimum overall quality: 8.0/10.
- Minimum novelty: 7.0/10.
- Owned-project cooldown: 36 hours.
- Content-type cooldown: 24 hours.

All values are editable in Settings. Turning adaptive cadence off restores the legacy `postsPerDay` schedule.

## Generation gates

Before a draft is persisted, generation checks:

1. Grounded source evidence is available.
2. Overall quality clears the configured threshold.
3. Novelty clears its independent threshold.
4. The selected owned project is outside its cooldown.
5. The content type is outside its cooldown.
6. The hook is not a near-duplicate of recent hooks.

If every candidate fails, the slot is recorded as intentionally skipped. The cron does not repeatedly spend AI budget attempting to fill it.

Approved weekly execution anchors retain priority, but the resulting draft still passes the quality and novelty gates.

## Publishing command center

`/publishing` ranks recent unpublished drafts with a deterministic score:

- 40% overall quality
- 25% novelty
- 20% engagement potential
- 15% hook quality

X and LinkedIn are evaluated independently using their own quotas and distribution-workflow publication records. LinkedIn rest days are intentional. The same grounded idea may be selected for both platforms, while each platform continues through its separate manual distribution workflow.

Posting-hour recommendations use the latest measured snapshot for each post/platform. Until three measured posts exist, DevPulse uses conservative 09:00 X and 10:00 LinkedIn fallbacks.

## Manual-only safety

Phase 15 never calls social write APIs. The command center recommends what to publish, when to publish it, and which drafts to hold back. Copying, attaching media, publishing, replying, and confirming metrics remain explicit user actions.
