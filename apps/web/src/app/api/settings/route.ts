import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { getContentStrategy, saveContentStrategy } from "@/lib/content/strategy-store";
import type { ContentStrategyConfig } from "@/lib/content/strategy";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, topics, styles, models, strategy] = await Promise.all([
    prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    prisma.topic.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.writingStyle.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.modelConfig.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    getContentStrategy(user.id),
  ]);

  return NextResponse.json({ settings, topics, styles, models, strategy });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    settings?: {
      timezone?: string;
      qualityThreshold?: number;
      postsPerDay?: number;
      firstPostHour?: number;
      lastPostHour?: number;
      defaultPlatforms?: string;
    };
    topic?: { id?: string; name: string; keywords?: string; active?: boolean; delete?: boolean };
    style?: {
      id?: string;
      name: string;
      systemPrompt: string;
      rules?: string;
      isDefault?: boolean;
    };
    model?: {
      id?: string;
      name: string;
      model: string;
      temperature?: number;
      isDefault?: boolean;
    };
    strategy?: Partial<ContentStrategyConfig>;
  };

  if (body.settings) {
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body.settings },
      update: body.settings,
    });
  }

  if (body.strategy) {
    await saveContentStrategy(user.id, body.strategy);
  }

  if (body.topic) {
    if (body.topic.delete && body.topic.id) {
      await prisma.topic.deleteMany({ where: { id: body.topic.id, userId: user.id } });
    } else if (body.topic.id) {
      await prisma.topic.updateMany({
        where: { id: body.topic.id, userId: user.id },
        data: {
          name: body.topic.name,
          keywords: body.topic.keywords ?? "",
          active: body.topic.active ?? true,
        },
      });
    } else {
      await prisma.topic.create({
        data: {
          userId: user.id,
          name: body.topic.name,
          slug: slugify(body.topic.name),
          keywords: body.topic.keywords ?? "",
          active: body.topic.active ?? true,
        },
      });
    }
  }

  if (body.style) {
    if (body.style.isDefault) {
      await prisma.writingStyle.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }
    if (body.style.id) {
      await prisma.writingStyle.updateMany({
        where: { id: body.style.id, userId: user.id },
        data: {
          name: body.style.name,
          systemPrompt: body.style.systemPrompt,
          rules: body.style.rules ?? "",
          isDefault: body.style.isDefault ?? false,
        },
      });
    } else {
      await prisma.writingStyle.create({
        data: {
          userId: user.id,
          name: body.style.name,
          systemPrompt: body.style.systemPrompt,
          rules: body.style.rules ?? "",
          isDefault: body.style.isDefault ?? false,
        },
      });
    }
  }

  if (body.model) {
    if (body.model.isDefault) {
      await prisma.modelConfig.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }
    if (body.model.id) {
      await prisma.modelConfig.updateMany({
        where: { id: body.model.id, userId: user.id },
        data: {
          name: body.model.name,
          model: body.model.model,
          temperature: body.model.temperature ?? 0.7,
          isDefault: body.model.isDefault ?? false,
        },
      });
    } else {
      await prisma.modelConfig.create({
        data: {
          userId: user.id,
          name: body.model.name,
          model: body.model.model,
          temperature: body.model.temperature ?? 0.7,
          isDefault: body.model.isDefault ?? false,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
