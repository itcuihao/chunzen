import { resolveOpenAiBaseUrl, resolveOpenAiModel, resolveOpenAiTimeout } from './defaults';
import { detectPreset } from './openaiCompat';

export interface OpenAiProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  timeoutMs?: number;
  enabled: boolean;
}

export interface LegacyOpenAiFields {
  apiKey?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  timeoutMs?: unknown;
}

function asTrimmedString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

export function normalizeOpenAiProfile(raw: unknown, index = 0): OpenAiProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const baseUrl = asTrimmedString(obj.baseUrl);
  const apiKey = asTrimmedString(obj.apiKey);
  const model = asTrimmedString(obj.model);
  const systemPrompt = asTrimmedString(obj.systemPrompt);
  const id = asTrimmedString(obj.id) || `profile-${index + 1}`;
  const preset = detectPreset(baseUrl);
  const name = asTrimmedString(obj.name) || preset?.label || `配置 ${index + 1}`;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true;
  const timeoutMs = obj.timeoutMs !== undefined && obj.timeoutMs !== ''
    ? resolveOpenAiTimeout(obj.timeoutMs)
    : undefined;

  return {
    id,
    name,
    baseUrl,
    apiKey,
    model,
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    enabled
  };
}

export function parseOpenAiProfiles(raw: unknown): OpenAiProfile[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }

  const seenIds = new Set<string>();
  const result: OpenAiProfile[] = [];
  for (let i = 0; i < list.length; i++) {
    const profile = normalizeOpenAiProfile(list[i], i);
    if (!profile) continue;
    let uniqueId = profile.id;
    let suffix = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${profile.id}-${suffix++}`;
    }
    seenIds.add(uniqueId);
    result.push({ ...profile, id: uniqueId });
  }
  return result;
}

/**
 * 读取或从旧版单组字段迁移出 OpenAI 配置数组。
 * 若 profiles 已有内容则优先使用 profiles；否则若旧版字段任一非空，则迁移为第 1 条配置。
 */
export function resolveOpenAiProfiles(rawProfiles: unknown, legacy?: LegacyOpenAiFields): OpenAiProfile[] {
  const parsed = parseOpenAiProfiles(rawProfiles);
  if (parsed.length > 0) return parsed;

  if (!legacy) return [];
  const apiKey = asTrimmedString(legacy.apiKey);
  const baseUrl = asTrimmedString(legacy.baseUrl);
  const model = asTrimmedString(legacy.model);
  const systemPrompt = asTrimmedString(legacy.systemPrompt);
  if (!apiKey && !baseUrl && !model) return [];

  const preset = detectPreset(baseUrl);
  return [
    {
      id: 'default',
      name: preset?.label ?? '自定义 / 中转站',
      baseUrl,
      apiKey,
      model,
      ...(systemPrompt ? { systemPrompt } : {}),
      timeoutMs: resolveOpenAiTimeout(legacy.timeoutMs),
      enabled: true
    }
  ];
}

export function isOpenAiProfileConfigured(profile: OpenAiProfile): boolean {
  return (
    profile.enabled &&
    !!profile.apiKey.trim() &&
    !!resolveOpenAiBaseUrl(profile.baseUrl) &&
    !!resolveOpenAiModel(profile.model)
  );
}

/**
 * 按数组顺序返回所有已启用且配置完整的项；
 * 若指定了 preferredId 且该项可用，则将其放到最前面（其余仍作为兜底顺延）。
 */
export function getOrderedConfiguredProfiles(
  profiles: OpenAiProfile[],
  preferredId?: string
): OpenAiProfile[] {
  const configured = profiles.filter(isOpenAiProfileConfigured);
  if (!preferredId) return configured;
  const idx = configured.findIndex((p) => p.id === preferredId);
  if (idx <= 0) return configured;
  return [configured[idx], ...configured.slice(0, idx), ...configured.slice(idx + 1)];
}
