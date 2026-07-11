#!/usr/bin/env node
/**
 * Local always-on cron loop for free-tier DevPulse.
 * Hits /api/cron/slot every INTERVAL_MS so:
 *  - due slots generate posts into Supabase
 *  - free DB stays active (traffic)
 *  - 30-day / 1-day retention runs
 *
 * Usage (from apps/web):
 *   npm run cron:loop
 *
 * Env:
 *   CRON_BASE_URL  default http://localhost:3000
 *   CRON_SECRET    from .env
 *   CRON_INTERVAL_MS  default 900000 (15 min)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const base = (process.env.CRON_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";
const interval = Number(process.env.CRON_INTERVAL_MS || 15 * 60 * 1000);

async function tick() {
  const url = `${base}/api/cron/slot`;
  const headers = { Accept: "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const started = new Date().toISOString();
  try {
    const res = await fetch(url, { headers, method: "GET" });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    console.log(
      `[${started}] cron ${res.status}`,
      body.ok
        ? `created=${body.created ?? "?"} cleanupPosts=${body.cleanup?.postsDeleted ?? 0} screenshots=${body.cleanup?.screenshotsDeleted ?? 0}`
        : JSON.stringify(body).slice(0, 300),
    );
  } catch (err) {
    console.error(`[${started}] cron error:`, err instanceof Error ? err.message : err);
  }
}

const once = process.argv.includes("--once");

console.log(`DevPulse cron → ${base}/api/cron/slot` + (once ? " (once)" : ` every ${interval / 1000}s`));
if (!once) console.log("Keep `npm run dev` running in another terminal.");

await tick();
if (!once) {
  setInterval(tick, interval);
}
