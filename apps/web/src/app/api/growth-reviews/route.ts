import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createWeeklyGrowthReview } from "@/lib/growth-review/service";

export const maxDuration = 60;

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const review = await createWeeklyGrowthReview(session.user.id);
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate weekly review" },
      { status: 500 },
    );
  }
}
