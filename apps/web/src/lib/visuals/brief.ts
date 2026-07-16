import type { VisualBrief } from "@/lib/visuals/types";

export interface VisualPostInput {
  title: string | null;
  hook: string | null;
  content: string;
  contentType: string | null;
  sources: Array<{
    source: {
      provider: string;
      externalId: string;
      title: string;
      summary: string | null;
    };
  }>;
}

function clean(value: string): string {
  return value
    .replace(/\[([^\]]+)]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[-•→#\d./\s]+/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limit(value: string, length: number): string {
  if (value.length <= length) return value;
  const sliced = value.slice(0, length - 1).replace(/\s+\S*$/, "").trim();
  return `${sliced}…`;
}

function sentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter((item) => item.length >= 24);
}

function contentTypeLabel(value: string | null): string {
  return (value || "builder insight")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildVisualBrief(post: VisualPostInput): VisualBrief {
  const source = post.sources[0]?.source;
  const paragraphs = post.content
    .split(/\n+/)
    .map(clean)
    .filter((paragraph) => paragraph.length >= 24);
  const sourceFacts = sentences(source?.summary || "");
  const title = limit(clean(post.hook || post.title || source?.title || "Engineering decision"), 110);
  const subtitleCandidate = paragraphs.find((paragraph) => paragraph !== title) || sourceFacts[0] || source?.title || "";
  const bulletCandidates = [...sourceFacts, ...paragraphs]
    .filter((item) => item !== title && item !== subtitleCandidate)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 3)
    .map((item) => limit(item, 165));
  const projectSource = post.sources.find(({ source: item }) => item.provider === "project")?.source;
  const project = projectSource?.title.split(":")[0]?.trim() || source?.title.split(":")[0]?.trim() || "DevPulse AI";
  const takeaway = limit(paragraphs.at(-1) || subtitleCandidate, 210);
  const allowedFacts = [
    post.title,
    post.hook,
    post.content,
    ...post.sources.flatMap(({ source: item }) => [item.title, item.summary]),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    eyebrow: contentTypeLabel(post.contentType),
    title,
    subtitle: limit(subtitleCandidate, 250),
    bullets: bulletCandidates.length ? bulletCandidates : [limit(subtitleCandidate, 165)],
    project: limit(project, 50),
    takeaway,
    sourceLabel: source ? `${source.provider.toUpperCase()} · ${limit(source.title, 72)}` : "OWNED PROJECT",
    altText: limit(`Technical visual about ${title}. ${subtitleCandidate}`, 400),
    allowedFacts,
  };
}

function numberClaims(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?(?:%|ms|s|mb|gb|tb|x|×)?(?=\s|$|[.,;:!?])/gi) || [];
}

export function validateVisualBrief(brief: VisualBrief): string[] {
  const errors: string[] = [];
  if (!brief.title.trim()) errors.push("A visual title is required");
  if (brief.title.length > 120) errors.push("Visual title must be 120 characters or fewer");
  if (brief.subtitle.length > 300) errors.push("Visual subtitle must be 300 characters or fewer");
  if (!brief.bullets.length || brief.bullets.length > 4) errors.push("Use between one and four verified details");
  if (brief.bullets.some((bullet) => bullet.length > 190)) errors.push("Each verified detail must be 190 characters or fewer");
  const visualText = [brief.title, brief.subtitle, ...brief.bullets, brief.takeaway].join(" ");
  const allowed = brief.allowedFacts.toLowerCase();
  const unsupportedNumbers = numberClaims(visualText).filter(
    (claim) => !allowed.includes(claim.toLowerCase()),
  );
  if (unsupportedNumbers.length) {
    errors.push(`Unsupported numeric claims: ${[...new Set(unsupportedNumbers)].join(", ")}`);
  }
  if (/https?:\/\//i.test(visualText)) errors.push("Put repository links in the post text, not inside the visual body");
  return errors;
}
