# Weekly Growth Decision Engine

Phase 12 turns the evidence already stored by DevPulse into a small weekly operating plan. It does not ask an LLM to invent a strategy and it never publishes or mutates generation settings during review creation.

## Review window

`/growth-review` compares the seven days ending when the review is generated with the preceding seven days. A review is stored once per local calendar day in the user's configured timezone, so the evidence and recommendations remain auditable even after metrics change.

The engine consults:

- latest cumulative X and LinkedIn snapshot for each post/platform in the period;
- content type, owned project, media, and platform breakdowns;
- windowed privacy-safe tracked-link clicks and explicit conversions;
- active and completed controlled experiments;
- assisted versus baseline distribution;
- campaign coverage and current-period campaign post performance;
- operational success and latest service health;
- the content mix that existed when the review was generated.

## Exactly three decisions

Every review contains these categories in priority order:

1. **Continue / increase** — identifies a repeated leading content lane, or explicitly says to keep collecting if the sample is sparse.
2. **Stop / reduce** — proposes at most a one-slot mix shift only when both lanes have at least three posts, 100 impressions, and a meaningful relative performance gap. No lane is reduced below weight 1.
3. **Test next** — selects the bottleneck-supported CTA, ending, hook, or media experiment. With fewer than six tracked posts it asks for more metrics instead.

Confidence and thresholds are deterministic. Missing data reduces confidence; it never becomes an invented result.

## Approval boundary

Generating a review creates three `pending` decisions and changes nothing else.

- Applying a mix decision verifies that the current mix still matches the review snapshot before updating it.
- Applying a test decision creates a **draft** experiment. The experiment still requires activation on `/experiments`.
- Applying a retain, hold, or metric-collection decision records acknowledgement only.
- Rejecting a decision records the choice without changing strategy.

Once all three decisions are applied or rejected, the review becomes `reviewed`. The audit result is stored with each decision.

## Exports

Each review can be downloaded as:

- a concise PDF decision memo;
- CSV rows for review, decisions, and the next-week brief.

Exports are generated from the persisted review rather than recomputing live metrics.

## Operating routine

1. Record post metrics at a consistent age, ideally 24 hours.
2. Record follower before/after values and use tracked links for product CTAs.
3. Open `/growth-review` once per week and generate the review.
4. Inspect all three decisions; apply or reject them individually.
5. Activate any newly created draft experiment separately.
6. Use the next-week brief as a planning guardrail, not as an automatic posting queue.
