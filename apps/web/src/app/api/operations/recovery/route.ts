import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  recoverGenerationJob,
  recoverRepositorySync,
  recoverVisualAsset,
} from "@/lib/operations/recovery";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const id = typeof body.id === "string" ? body.id : "";
  if (!id || !["generation", "visual", "repository"].includes(kind)) {
    return NextResponse.json({ error: "Supported recovery kind and id are required" }, { status: 400 });
  }
  try {
    const result = kind === "generation"
      ? await recoverGenerationJob(session.user.id, id)
      : kind === "visual"
        ? await recoverVisualAsset(session.user.id, id)
        : await recoverRepositorySync(session.user.id, id);
    return NextResponse.json({ kind, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recovery failed";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
