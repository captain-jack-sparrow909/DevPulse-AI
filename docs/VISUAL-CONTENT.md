# Phase 6 — Visual content and repurposing

Phase 6 turns a verified post pack into branded, manually downloadable media. It does not use a second generative model and does not infer new product architecture. Visual copy starts from the post and its attached source facts, then passes a numeric-claim audit before rendering.

## Formats

### Portrait technical card

- 1200 × 1500 PNG (4:5)
- Suitable for a single-image X or LinkedIn post
- Technical-grid template with brand colors, project label, verified details, and creator footer
- Includes editable alt text

LinkedIn accepts photo ratios from 3:1 through 4:5 and recommends images at least 1080 pixels wide. X displays standard single-photo ratios between 2:1 and 3:4 in full; 4:5 lies inside that range.

### LinkedIn carousel

- Five flattened 1200 × 1500 pages
- One PDF with equal-sized pages
- Cover, context, verified details, takeaway, and follow slide
- Separate PNG cover preview inside DevPulse

LinkedIn accepts PDF document posts up to 100 MB and 300 pages. DevPulse deliberately keeps carousels short and consistent.

Official references:

- https://help.x.com/en/using-x/posting-gifs-and-pictures
- https://www.linkedin.com/help/linkedin/answer/a527229/sharing-photos-or-videos
- https://www.linkedin.com/help/linkedin/answer/a518909/upload-and-share-documents-on-linkedin

## Workflow

1. Configure display name, handle, tagline, footer, and colors in Settings → Visual brand.
2. Open a generated post.
3. Review the grounded visual title, context, details, takeaway, and alt text.
4. Generate a portrait card or LinkedIn carousel.
5. For portrait cards, choose X, LinkedIn, or both. Carousels target LinkedIn only.
6. Download the PNG or PDF.
7. Copy the platform text, attach the downloaded asset, and publish manually.
8. Mark the post as manually published and record its 24-hour metrics.

R2 is preferred in production. Local development writes generated assets below `public/generated/`, which is ignored by git. Assets are deleted with their post during retention cleanup.

## Grounding and editing

The initial brief is composed from the selected post, its source title, and its source summary. User edits remain possible, but new numeric claims must already exist in the post/source corpus. URLs stay in the post body instead of the visual.

If a post belongs to a media-type experiment:

- `text_only` blocks a visual only on the experiment's target platform; the other platform remains independent.
- `branded_visual` requires a portrait card on the experiment's target platform before the post can be marked published.
- Carousel generation is blocked only when it would replace the required branded-card treatment on that platform.

## Analytics and experiments

Phase 6 adds a media-type analytics breakdown and a new experiment dimension:

- Text only
- Branded portrait visual

X and LinkedIn are still evaluated separately. Carousel performance is tracked as its own actual media type in Analytics, but carousel-versus-card is not silently pooled into the initial media experiment.

## Database update

Phase 6 adds `BrandSettings`, `PostVisualAsset`, platform-specific recommended/actual media fields, and `PostVisualAsset.targetPlatform`.

```bash
cd apps/web
npx prisma db push
```
