import { MatchType } from "./icon.ts";

export type TabFileCacheEntry = {
  fileId: string | null;
  matchType: MatchType;
  timestamp: number;
};

const tabFileCache = new Map<number, TabFileCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5分

export function setTabCache(
  tabId: number,
  fileId: string | null,
  matchType: MatchType,
) {
  tabFileCache.set(tabId, { fileId, matchType, timestamp: Date.now() });
}

export function getTabCache(
  tabId: number,
): { fileId: string | null; matchType: MatchType } | null {
  const entry = tabFileCache.get(tabId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    tabFileCache.delete(tabId);
    return null;
  }
  return { fileId: entry.fileId, matchType: entry.matchType };
}

export function deleteTabCache(tabId: number) {
  tabFileCache.delete(tabId);
}

export function cleanupTabCache() {
  const now = Date.now();
  for (const [tabId, entry] of tabFileCache) {
    if (now - entry.timestamp > CACHE_TTL) {
      tabFileCache.delete(tabId);
    }
  }
}
