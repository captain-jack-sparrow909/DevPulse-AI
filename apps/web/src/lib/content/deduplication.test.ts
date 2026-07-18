import assert from "node:assert/strict";
import test from "node:test";
import {
  findNearDuplicateDraft,
  ideaFingerprintForSource,
  prepareHistoricalDrafts,
  usedIdeaPostMap,
} from "./deduplication";

const source = { provider: "project", externalId: "owned:intellitab:native-ipc" };
const original = {
  id: "post-original",
  title: "Local completion without REST",
  hook: "Your local AI code completion does not need a REST server.",
  content:
    "Your local AI code completion does not need a REST server.\n\nIntelliTab uses length-prefixed JSON over stdin and stdout between TypeScript and a persistent Python MLX process.\n\nThat keeps the local completion path focused on direct process communication.",
  contentLinkedIn: null,
  threadJson: JSON.stringify([
    "Your local AI code completion does not need a REST server.",
    "IntelliTab uses length-prefixed JSON over stdin and stdout between TypeScript and a persistent Python MLX process.",
  ]),
  ideaFingerprint: null,
  sources: [source],
};

test("a previously used source fact is a hard duplicate before wording is considered", () => {
  const history = prepareHistoricalDrafts([original]);
  const fingerprint = ideaFingerprintForSource(source);
  assert.equal(usedIdeaPostMap(history).get(fingerprint), original.id);
  const match = findNearDuplicateDraft(
    {
      title: "A better local boundary",
      hook: "Skip HTTP for local autocomplete.",
      linkedIn: "Completely different wording and structure with enough meaningful technical detail for comparison.",
      xThread: ["A different-looking post."],
    },
    fingerprint,
    history,
  );
  assert.equal(match?.kind, "idea");
  assert.equal(match?.postId, original.id);
});

test("whole-post comparison rejects a draft with only a few words changed", () => {
  const history = prepareHistoricalDrafts([original]);
  const match = findNearDuplicateDraft(
    {
      title: "Local completion without an HTTP server",
      hook: "Local AI code completion does not require a REST server.",
      linkedIn:
        "Local AI code completion does not require a REST server.\n\nIntelliTab sends length-prefixed JSON through stdin and stdout between TypeScript and a persistent Python MLX process.\n\nThat keeps its local completion path centered on direct process communication.",
      xThread: [
        "Local AI code completion does not require a REST server.",
        "IntelliTab sends length-prefixed JSON through stdin and stdout between TypeScript and a persistent Python MLX process.",
      ],
    },
    ideaFingerprintForSource({ provider: "github", externalId: "different-source" }),
    history,
  );
  assert.equal(match?.kind, "content");
  assert.ok((match?.similarity ?? 0) >= 0.68);
});

test("a genuinely different technical lesson is not blocked", () => {
  const history = prepareHistoricalDrafts([original]);
  const match = findNearDuplicateDraft(
    {
      title: "Why resumable cron stages matter",
      hook: "A failed screenshot should not restart research.",
      linkedIn:
        "DevPulse records each pipeline stage in Postgres before moving forward. A failed visual step can resume independently, while completed research remains available. This makes retry behavior explicit and keeps manual review at the end of the workflow.",
      xThread: [
        "A failed screenshot should not restart research.",
        "Persist stage completion, then resume from the last successful boundary.",
      ],
    },
    ideaFingerprintForSource({ provider: "project", externalId: "owned:devpulse:resumable-jobs" }),
    history,
  );
  assert.equal(match, null);
});

