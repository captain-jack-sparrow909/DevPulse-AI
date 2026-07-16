import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { decideRecommendation } from "@/lib/experiments/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  if (body.action !== "apply" && body.action !== "reject") {
    return NextResponse.json({ error: "Action must be apply or reject" }, { status: 400 });
  }
  try {
    const recommendation = await decideRecommendation(session.user.id, id, body.action);
    return NextResponse.json({ recommendation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update recommendation" },
      { status: 409 },
    );
  }
}

