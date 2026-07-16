import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createTrackedLink, trackedLinkUrl } from "@/lib/attribution/links";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const platform = body.platform === "linkedin" ? "linkedin" : body.platform === "x" ? "x" : null;
  if (!platform) return NextResponse.json({ error: "Platform must be X or LinkedIn" }, { status: 400 });
  try {
    const link = await createTrackedLink(session.user.id, {
      label: typeof body.label === "string" ? body.label : "Tracked link",
      destinationUrl: typeof body.destinationUrl === "string" ? body.destinationUrl.trim() : "",
      platform,
      postId: typeof body.postId === "string" ? body.postId : null,
      campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
      campaignItemId: typeof body.campaignItemId === "string" ? body.campaignItemId : null,
      ctaVariant: typeof body.ctaVariant === "string" ? body.ctaVariant : null,
      ctaPlacement: typeof body.ctaPlacement === "string" ? body.ctaPlacement : null,
      appendUtm: body.appendUtm !== false,
    });
    return NextResponse.json({ link, trackedUrl: trackedLinkUrl(link.slug) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create tracked link" },
      { status: 400 },
    );
  }
}
