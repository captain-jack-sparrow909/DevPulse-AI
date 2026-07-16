import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import {
  attributedDestination,
  isObviousAutomatedRequest,
  recordTrackedVisit,
} from "@/lib/attribution/tracker";

async function resolveRedirect(request: Request, slug: string, count: boolean) {
  const link = await prisma.trackedLink.findUnique({
    where: { slug },
    include: { campaignItem: { select: { stage: true } } },
  });
  if (!link || link.status !== "active") {
    return NextResponse.json({ error: "Tracked link not found" }, { status: 404 });
  }
  const requestUrl = new URL(request.url);
  if (count && requestUrl.searchParams.get("dp_preview") !== "1") {
    const automated = isObviousAutomatedRequest(request.headers);
    waitUntil(
      recordTrackedVisit(link.id, automated).catch(() => {
        // Attribution failure must never block the visitor's destination.
      }),
    );
  }
  const response = NextResponse.redirect(attributedDestination(link), 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return resolveRedirect(request, slug, true);
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return resolveRedirect(request, slug, false);
}
