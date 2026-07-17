import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runServiceHealthChecks } from "@/lib/operations/health";

export const maxDuration = 30;

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runServiceHealthChecks(session.user.id, "manual");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Health check failed" },
      { status: 500 },
    );
  }
}
