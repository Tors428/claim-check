import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// every model response is saved under a hash of the exact request that
// produced it. the tools are deterministic, so replaying a run from the
// cache sends the same requests and gets the same answers, with no api calls.

export const DEFAULT_CACHE_DIR = "cache";

export type CachedMessage = {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
};

export type CacheEntry = {
  model: string;
  repeat: number;
  response: CachedMessage;
  costUsd: number;
};

export function cacheKey(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export async function readCache(dir: string, key: string): Promise<CacheEntry | null> {
  try {
    return JSON.parse(await readFile(join(dir, `${key}.json`), "utf-8"));
  } catch {
    return null;
  }
}

export async function writeCache(dir: string, key: string, entry: CacheEntry) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.json`), JSON.stringify(entry, null, 2), "utf-8");
}

// total ever spent = sum over the cache, since every paid response is in it
export async function totalSpent(dir: string): Promise<number> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return 0;
  }
  let total = 0;
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    const entry: CacheEntry = JSON.parse(await readFile(join(dir, f), "utf-8"));
    total += entry.costUsd;
  }
  return total;
}
