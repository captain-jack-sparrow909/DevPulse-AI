import assert from "node:assert/strict";
import test from "node:test";
import { extractDocumentationFacts, isProductDocumentationPath } from "./documentation";
import { repositoryIsStale } from "./freshness";

test("repository documentation selection stays focused on product truth", () => {
  assert.equal(isProductDocumentationPath("README.md"), true);
  assert.equal(isProductDocumentationPath("docs/products/relay.md"), true);
  assert.equal(isProductDocumentationPath("PRODUCT_STATUS.yaml"), true);
  assert.equal(isProductDocumentationPath("src/button.tsx"), false);
  assert.equal(isProductDocumentationPath("node_modules/tool/README.md"), false);
});

test("repository knowledge is visibly stale after four hours", () => {
  const now = new Date("2026-07-18T12:00:00Z");
  assert.equal(repositoryIsStale(new Date("2026-07-18T08:30:00Z"), now), false);
  assert.equal(repositoryIsStale(new Date("2026-07-18T07:59:59Z"), now), true);
});

test("product status tables become separate evidence-backed facts", () => {
  const facts = extractDocumentationFacts({
    path: "README.md",
    content: `# Röntgen AI

| Idea | Product | Status |
|---|---|---|
| Build pipeline optimizer | Relay | Included; upload/paste CI evidence works. Automatic GitHub/GitLab ingestion remains. |
| Bug reproduction assistant | Forge | Included |
`,
  });

  assert.equal(facts.length, 2);
  assert.equal(facts[0]?.title, "Build pipeline optimizer — Relay");
  assert.match(facts[0]?.claim || "", /Automatic GitHub\/GitLab ingestion remains/);
  assert.equal(facts[0]?.lineStart, 5);
});
