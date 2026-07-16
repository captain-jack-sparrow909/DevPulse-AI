import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const BOT_PATTERN = /\b(bot|crawler|spider|slurp|preview|facebookexternalhit|linkedinbot|twitterbot|discordbot|telegrambot|whatsapp)\b/i;

export function isObviousAutomatedRequest(headers: Headers) {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`;
  if (/prefetch|preview/i.test(purpose)) return true;
  // Inspected only for filtering; never persisted or included in logs.
  return BOT_PATTERN.test(headers.get("user-agent") ?? "");
}

export function clickBucketStart(at = new Date()) {
  return new Date(Math.floor(at.getTime() / 5_000) * 5_000);
}

export function attributedDestination(link: {
  destinationUrl: string;
  appendUtm: boolean;
  platform: string;
  slug: string;
  campaignItem?: { stage: string } | null;
  ctaVariant: string;
}) {
  const url = new URL(link.destinationUrl);
  if (link.appendUtm) {
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", link.platform);
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "social");
    if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", link.slug);
    if (!url.searchParams.has("utm_content")) {
      url.searchParams.set(
        "utm_content",
        [link.campaignItem?.stage, link.ctaVariant].filter(Boolean).join("-") || "post",
      );
    }
  }
  return url.toString();
}

async function incrementExistingWindow(
  trackedLinkId: string,
  bucketStart: Date,
  automated: boolean,
) {
  const window = await prisma.trackedLinkWindow.findUnique({
    where: { trackedLinkId_bucketStart: { trackedLinkId, bucketStart } },
  });
  if (!window) return false;
  const shouldCount = !automated && window.countedClicks === 0;
  await prisma.$transaction([
    prisma.trackedLinkWindow.update({
      where: { id: window.id },
      data: {
        rawHits: { increment: 1 },
        botHits: automated ? { increment: 1 } : undefined,
        countedClicks: shouldCount ? 1 : undefined,
      },
    }),
    prisma.trackedLink.update({
      where: { id: trackedLinkId },
      data: {
        botHits: automated ? { increment: 1 } : undefined,
        clicksCount: shouldCount ? { increment: 1 } : undefined,
        lastClickedAt: shouldCount ? new Date() : undefined,
      },
    }),
  ]);
  return true;
}

export async function recordTrackedVisit(
  trackedLinkId: string,
  automated: boolean,
  at = new Date(),
) {
  const bucketStart = clickBucketStart(at);
  if (await incrementExistingWindow(trackedLinkId, bucketStart, automated)) {
    return { counted: false, automated };
  }
  try {
    await prisma.$transaction([
      prisma.trackedLinkWindow.create({
        data: {
          trackedLinkId,
          bucketStart,
          rawHits: 1,
          countedClicks: automated ? 0 : 1,
          botHits: automated ? 1 : 0,
        },
      }),
      prisma.trackedLink.update({
        where: { id: trackedLinkId },
        data: {
          botHits: automated ? { increment: 1 } : undefined,
          clicksCount: automated ? undefined : { increment: 1 },
          lastClickedAt: automated ? undefined : at,
        },
      }),
    ]);
    return { counted: !automated, automated };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await incrementExistingWindow(trackedLinkId, bucketStart, automated);
      return { counted: false, automated };
    }
    throw error;
  }
}
