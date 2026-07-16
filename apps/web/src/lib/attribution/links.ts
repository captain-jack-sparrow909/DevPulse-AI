import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";

export function trackedLinkUrl(slug: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/r/${slug}`;
}

export function validDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function createTrackedLink(
  userId: string,
  input: {
    label: string;
    destinationUrl: string;
    platform: "x" | "linkedin";
    postId?: string | null;
    campaignId?: string | null;
    campaignItemId?: string | null;
    ctaVariant?: string | null;
    ctaPlacement?: string | null;
    appendUtm?: boolean;
  },
) {
  if (!validDestination(input.destinationUrl)) throw new Error("Destination must be a valid HTTP or HTTPS URL");
  const post = input.postId
      ? await prisma.post.findFirst({
        where: { id: input.postId, userId },
        include: {
          campaignItem: true,
          experimentVariant: { select: { label: true } },
        },
      })
    : null;
  if (input.postId && !post) throw new Error("Post not found");
  const campaignItemId = input.campaignItemId || post?.campaignItem?.id || null;
  const campaignItem = campaignItemId
    ? await prisma.campaignItem.findFirst({
        where: { id: campaignItemId, campaign: { userId } },
        include: { campaign: true },
      })
    : null;
  if (campaignItemId && !campaignItem) throw new Error("Campaign stage not found");
  if (post?.campaignItem && campaignItem && post.campaignItem.id !== campaignItem.id) {
    throw new Error("Post and campaign stage do not match");
  }
  if (post && campaignItem?.postId && campaignItem.postId !== post.id) {
    throw new Error("Campaign stage belongs to a different post");
  }
  const campaignId = input.campaignId || campaignItem?.campaignId || null;
  if (input.campaignId && campaignItem && input.campaignId !== campaignItem.campaignId) {
    throw new Error("Campaign and campaign stage do not match");
  }
  if (campaignId && !campaignItem) {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId }, select: { id: true } });
    if (!campaign) throw new Error("Campaign not found");
  }
  return prisma.trackedLink.create({
    data: {
      userId,
      slug: nanoid(9),
      label: input.label.trim().slice(0, 120) || "Tracked link",
      destinationUrl: input.destinationUrl,
      platform: input.platform,
      appendUtm: input.appendUtm ?? true,
      ctaVariant:
        input.ctaVariant?.trim().slice(0, 80) ||
        post?.experimentVariant?.label ||
        "default",
      ctaPlacement: input.ctaPlacement === "inline" ? "inline" : "final",
      postId: post?.id ?? input.postId ?? null,
      campaignId,
      campaignItemId,
      experimentVariantId: post?.experimentVariantId ?? null,
    },
    include: { campaignItem: true },
  });
}
