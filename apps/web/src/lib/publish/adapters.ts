/**
 * Publishing policy (2026):
 *
 * DevPulse does NOT post to X or LinkedIn via API.
 * - X API access for write is paid/restricted — we only ever use X credentials for research fetch.
 * - LinkedIn posts are always manual.
 *
 * This module only records that *you* finished posting manually.
 */

export interface ManualPostResult {
  ok: true;
  mode: "manual_only";
  message: string;
}

export function assertManualOnly(): ManualPostResult {
  return {
    ok: true,
    mode: "manual_only",
    message:
      "DevPulse never posts to X or LinkedIn. Copy the content (and image if any) and post manually, then mark as posted.",
  };
}
