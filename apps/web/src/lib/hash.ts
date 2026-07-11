import { createHash } from "crypto";

export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}
