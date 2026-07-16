# Phase 9 — Campaigns and launch orchestration

Phase 9 connects individual posts into a deliberate, evidence-backed product narrative. Campaigns live outside the regular 12-slot generator: they never consume a normal slot, publish automatically, or silently change the content strategy.

## Campaign structure

Every campaign is tied to one configured owned project and one measurable goal:

- follower growth;
- GitHub stars;
- product awareness;
- beta users;
- technical credibility.

The planner creates seven stages across a 3–30 day window:

1. Problem and constraint
2. Architecture decision
3. Implementation detail
4. Progress update
5. Audience question
6. Evidence or benchmark
7. Campaign recap and goal-specific invitation

The stages can be reordered, skipped before drafting, and planned separately for X, LinkedIn, or both.

## Evidence gates

Campaign planning is intentionally strict:

- Project context comes from the configured Content Strategy.
- Decision, implementation, and progress stages require distinct approved Phase 7 facts.
- Audience stages require a saved Phase 8 question, objection, or idea.
- Proof requires a release, benchmark, measured result, or other approved numeric evidence.
- Recap requires at least two approved facts.

Missing stages remain `blocked` with a precise reason. **Refresh evidence** re-evaluates undrafted stages after facts or audience signals are added. Reordering does not change which evidence belongs to a narrative stage.

## Drafting and review

Drafting creates a normal DevPulse `Post` with:

- independently written LinkedIn copy and X thread;
- the campaign stage and evidence stored in the generation snapshot;
- a campaign-specific internal source record;
- the existing grounding, unsupported-history, numeric, hook-repetition, and platform-length audits;
- `pending_review` status and no schedule-slot assignment.

Open the generated post to edit, approve, create visuals, and publish manually. Once approved, Phase 8 automatically creates its X and LinkedIn distribution workflows.

When the campaign stage has a destination CTA, Phase 10 also creates separate tracked X and LinkedIn URLs and inserts the appropriate URL into each platform draft.

## Calls to action

Only the audience stage and final recap receive campaign CTAs by default. Campaign goals select the CTA mode:

- follower growth → restrained follow invitation;
- GitHub stars / credibility → repository invitation;
- beta users → required product or waitlist destination;
- awareness → focused question.

Custom X and LinkedIn CTA text remains optional and separate.

## Measurement

Campaign analytics use the latest cumulative X and LinkedIn snapshots attached to campaign posts. The dashboard shows:

- drafted, ready, and blocked stages;
- impressions and engagement rate;
- follower change;
- campaign engagement versus isolated-post baseline;
- manually captured destination metric and progress toward the campaign goal.

Destination metrics such as GitHub stars or beta users are recorded manually. They are never inferred from social engagement.

## Data model

- `Campaign` stores the product, goal, duration, platforms, CTA controls, and lifecycle.
- `CampaignItem` stores each evidence-gated narrative stage and its optional generated post.
- `CampaignMetricSnapshot` stores manual goal or destination metrics over time.

## Database update

Apply the Phase 9 schema once:

```bash
cd apps/web
npx prisma db push
```

Restart the development server afterward.
