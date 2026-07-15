# Phase 4 — Engagement feedback loop

Phase 4 measures what happens after manual publishing. Generation quality scores remain useful gates, but they are not treated as evidence of reach, engagement, or follower growth.

## Performance snapshots

Open a post and record cumulative X or LinkedIn metrics. A snapshot stores:

- Impressions
- Likes
- Replies or comments
- Reposts or shares
- Saves
- Profile visits
- Link clicks
- Optional follower count before and after the measurement window
- Capture time and notes

Use the same measurement age for comparable posts—24 hours after publishing is the recommended default. Multiple snapshots are retained, while Analytics uses only the newest snapshot for each post/platform so cumulative totals are not double-counted.

Follower changes are directional attribution, not proof that one post caused every change during the window.

## Analytics

The Analytics page compares actual performance by:

- Platform
- Content type
- Owned project or external source
- Posting hour in the configured timezone

Recommendations remain conservative with small samples. With fewer than three tracked posts, the system asks for more data instead of changing strategy. Even with larger samples, suggested weight changes are hypotheses; Phase 4 never silently rewrites the saved content mix.

Each tracked post also receives a follow-up action based on replies, saves, reach, profile visits, and follower change.

## Engagement opportunities

The Engagement page is separate from generation research.

- X can use the optional read-only bearer token to find recent product-relevant conversations.
- LinkedIn opportunities are entered manually because the application has no LinkedIn read integration.
- Reply drafts are saved locally for review.
- The user marks an opportunity replied or dismissed after acting manually.
- DevPulse never publishes replies or posts to either platform.

The reply standard is: address a specific technical point, add a verified lesson or focused question, and avoid a product link unless it directly answers the conversation.

## Database update

Phase 4 adds `SocialPerformanceSnapshot`, `EngagementOpportunity`, and `Post.contentType`. After deploying or pulling the change, run:

```bash
cd apps/web
npx prisma db push
```

Use the Supabase session-pooler `DIRECT_URL` for schema operations, as described in the deployment guide.

