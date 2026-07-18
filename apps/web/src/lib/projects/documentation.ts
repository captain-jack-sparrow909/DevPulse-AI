export interface DocumentationFactCandidate {
  key: string;
  title: string;
  claim: string;
  excerpt: string;
  lineStart: number;
  lineEnd: number;
}

const DOCUMENT_EXTENSION = /\.(?:md|mdx|txt|json|ya?ml)$/i;
const DOCUMENT_DIRECTORY = /^(?:docs?|documentation|product|products|specs?|architecture)(?:\/|$)/i;
const PRODUCT_DOCUMENT_NAME = /(?:^|\/)(?:readme|product(?:[-_ ].*)?|features?|capabilities|roadmap|ideas?|status|architecture)(?:\.[^/]+)?$/i;
const PRODUCT_SIGNAL = /\b(?:product|feature|capabilit|status|included|integration|architecture|migration|pipeline|devops|security|cost|bug|issue|deploy|monitor|review|assistant)\b/i;

function cleanCell(value: string) {
  return value
    .trim()
    .replace(/^`|`$/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .slice(0, 1_200);
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cleanCell);
}

function keyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function isProductDocumentationPath(path: string): boolean {
  const normalized = path.trim().replace(/^\.\//, "");
  if (!DOCUMENT_EXTENSION.test(normalized)) return false;
  if (/\/(?:node_modules|vendor|dist|build|coverage|\.next)\//i.test(`/${normalized}`)) return false;
  if (/^readme(?:\.[^/]+)?$/i.test(normalized)) return true;
  return DOCUMENT_DIRECTORY.test(normalized) || PRODUCT_DOCUMENT_NAME.test(normalized);
}

/** Extract reviewable claims without asking a model to invent a summary. */
export function extractDocumentationFacts(input: {
  path: string;
  content: string;
}): DocumentationFactCandidate[] {
  const lines = input.content.replace(/\r\n?/g, "\n").split("\n");
  const facts: DocumentationFactCandidate[] = [];

  for (let index = 0; index < lines.length - 2; index++) {
    const headerLine = lines[index]!;
    const separatorLine = lines[index + 1]!;
    if (!headerLine.includes("|") || !/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(separatorLine)) {
      continue;
    }
    const headers = tableCells(headerLine).map((cell) => cell.toLowerCase());
    const ideaIndex = headers.findIndex((header) => /^(?:idea|feature|capability)$/.test(header));
    const productIndex = headers.findIndex((header) => /^products?$/.test(header));
    const statusIndex = headers.findIndex((header) => /^status$/.test(header));
    if (ideaIndex < 0 || productIndex < 0 || statusIndex < 0) continue;

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
      const row = lines[rowIndex]!;
      if (!row.includes("|")) break;
      const cells = tableCells(row);
      const idea = cells[ideaIndex];
      const product = cells[productIndex];
      const status = cells[statusIndex];
      if (!idea || !product || !status) continue;
      facts.push({
        key: `table-${rowIndex + 1}-${keyPart(idea)}`,
        title: `${idea} — ${product}`.slice(0, 500),
        claim: `${idea} is documented under ${product}. Status: ${status}`.slice(0, 4_000),
        excerpt: row.trim().slice(0, 2_000),
        lineStart: rowIndex + 1,
        lineEnd: rowIndex + 1,
      });
    }
  }

  for (let index = 0; index < lines.length && facts.length < 20; index++) {
    const match = lines[index]!.match(/^\s*#{1,4}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const heading = cleanCell(match[1]!);
    const body: string[] = [];
    let end = index;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (/^\s*#{1,4}\s+/.test(lines[cursor]!)) break;
      if (lines[cursor]!.trim()) body.push(lines[cursor]!.trim());
      end = cursor;
      if (body.join(" ").length >= 1_200) break;
    }
    const excerpt = cleanCell(body.join(" "));
    if (excerpt.length < 60 || excerpt.includes("|")) continue;
    if (!PRODUCT_SIGNAL.test(`${heading} ${excerpt}`)) continue;
    facts.push({
      key: `section-${index + 1}-${keyPart(heading)}`,
      title: `${heading} — documented capability`.slice(0, 500),
      claim: `${heading}: ${excerpt}`.slice(0, 4_000),
      excerpt,
      lineStart: index + 1,
      lineEnd: Math.max(index + 1, end + 1),
    });
  }

  const unique = new Map<string, DocumentationFactCandidate>();
  for (const fact of facts) unique.set(fact.key, fact);
  return [...unique.values()].slice(0, 20);
}
