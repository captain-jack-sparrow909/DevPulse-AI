# Engagement engine

Phase 3 turns each selected source into distinct, platform-native drafts for X and LinkedIn. It does not promise distribution or follower growth; it improves the content inputs that can earn replies, saves, shares, and profile visits.

## Generation flow

1. Choose the slot's content type using the product-first `5/2/1/1/1` strategy.
2. Collect only the provider lane allowed for that content type and discard candidates unrelated to the owned products.
3. Rotate the hook, closing pattern, LinkedIn structure, and X format.
4. Ask the writer for two candidate packs from the same source facts.
5. Normalize each candidate, enforce X's 280-character limit, and attach the source URL to X.
6. Audit both platform formats and select the stronger candidate.
7. Remove any source or repository fact that has already produced a post before calling the writer.
8. Reject hard failures, low engagement scores, exact duplicates, near-identical complete drafts, and hooks that are too similar to recent posts.
9. Store the winning LinkedIn post, X post/thread, stable idea fingerprint, citations, and blended quality scores for manual review.

## Platform playbooks

### X

- The opening post must stand on its own.
- Prefer one concise post when the idea fits.
- Use a 2–5 post thread only when every post advances the explanation.
- Do not begin with `Thread`, a vague teaser, or a topic label.
- Use zero hashtags by default and never more than one without a clear reason.
- Place the source URL in the final post when it is not already present.

### LinkedIn

- Target 450–1,400 characters with short, scannable paragraphs.
- Put a concrete technical fact, decision, constraint, or result in the first three lines.
- Rotate among tension-first, observation-first, and assumption-correction structures.
- Rotate focused questions, tradeoff invitations, and practical takeaways instead of ending every post with `Thoughts?`.

## Quality gate

The deterministic audit evaluates:

- Hook strength
- Technical specificity
- Conversation value
- Scanability
- Platform fit
- Originality

Hard failures include missing X copy, over-limit X posts, unusable openings, placeholder text, excessive generic marketing language, and LinkedIn copy outside practical bounds. The final stored quality score blends the LinkedIn heuristic, per-post X heuristics, and the engagement audit, so a strong LinkedIn body cannot hide weak X copy.

## Authenticity and repetition

- The selected source is the sole factual basis for a post.
- Other owned-project descriptions provide positioning context but must not be merged into the selected project's story.
- Owned-project sources include a curated set of verified implementation facts. DevPulse AI's facts distinguish resumable work between cron ticks from failed jobs that start fresh.
- Owned projects are divided into focused fact cards. The selected card—not the project's full description—is the sole factual context for that draft.
- Optional capabilities must remain optional, targets must remain targets, and manual approval must never be phrased as permission for automatic publishing.
- The writer may not invent personal failures, before/after stories, benchmarks, usage numbers, schema fields, implementation details, or outcomes.
- Owned-project drafts reject unsupported numbers, code identifiers, collective `we/our/us` voice, and historical claims such as `early on` unless supplied by the source.
- New hooks are compared with up to 100 recent openings. Near-duplicates are rejected even when the full content hash differs.
- Both DeepSeek candidates are checked for hook similarity before one is selected, so a repeated winner does not discard a usable alternate from the same response.
- Every source and approved repository fact receives a stable idea fingerprint. Once that evidence has produced a post, wording changes cannot make it eligible again.
- Complete LinkedIn and X drafts are compared with recent posts using meaningful-word overlap, ordered word pairs, and character shingles. Changing a few words remains a duplicate.
- Regeneration keeps the original post in duplicate history until its replacement is safely stored, so it must select genuinely different evidence.
- Duplicate checks are deterministic and in-memory. They add no DeepSeek request or network round trip to the Vercel generation path.

## Configuration

The existing **Settings → Quality threshold** controls the final quality floor. Audience, pillars, project facts, content weights, and exclusions remain configurable under **Settings → Content strategy**.

Phase 3 does not add a database table, so no additional `prisma db push` is required after the Phase 2 schema has already been applied.
