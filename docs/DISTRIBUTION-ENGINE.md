# Phase 8 — Distribution and conversation engine

Phase 8 adds the manual operating system around each post. Strong generation is not sufficient by itself: posts also need deliberate platform preparation, relevant conversations, timely follow-up, and a way to turn audience questions into the next useful piece of content.

DevPulse still performs no social write actions. It never likes, follows, replies, or publishes through X or LinkedIn APIs.

## Distribution workspace

The `/distribution` route combines four workflows:

1. **Platform-specific publishing cycles** — every approved, scheduled, ready, or manually posted item receives independent X and LinkedIn checklists.
2. **Priority conversations** — new opportunities are ranked by freshness, technical relevance, author context, and existing relationship priority.
3. **Relationship ledger** — marking a reply as manually posted records the creator, interaction count, and last interaction time.
4. **Comment-to-content loop** — useful questions, objections, and ideas can be saved as future content signals.

## Manual publishing cycle

Each platform progresses through six explicit actions:

1. Confirm copy and asset.
2. Join relevant conversations before publishing.
3. Publish manually.
4. Review and answer substantive comments.
5. Capture platform metrics at a consistent age.
6. Complete the distribution cycle.

The timestamps make the workflow measurable without pretending that DevPulse performed the platform action.

## Grounded reply drafting

Reply drafting receives only the selected conversation and, when relevant, one human-approved Phase 7 project fact. The draft audit rejects:

- URLs and hashtags;
- generic praise such as “great post”;
- platform-length violations;
- numbers absent from the supplied conversation or approved fact.

When DeepSeek is unavailable or a draft fails validation, DevPulse returns a safe focused-question fallback. Every reply remains editable and must be posted manually.

## Distribution comparison

The workspace compares the latest cumulative platform snapshots for:

- workflows where pre-publish engagement was recorded; and
- the current baseline without that recorded step.

This is directional evidence, not causal proof. Use Phase 5 experiments and comparable samples before changing strategy.

## Data model

- `DistributionWorkflow` stores the per-post, per-platform checklist timestamps.
- `CreatorRelationship` stores repeat interaction history and priority.
- `ContentSignal` stores audience questions, objections, and ideas.
- `EngagementOpportunity` now stores priority, outcome, reply time, and an optional relationship.

## Database update

Apply the schema once after Phase 8:

```bash
cd apps/web
npx prisma db push
```

Restart the development server afterward so Prisma Client uses the new models.
