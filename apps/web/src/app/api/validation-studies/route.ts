import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { captureGrowthValidationCheckpoint, createGrowthValidationStudy } from "@/lib/validation/service";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("capture"), studyId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid validation action." }, { status: 400 });

  try {
    const study = parsed.data.action === "start"
      ? await createGrowthValidationStudy(session.user.id)
      : await captureGrowthValidationCheckpoint(session.user.id, parsed.data.studyId);
    return NextResponse.json({ study });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation action failed.";
    return NextResponse.json({ error: message }, { status: message.includes("not due") ? 409 : 500 });
  }
}
