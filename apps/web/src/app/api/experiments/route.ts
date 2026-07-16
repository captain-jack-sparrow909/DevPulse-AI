import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EXPERIMENT_DIMENSIONS,
  isExperimentDimension,
  isExperimentMetric,
  type ExperimentPlatform,
} from "@/lib/experiments/definitions";
import { getExperimentViews } from "@/lib/experiments/service";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ experiments: await getExperimentViews(user.id) });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  if (!isExperimentDimension(body.dimension)) {
    return NextResponse.json({ error: "Unsupported experiment dimension" }, { status: 400 });
  }
  const definition = EXPERIMENT_DIMENSIONS[body.dimension];
  const platform: ExperimentPlatform = body.platform === "linkedin" ? "linkedin" : "x";
  if (!definition.platforms.includes(platform)) {
    return NextResponse.json({ error: `${definition.label} is not supported on ${platform}` }, { status: 400 });
  }
  const primaryMetric = isExperimentMetric(body.primaryMetric)
    ? body.primaryMetric
    : "engagement_rate";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const hypothesis = typeof body.hypothesis === "string"
    ? body.hypothesis.trim().slice(0, 500)
    : "";
  if (!name || !hypothesis) {
    return NextResponse.json({ error: "Name and hypothesis are required" }, { status: 400 });
  }
  const requestedMinimum = Number(body.minSamplePerVariant ?? 3);
  const minSamplePerVariant = Math.max(
    2,
    Math.min(20, Number.isFinite(requestedMinimum) ? Math.round(requestedMinimum) : 3),
  );
  const experiment = await prisma.growthExperiment.create({
    data: {
      userId: user.id,
      name,
      hypothesis,
      platform,
      dimension: body.dimension,
      primaryMetric,
      minSamplePerVariant,
      variants: {
        create: definition.variants.map((variant) => ({
          key: variant.key,
          label: variant.label,
          configJson: JSON.stringify(variant.config),
        })),
      },
    },
    include: { variants: true },
  });
  return NextResponse.json({ experiment }, { status: 201 });
}

