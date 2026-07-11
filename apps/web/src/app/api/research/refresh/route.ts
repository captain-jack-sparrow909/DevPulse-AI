import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ingestResearchFeed } from "@/lib/research/ingest";

export const maxDuration = 300;

/** Pull latest signals from all collectors into the Source table (no post generation). */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestResearchFeed(session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
