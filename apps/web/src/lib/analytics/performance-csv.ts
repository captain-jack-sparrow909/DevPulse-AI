export const PERFORMANCE_CSV_HEADERS = [
  "postId",
  "platform",
  "impressions",
  "likes",
  "replies",
  "reposts",
  "saves",
  "profileVisits",
  "linkClicks",
  "followersBefore",
  "followersAfter",
  "checkpoint",
  "capturedAt",
  "notes",
] as const;

export interface PerformanceCsvRecord {
  postId: string;
  platform: "x" | "linkedin";
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  followersBefore: number | null;
  followersAfter: number | null;
  checkpoint: "1h" | "24h" | "72h" | "7d" | "custom";
  capturedAt: Date;
  notes: string | null;
}

function csvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function integer(value: string | undefined): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(2_000_000_000, Math.round(parsed)));
}

function optionalInteger(value: string | undefined): number | null {
  return value == null || value.trim() === "" ? null : integer(value);
}

export function parsePerformanceCsv(csv: string, defaultPlatform?: "x" | "linkedin"): {
  records: PerformanceCsvRecord[];
  errors: string[];
} {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { records: [], errors: ["CSV is empty"] };
  const header = csvLine(lines[0]!);
  const index = new Map(header.map((name, position) => [name.trim().toLowerCase(), position]));
  const required = defaultPlatform ? ["postid"] : ["postid", "platform"];
  const missing = required.filter((name) => name === "postid"
    ? !index.has("postid") && !index.has("devpulsepostid") && !index.has("devpulse_post_id")
    : !index.has(name));
  if (missing.length) {
    return { records: [], errors: [`Missing required columns: ${missing.join(", ")}`] };
  }
  const value = (columns: string[], name: string, aliases: string[] = []) => {
    for (const candidate of [name, ...aliases]) {
      const position = index.get(candidate.toLowerCase());
      if (position != null) return columns[position];
    }
    return undefined;
  };
  const records: PerformanceCsvRecord[] = [];
  const errors: string[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = csvLine(lines[lineIndex]!);
    const rowNumber = lineIndex + 1;
    const postId = value(columns, "postId", ["devpulsePostId", "devpulse_post_id"])?.trim() || "";
    const platformValue = defaultPlatform ?? value(columns, "platform")?.trim().toLowerCase();
    if (!postId) {
      errors.push(`Row ${rowNumber}: postId is required`);
      continue;
    }
    if (platformValue !== "x" && platformValue !== "linkedin") {
      errors.push(`Row ${rowNumber}: platform must be x or linkedin`);
      continue;
    }
    const capturedValue = value(columns, "capturedAt")?.trim();
    const capturedAt = capturedValue ? new Date(capturedValue) : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      errors.push(`Row ${rowNumber}: capturedAt is invalid`);
      continue;
    }
    records.push({
      postId,
      platform: platformValue,
      impressions: integer(value(columns, "impressions", ["views"])),
      likes: integer(value(columns, "likes", ["reactions"])),
      replies: integer(value(columns, "replies", ["comments"])),
      reposts: integer(value(columns, "reposts", ["retweets", "shares"])),
      saves: integer(value(columns, "saves", ["bookmarks"])),
      profileVisits: integer(value(columns, "profileVisits", ["profile_views", "profile visits"])),
      linkClicks: integer(value(columns, "linkClicks", ["urlClicks", "clicks", "link clicks"])),
      followersBefore: optionalInteger(value(columns, "followersBefore")),
      followersAfter: optionalInteger(value(columns, "followersAfter")),
      checkpoint: (["1h", "24h", "72h", "7d"].includes(value(columns, "checkpoint")?.trim().toLowerCase() || "")
        ? value(columns, "checkpoint")!.trim().toLowerCase()
        : "custom") as PerformanceCsvRecord["checkpoint"],
      capturedAt,
      notes: value(columns, "notes")?.trim().slice(0, 1000) || null,
    });
  }
  if (records.length > 200) errors.push("A single import can contain at most 200 rows");
  return { records: records.slice(0, 200), errors };
}

function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function performanceCsvTemplate(
  posts: Array<{ id: string; title: string }>,
): string {
  const rows = posts.flatMap((post) =>
    (["x", "linkedin"] as const).map((platform) => [
      post.id,
      platform,
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "",
      "",
      "24h",
      "",
      `24h snapshot — ${post.title}`,
    ]),
  );
  return [PERFORMANCE_CSV_HEADERS.join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}
