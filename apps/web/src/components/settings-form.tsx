"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Settings = {
  timezone: string;
  qualityThreshold: number;
  postsPerDay: number;
  firstPostHour: number;
  lastPostHour: number;
  defaultPlatforms: string;
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

export function SettingsForm({
  settings: initialSettings,
  topics: initialTopics,
  styles: initialStyles,
  models: initialModels,
}: {
  settings: Settings;
  topics: Topic[];
  styles: Style[];
  models: Model[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [topics, setTopics] = useState(initialTopics);
  const [styles] = useState(initialStyles);
  const [models] = useState(initialModels);
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
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Posts per day</label>
            <Input
              type="number"
              value={settings.postsPerDay}
              onChange={(e) => setSettings({ ...settings, postsPerDay: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Default platforms</label>
            <Input
              value={settings.defaultPlatforms}
              onChange={(e) => setSettings({ ...settings, defaultPlatforms: e.target.value })}
              placeholder="x,linkedin"
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
