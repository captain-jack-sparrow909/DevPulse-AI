import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { addOwnedRepository, ensureOwnedRepositories } from "@/lib/projects/repositories";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  try {
    await ensureOwnedRepositories(session.user.id);
    const repository = await addOwnedRepository(session.user.id, {
      fullName: typeof body.fullName === "string" ? body.fullName : "",
      name: typeof body.name === "string" ? body.name : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    });
    return NextResponse.json({ repository }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add repository" },
      { status: 400 },
    );
  }
}
