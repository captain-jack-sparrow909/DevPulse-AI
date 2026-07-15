import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/settings-form";
import { getContentStrategy } from "@/lib/content/strategy-store";

export default async function SettingsPage() {
  const session = await requireUser();
  const userId = session.user.id;

  const [settings, topics, styles, models, strategy] = await Promise.all([
    prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    prisma.topic.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.writingStyle.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.modelConfig.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    getContentStrategy(userId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="page-kicker mb-2">Preferences</div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Topics, writing style, model config, and daily cadence.
        </p>
      </div>
      <SettingsForm
        settings={{
          timezone: settings.timezone,
          qualityThreshold: settings.qualityThreshold,
          postsPerDay: settings.postsPerDay,
          firstPostHour: settings.firstPostHour,
          lastPostHour: settings.lastPostHour,
          defaultPlatforms: settings.defaultPlatforms,
        }}
        topics={topics}
        styles={styles}
        models={models}
        strategy={strategy}
      />
    </div>
  );
}
