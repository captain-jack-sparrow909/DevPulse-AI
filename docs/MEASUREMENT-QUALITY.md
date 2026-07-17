# Measurement Automation and Data Quality

Phase 13 makes the growth loop comparable before it makes it clever. DevPulse continues to use manually entered or user-imported platform data; it does not scrape X or LinkedIn.

## Checkpoint system

Every manually posted pack receives independent X and LinkedIn tasks at:

- **1 hour** — early distribution signal;
- **24 hours** — primary comparison cohort;
- **72 hours** — secondary distribution and conversation tail;
- **7 days** — long-tail result.

Each checkpoint has a bounded age window. A row labelled `24h` but captured outside the 18–36 hour window is shown as an alert and excluded from the comparable cohort. This prevents a late cumulative result from being compared with an early result.

The Analytics page shows upcoming, due, overdue, missed, and completed tasks. A missed window remains part of coverage but leaves the actionable queue because it cannot be backfilled honestly after its age window closes. Clicking an actionable task opens the normal post-performance form; publishing remains manual.

## Coverage and confidence

The data-quality panel reports:

- all due checkpoint coverage;
- comparable 24-hour coverage;
- number of comparable posts;
- overdue tasks;
- low, medium, or high review confidence.

Weekly growth reviews now use only the latest valid 24-hour snapshot per post/platform. Confidence requires both sample size and coverage:

- **high:** at least 10 comparable posts and 80% 24-hour coverage;
- **medium:** at least 6 comparable posts and 60% coverage;
- **low:** anything below those gates.

Sparse evidence generates a collection decision instead of a strategy change.

## Safe imports

The bulk importer supports:

- the DevPulse prefilled format;
- X mode with common aliases such as `views`, `retweets`, and `bookmarks`;
- LinkedIn mode with common aliases such as `reactions`, `comments`, `shares`, and `clicks`.

Every imported row still requires a DevPulse `postId` (or `devpulsePostId`). DevPulse never guesses which internal post belongs to a social row.

Two idempotency layers prevent double counting:

1. an exact-file checksum returns the prior import instead of importing again;
2. a stable row key skips a repeated post/platform/checkpoint/capture/metric row, even when it appears in a different file.

Each completed import stores an audit row with format, row count, imported count, duplicate count, and creation time.

## Account follower checkpoints

Analytics also accepts explicit X and LinkedIn follower counts plus optional profile views. These account observations are stored separately from per-post follower deltas, because a weekly account change cannot honestly be attributed to one post without additional evidence.

## Quality alerts

The deterministic audit reports:

- snapshots captured before the recorded publish time;
- duplicate checkpoint-age rows;
- checkpoint labels outside their valid age windows;
- incomplete follower before/after pairs;
- cumulative metrics that decrease between observations.

Alerts do not silently edit data. They identify the post and platform that needs review.

## Recommended routine

1. Mark a post as published immediately after manual posting.
2. Capture X and LinkedIn metrics from the Analytics queue.
3. Treat 24-hour capture as mandatory; 1h, 72h, and 7d add diagnostic depth.
4. Save an account follower checkpoint daily or at least at the start and end of each review week.
5. Resolve data-quality alerts before applying a weekly strategy decision.
