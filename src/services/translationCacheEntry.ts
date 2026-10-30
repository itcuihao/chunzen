const SEPARATOR = '\x00';

export interface CacheEntry {
  engine: string;
  text: string;
}

/** 缓存值格式：`引擎名\0译文`（与磁盘上已有缓存保持兼容） */
export function encodeCacheEntry(engine: string, text: string): string {
  return `${engine}${SEPARATOR}${text}`;
}

export function decodeCacheEntry(raw: string): CacheEntry | undefined {
  const idx = raw.indexOf(SEPARATOR);
  if (idx === -1) return undefined;
  return { engine: raw.slice(0, idx), text: raw.slice(idx + 1) };
}
