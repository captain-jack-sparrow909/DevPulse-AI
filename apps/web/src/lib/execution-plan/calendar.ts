export interface CalendarPlanItem {
  id: string;
  sequence: number;
  scheduledFor: Date;
  contentType: string;
  projectName: string | null;
  objective: string;
  angle: string;
  platforms: string;
  mediaType: string;
  status: string;
}

export interface CalendarPlan {
  id: string;
  weekKey: string;
  timezone: string;
  items: CalendarPlanItem[];
}

function escapeIcs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function utcStamp(date: Date): string {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function contentLabel(contentType: string): string {
  return contentType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Export is deliberately passive: it creates calendar reminders, never posts or schedules social content. */
export function executionPlanIcs(plan: CalendarPlan, generatedAt = new Date()): string {
  const activeItems = plan.items.filter((item) => !["rejected", "skipped"].includes(item.status));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DevPulse AI//Weekly Execution Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`DevPulse · ${plan.weekKey}`)}`,
    `X-WR-TIMEZONE:${escapeIcs(plan.timezone)}`,
  ];

  for (const item of activeItems) {
    const end = new Date(item.scheduledFor.getTime() + 30 * 60 * 1_000);
    const project = item.projectName ? ` · ${item.projectName}` : "";
    const description = [
      item.objective,
      `Angle: ${item.angle}`,
      `Platforms: ${item.platforms}`,
      `Media: ${item.mediaType.replaceAll("_", " ")}`,
      "Safety: review the generated draft and publish manually.",
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(`${item.id}@devpulse.ai`)}`,
      `DTSTAMP:${utcStamp(generatedAt)}`,
      `DTSTART:${utcStamp(item.scheduledFor)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeIcs(`DevPulse: ${contentLabel(item.contentType)}${project}`)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `CATEGORIES:${escapeIcs(item.platforms)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Review today's DevPulse anchor draft",
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
