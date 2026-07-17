"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentStrategyConfig } from "@/lib/content/strategy";

type Settings = {
  timezone: string;
  qualityThreshold: number;
  postsPerDay: number;
  firstPostHour: number;
  lastPostHour: number;
  defaultPlatforms: string;
  adaptiveCadenceEnabled: boolean;
  xPostsPerDay: number;
  linkedInPostsPerWeek: number;
  minimumNovelty: number;
  projectCooldownHours: number;
  contentTypeCooldownHours: number;
};

type Topic = { id: string; name: string; keywords: string; active: boolean };
type Style = {
  id: string;
  name: string;
  systemPrompt: string;
  rules: string;
  isDefault: boolean;
};
type Model = {
  id: string;
  name: string;
  model: string;
  temperature: number;
  isDefault: boolean;
};
type Brand = {
  displayName: string;
  handle: string;
  tagline: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  footerText: string;
};

export function SettingsForm({
  settings: initialSettings,
  topics: initialTopics,
  styles: initialStyles,
  models: initialModels,
  strategy: initialStrategy,
  brand: initialBrand,
}: {
  settings: Settings;
  topics: Topic[];
  styles: Style[];
  models: Model[];
  strategy: ContentStrategyConfig;
  brand: Brand;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [topics, setTopics] = useState(initialTopics);
  const [styles] = useState(initialStyles);
  const [models] = useState(initialModels);
  const [strategy, setStrategy] = useState(initialStrategy);
  const [brand, setBrand] = useState(initialBrand);
  const [newTopic, setNewTopic] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function patch(body: unknown) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage("Save failed");
      return;
    }
    setMessage("Saved");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Cadence, timezone, quality gate</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Timezone</label>
            <Input
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Quality threshold (0–10)</label>
            <Input
              type="number"
              step="0.1"
              value={settings.qualityThreshold}
              onChange={(e) =>
                setSettings({ ...settings, qualityThreshold: Number(e.target.value) })
              }
            />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-teal-400/15 bg-teal-400/[0.05] p-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.adaptiveCadenceEnabled}
              onChange={(event) =>
                setSettings({ ...settings, adaptiveCadenceEnabled: event.target.checked })
              }
              className="h-4 w-4 accent-teal-400"
            />
            <span>
              <span className="block text-sm font-medium text-teal-100">Adaptive cadence</span>
              <span className="block text-xs text-zinc-500">
                Generate fewer high-confidence drafts and let each platform publish independently.
              </span>
            </span>
          </label>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">X posts per day</label>
            <Input
              type="number"
              min={1}
              max={4}
              value={settings.xPostsPerDay}
              onChange={(e) => setSettings({ ...settings, xPostsPerDay: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">LinkedIn posts per week</label>
            <Input
              type="number"
              min={1}
              max={7}
              value={settings.linkedInPostsPerWeek}
              onChange={(e) =>
                setSettings({ ...settings, linkedInPostsPerWeek: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">First post hour</label>
            <Input
              type="number"
              value={settings.firstPostHour}
              onChange={(e) => setSettings({ ...settings, firstPostHour: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Last post hour</label>
            <Input
              type="number"
              value={settings.lastPostHour}
              onChange={(e) => setSettings({ ...settings, lastPostHour: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Minimum novelty (0–10)</label>
            <Input
              type="number"
              min={0}
              max={10}
              step="0.1"
              value={settings.minimumNovelty}
              onChange={(e) =>
                setSettings({ ...settings, minimumNovelty: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Project cooldown (hours)</label>
            <Input
              type="number"
              min={0}
              max={168}
              value={settings.projectCooldownHours}
              onChange={(e) =>
                setSettings({ ...settings, projectCooldownHours: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Content-type cooldown (hours)</label>
            <Input
              type="number"
              min={0}
              max={168}
              value={settings.contentTypeCooldownHours}
              onChange={(e) =>
                setSettings({ ...settings, contentTypeCooldownHours: Number(e.target.value) })
              }
            />
          </div>
          {!settings.adaptiveCadenceEnabled && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Legacy posts per day</label>
              <Input
                type="number"
                min={1}
                max={12}
                value={settings.postsPerDay}
                onChange={(e) =>
                  setSettings({ ...settings, postsPerDay: Number(e.target.value) })
                }
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => patch({ settings })}
            >
              Save general settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visual brand</CardTitle>
          <CardDescription>Identity and colors used by technical cards and LinkedIn carousels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Display name</label>
              <Input value={brand.displayName} onChange={(event) => setBrand({ ...brand, displayName: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Social handle</label>
              <Input value={brand.handle} onChange={(event) => setBrand({ ...brand, handle: event.target.value })} placeholder="@codeCaptain404" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-400">Tagline</label>
              <Input value={brand.tagline} onChange={(event) => setBrand({ ...brand, tagline: event.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-400">Footer line</label>
              <Input value={brand.footerText} onChange={(event) => setBrand({ ...brand, footerText: event.target.value })} />
            </div>
            {([
              ["accentColor", "Accent"],
              ["backgroundColor", "Background"],
              ["textColor", "Text"],
            ] as const).map(([field, label]) => (
              <label key={field} className="space-y-1 text-xs text-zinc-400">
                <span>{label} color</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={brand[field]}
                    onChange={(event) => setBrand({ ...brand, [field]: event.target.value })}
                    className="h-10 w-12 rounded-lg border border-white/10 bg-black/30 p-1"
                  />
                  <Input value={brand[field]} onChange={(event) => setBrand({ ...brand, [field]: event.target.value })} />
                </div>
              </label>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.07] p-4" style={{ background: brand.backgroundColor }}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: brand.accentColor }}>{brand.tagline}</div>
            <div className="mt-2 text-xl font-semibold" style={{ color: brand.textColor }}>{brand.displayName}</div>
            <div className="mt-1 text-xs text-zinc-400">{brand.handle} · {brand.footerText}</div>
          </div>
          <Button disabled={busy} onClick={() => patch({ brand })}>Save visual brand</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content strategy</CardTitle>
          <CardDescription>
            One audience, three editorial pillars, owned projects, and a product-first 5/2/1/1/1 mix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Target audience</label>
            <Textarea
              rows={2}
              value={strategy.targetAudience}
              onChange={(event) =>
                setStrategy({ ...strategy, targetAudience: event.target.value })
              }
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Creator positioning</label>
            <Textarea
              rows={3}
              value={strategy.positioning}
              onChange={(event) =>
                setStrategy({ ...strategy, positioning: event.target.value })
              }
            />
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-zinc-200">Editorial pillars</div>
              <div className="text-xs text-zinc-500">
                Research and drafts are ranked against these before provider popularity.
              </div>
            </div>
            {strategy.pillars.map((pillar, index) => (
              <div
                key={pillar.id}
                className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3"
              >
                <Input
                  value={pillar.name}
                  onChange={(event) => {
                    const pillars = [...strategy.pillars];
                    pillars[index] = { ...pillar, name: event.target.value };
                    setStrategy({ ...strategy, pillars });
                  }}
                />
                <Textarea
                  rows={2}
                  value={pillar.description}
                  onChange={(event) => {
                    const pillars = [...strategy.pillars];
                    pillars[index] = { ...pillar, description: event.target.value };
                    setStrategy({ ...strategy, pillars });
                  }}
                />
                <Input
                  value={pillar.keywords.join(", ")}
                  onChange={(event) => {
                    const pillars = [...strategy.pillars];
                    pillars[index] = {
                      ...pillar,
                      keywords: event.target.value.split(",").map((item) => item.trim()),
                    };
                    setStrategy({ ...strategy, pillars });
                  }}
                  placeholder="Comma-separated relevance keywords"
                />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-zinc-200">Owned projects</div>
              <div className="text-xs text-zinc-500">
                Trusted project context for differentiated, first-party engineering content.
              </div>
            </div>
            {strategy.projects.map((project, index) => (
              <div
                key={project.id}
                className="space-y-2 rounded-xl border border-teal-400/10 bg-teal-400/[0.025] p-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={project.name}
                    onChange={(event) => {
                      const projects = [...strategy.projects];
                      projects[index] = { ...project, name: event.target.value };
                      setStrategy({ ...strategy, projects });
                    }}
                  />
                  <Input
                    value={project.repository}
                    onChange={(event) => {
                      const projects = [...strategy.projects];
                      projects[index] = { ...project, repository: event.target.value };
                      setStrategy({ ...strategy, projects });
                    }}
                  />
                </div>
                <Textarea
                  rows={3}
                  value={project.description}
                  onChange={(event) => {
                    const projects = [...strategy.projects];
                    projects[index] = { ...project, description: event.target.value };
                    setStrategy({ ...strategy, projects });
                  }}
                />
                <Input
                  value={project.keywords.join(", ")}
                  onChange={(event) => {
                    const projects = [...strategy.projects];
                    projects[index] = {
                      ...project,
                      keywords: event.target.value.split(",").map((item) => item.trim()),
                    };
                    setStrategy({ ...strategy, projects });
                  }}
                  placeholder="Comma-separated project keywords"
                />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-zinc-200">Content mix</div>
              <div className="text-xs text-zinc-500">
                Weights form a repeating editorial rotation; defaults total ten posts.
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {strategy.contentMix.map((item, index) => (
                <div
                  key={item.type}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5"
                >
                  <div>
                    <div className="text-sm text-zinc-200">{item.label}</div>
                    <div className="line-clamp-2 text-xs text-zinc-500">{item.guidance}</div>
                  </div>
                  <Input
                    className="w-20 shrink-0"
                    type="number"
                    min={0}
                    max={10}
                    value={item.weight}
                    onChange={(event) => {
                      const contentMix = [...strategy.contentMix];
                      contentMix[index] = { ...item, weight: Number(event.target.value) };
                      setStrategy({ ...strategy, contentMix });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Excluded or off-brand topics
            </label>
            <Textarea
              rows={5}
              value={strategy.excludedTopics}
              onChange={(event) =>
                setStrategy({ ...strategy, excludedTopics: event.target.value })
              }
              placeholder="One exclusion per line"
            />
          </div>

          <Button disabled={busy} onClick={() => patch({ strategy })}>
            Save content strategy
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Topics</CardTitle>
          <CardDescription>Interest areas used to rank research</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {topics.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5"
            >
              <div>
                <div className="text-sm text-zinc-200">{t.name}</div>
                <div className="text-xs text-zinc-500">{t.keywords}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await patch({ topic: { ...t, delete: true } });
                  setTopics((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="New topic name"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
            />
            <Button
              disabled={!newTopic.trim() || busy}
              onClick={async () => {
                await patch({ topic: { name: newTopic.trim(), keywords: newTopic.trim() } });
                setNewTopic("");
                const res = await fetch("/api/settings");
                const data = await res.json();
                setTopics(data.topics);
              }}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Writing styles</CardTitle>
          <CardDescription>System prompt + rules for the writer agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {styles.map((s) => (
            <StyleEditor key={s.id} style={s} onSave={(style) => patch({ style })} busy={busy} />
          ))}
          {styles.length === 0 && (
            <p className="text-sm text-zinc-500">
              Styles are created automatically on first generation.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI models</CardTitle>
          <CardDescription>
            DeepSeek by default. API key lives in server env (never in the browser).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {models.map((m) => (
            <div key={m.id} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm">
              <div className="text-zinc-200">
                {m.name} {m.isDefault ? "(default)" : ""}
              </div>
              <div className="text-xs text-zinc-500">
                {m.model} · temp {m.temperature}
              </div>
            </div>
          ))}
          {models.length === 0 && (
            <p className="text-sm text-zinc-500">Default model config is created on first run.</p>
          )}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-emerald-400">{message}</p>}
    </div>
  );
}

function StyleEditor({
  style,
  onSave,
  busy,
}: {
  style: Style;
  onSave: (s: Style) => void;
  busy: boolean;
}) {
  const [local, setLocal] = useState(style);

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
      <Input
        value={local.name}
        onChange={(e) => setLocal({ ...local, name: e.target.value })}
      />
      <Textarea
        rows={6}
        value={local.systemPrompt}
        onChange={(e) => setLocal({ ...local, systemPrompt: e.target.value })}
      />
      <Textarea
        rows={3}
        value={local.rules}
        onChange={(e) => setLocal({ ...local, rules: e.target.value })}
        placeholder="Rules (one per line)"
      />
      <Button size="sm" disabled={busy} onClick={() => onSave({ ...local, isDefault: true })}>
        Save style
      </Button>
    </div>
  );
}
