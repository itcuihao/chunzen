/** 配置取值约束 — 读取和保存共用，须与 package.json 中 minimum/maximum/enum 保持一致 */

export const CACHE_MAX_SIZE = { min: 50, max: 5000, fallback: 500 } as const;
export const LAYOUT_TIMEOUT_MS = { min: 500, max: 20000, fallback: 3500 } as const;
export const DEFAULT_LAYOUT_ENDPOINT = 'http://127.0.0.1:8765/layout';

export function clampNumber(
  value: unknown,
  range: { min: number; max: number; fallback: number }
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return range.fallback;
  return Math.max(range.min, Math.min(range.max, Math.round(value)));
}

/** 取值在允许列表内则原样返回，否则回落到默认值 */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
