import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { deleteR2Object, isR2Configured, uploadBufferToR2 } from "@/lib/storage/r2";

const LOCAL_ROOT = path.join(process.cwd(), "public", "generated");

export async function saveVisualFile(
  storageKey: string,
  body: Buffer,
  contentType: string,
): Promise<{ publicPath: string; storageKey: string }> {
  if (!storageKey.startsWith("visuals/") || storageKey.includes("..")) {
    throw new Error("Invalid visual storage key");
  }
  if (isR2Configured()) {
    return {
      publicPath: await uploadBufferToR2(storageKey, body, contentType),
      storageKey,
    };
  }
  const relative = storageKey.slice("visuals/".length);
  const absolute = path.join(LOCAL_ROOT, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, body);
  return { publicPath: `/generated/${relative}`, storageKey };
}

export async function deleteVisualFile(storageKey: string | null, publicPath: string | null) {
  if (!storageKey) return;
  if (publicPath?.startsWith("/generated/")) {
    const relative = publicPath.slice("/generated/".length);
    try {
      await unlink(path.join(LOCAL_ROOT, relative));
    } catch {
      // Already deleted or local dev file no longer exists.
    }
    return;
  }
  await deleteR2Object(storageKey);
}

