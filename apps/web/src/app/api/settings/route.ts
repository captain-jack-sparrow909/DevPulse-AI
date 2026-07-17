import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { getContentStrategy, saveContentStrategy } from "@/lib/content/strategy-store";
import type { ContentStrategyConfig } from "@/lib/content/strategy";
import { DEFAULT_BRAND, getBrandSettings, safeHex } from "@/lib/visuals/brand";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, topics, styles, models, strategy, brand] = await Promise.all([
    prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    prisma.topic.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.writingStyle.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.modelConfig.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    getContentStrategy(user.id),
    getBrandSettings(user.id, user.name || "Builder"),
  ]);

  return NextResponse.json({ settings, topics, styles, models, strategy, brand });
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
      adaptiveCadenceEnabled?: boolean;
      xPostsPerDay?: number;
      linkedInPostsPerWeek?: number;
      minimumNovelty?: number;
      projectCooldownHours?: number;
      contentTypeCooldownHours?: number;
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
    brand?: {
      displayName?: string;
      handle?: string;
      tagline?: string;
      accentColor?: string;
      backgroundColor?: string;
      textColor?: string;
      footerText?: string;
    };
  };

  if (body.settings) {
    const input = body.settings;
    const bounded = (value: number | undefined, min: number, max: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : undefined;
    const settingsData = {
      ...(typeof input.timezone === "string" && input.timezone.trim()
        ? { timezone: input.timezone.trim().slice(0, 80) }
        : {}),
      ...(typeof input.defaultPlatforms === "string"
        ? { defaultPlatforms: input.defaultPlatforms.trim().slice(0, 40) }
        : {}),
      ...(typeof input.adaptiveCadenceEnabled === "boolean"
        ? { adaptiveCadenceEnabled: input.adaptiveCadenceEnabled }
        : {}),
      ...(bounded(input.postsPerDay, 1, 12) != null
        ? { postsPerDay: Math.round(bounded(input.postsPerDay, 1, 12)!) }
        : {}),
      ...(bounded(input.xPostsPerDay, 1, 4) != null
        ? { xPostsPerDay: Math.round(bounded(input.xPostsPerDay, 1, 4)!) }
        : {}),
      ...(bounded(input.linkedInPostsPerWeek, 1, 7) != null
        ? { linkedInPostsPerWeek: Math.round(bounded(input.linkedInPostsPerWeek, 1, 7)!) }
        : {}),
      ...(bounded(input.qualityThreshold, 0, 10) != null
        ? { qualityThreshold: bounded(input.qualityThreshold, 0, 10)! }
        : {}),
      ...(bounded(input.minimumNovelty, 0, 10) != null
        ? { minimumNovelty: bounded(input.minimumNovelty, 0, 10)! }
        : {}),
      ...(bounded(input.firstPostHour, 0, 23) != null
        ? { firstPostHour: Math.round(bounded(input.firstPostHour, 0, 23)!) }
        : {}),
      ...(bounded(input.lastPostHour, 0, 23) != null
        ? { lastPostHour: Math.round(bounded(input.lastPostHour, 0, 23)!) }
        : {}),
      ...(bounded(input.projectCooldownHours, 0, 168) != null
        ? { projectCooldownHours: Math.round(bounded(input.projectCooldownHours, 0, 168)!) }
        : {}),
      ...(bounded(input.contentTypeCooldownHours, 0, 168) != null
        ? {
            contentTypeCooldownHours: Math.round(
              bounded(input.contentTypeCooldownHours, 0, 168)!,
            ),
          }
        : {}),
    };
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...settingsData },
      update: settingsData,
    });
  }

  if (body.strategy) {
    await saveContentStrategy(user.id, body.strategy);
  }

  if (body.brand) {
    const current = await getBrandSettings(user.id, user.name || "Builder");
    await prisma.brandSettings.update({
      where: { userId: user.id },
      data: {
        displayName: body.brand.displayName?.trim().slice(0, 80) || current.displayName,
        handle: body.brand.handle?.trim().slice(0, 50) ?? current.handle,
        tagline: body.brand.tagline?.trim().slice(0, 120) || current.tagline,
        accentColor: safeHex(body.brand.accentColor, DEFAULT_BRAND.accentColor),
        backgroundColor: safeHex(body.brand.backgroundColor, DEFAULT_BRAND.backgroundColor),
        textColor: safeHex(body.brand.textColor, DEFAULT_BRAND.textColor),
        footerText: body.brand.footerText?.trim().slice(0, 120) || current.footerText,
      },
    });
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
