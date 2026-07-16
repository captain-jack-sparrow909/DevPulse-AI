# Phase 10 — Attribution and conversion intelligence

Phase 10 connects social reach to aggregate clicks and explicit product outcomes. It does not identify visitors or claim that a click caused a conversion without recorded evidence.

## Privacy boundary

Tracked redirects store:

- the user-owned tracked link;
- one aggregate row per five-second link window;
- raw hit count, counted click, and obvious bot/prefetch count;
- lifetime counted clicks and filtered bot hits.

They never store IP addresses, user agents, cookies, browser fingerprints, referrers, or individual visitor events. The user agent and `Purpose` headers are inspected transiently to identify obvious bots, link previews, and prefetch requests, then discarded.

Only one human click is counted per link in a five-second window. This suppresses rapid repeats without creating a visitor identity. It may conservatively merge simultaneous clicks at the current small-account scale. Detailed windows expire after 90 days; lifetime totals stay on `TrackedLink`.

## Redirect behavior

The public route is:

```text
/r/{slug}
```

An active link redirects with HTTP 302 and adds missing UTM parameters:

- `utm_source`: `x` or `linkedin`
- `utm_medium`: `social`
- `utm_campaign`: opaque tracked-link slug
- `utm_content`: campaign stage and CTA variant

Existing destination parameters are preserved. `?dp_preview=1` and `HEAD` requests do not count, so links can be verified safely from the dashboard.

## Campaign integration

When a Phase 9 campaign stage has a destination CTA, drafting automatically creates separate X and LinkedIn tracked links, inserts the matching link into each platform’s copy, and attaches both links to the generated post and campaign stage. If drafting fails, the temporary links are removed.

Isolated or older posts can receive manually created tracked links from `/attribution`.

## Conversion evidence

Phase 10 records explicit outcomes such as:

- GitHub star;
- beta or waitlist signup;
- follower;
- repository visit;
- other conversion.

Every event retains its source (`manual`, `import`, `webhook`, or `tracked`). The initial UI creates manual events. Unlinked outcomes remain **unattributed** and are not included in attributed conversion rate.

## Funnel

The dashboard reports:

1. Linked-post impressions
2. Engagements and engagement rate
3. Profile visits
4. Aggregate tracked clicks and click-through rate
5. Explicit attributed conversions and conversion rate
6. Follower change and profile-to-follow rate

Breakdowns are available by platform, campaign stage, CTA variant, and CTA placement.

## CTA experiments

Phase 5 now supports two additional dimensions:

- CTA pattern: direct value versus question led
- CTA placement: inline versus final

Generation applies the selected treatment independently on X or LinkedIn. Tracked links inherit the post’s experiment variant. Attribution can surface a candidate leader only when each CTA group has at least three linked posts and 500 impressions; applying a winner still requires the Phase 5 controlled-experiment workflow.

## Funnel recommendations

Recommendations identify the weak transition rather than giving generic advice:

- impressions without clicks → CTA or message-match problem;
- clicks without conversion → destination or signup-friction problem;
- profile visits without follows → profile-promise problem;
- unattributed conversions → measurement-linkage problem.

## Data model

- `TrackedLink` stores the destination, platform, campaign/post/stage, CTA treatment, experiment variant, and lifetime aggregates.
- `TrackedLinkWindow` stores temporary five-second aggregate windows.
- `ConversionEvent` stores explicit outcomes and provenance.

## Database update

Apply the Phase 10 schema once:

```bash
cd apps/web
npx prisma db push
```

Restart the development server afterward.
