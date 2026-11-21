/**
 * OpenAI 兼容接口的纯逻辑层：地址候选、错误解析、响应内容提取、服务商预设。
 *
 * 该模块不 import vscode，便于 node --test 直接单测；引擎与设置页共用同一份实现。
 */
import { resolveOpenAiBaseUrl } from './defaults';
import { OPENAI_PRESETS } from './openaiPresets';

export { OPENAI_PRESETS, findPreset, isConcretePreset, type OpenAiPreset } from './openaiPresets';

/**
 * 根据 Base URL 反查预设（用于表单回显）。
 * 自定义/中转站预设的 baseUrl 是空串：它表示“不预设”，不能参与匹配，
 * 否则任何空地址都会命中它。
 */
export function detectPreset(baseUrl: unknown): (typeof OPENAI_PRESETS)[number] | undefined {
  const normalized = resolveOpenAiBaseUrl(baseUrl);
  if (!normalized) return undefined;
  return OPENAI_PRESETS.find((p) => p.baseUrl !== '' && p.baseUrl === normalized);
}

// ── 地址候选 ──

/**
 * 生成 chat/completions 的候选地址，按顺序尝试：
 * 1. 用户直接粘贴了完整地址（以 /chat/completions 结尾）→ 原样使用
 * 2. Base URL + /chat/completions
 * 3. 路径里没有版本号（如 https://api.openai.com）时，再试 + /v1/chat/completions
 *
 * 这样“根地址”“带 /v1 的根地址”“完整 endpoint”三种填法都能用，不需要用户猜。
 */
export function chatCompletionsCandidates(raw: unknown): string[] {
  const base = resolveOpenAiBaseUrl(raw);
  if (!base) return [];
  if (/\/chat\/completions$/i.test(base)) return [base];

  const candidates: string[] = [base + '/chat/completions'];
  try {
    const pathname = new URL(base).pathname;
    if (!/\/v\d+(?:\.\d+)?(?:\/|$)/i.test(pathname)) {
      candidates.push(base + '/v1/chat/completions');
    }
  } catch {
    // resolveOpenAiBaseUrl 已保证可解析，这里只是保险
  }
  return candidates;
}

/** 模型列表接口的候选地址（多数兼容服务都在 /v1/models 或 /models） */
export function modelListCandidates(raw: unknown): string[] {
  const base = resolveOpenAiBaseUrl(raw);
  if (!base) return [];
  const root = base.replace(/\/chat\/completions$/i, '');
  const candidates = [root + '/models'];
  try {
    const pathname = new URL(root).pathname;
    if (!/\/v\d+(?:\.\d+)?(?:\/|$)/i.test(pathname)) {
      candidates.push(root + '/v1/models');
    }
  } catch {
    // ignore
  }
  return candidates;
}

// ── 响应解析 ──

export function parseJson(text: unknown): unknown {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 从各种兼容实现里捞出错误说明（error.message / message / msg / detail / error 字符串） */
export function extractApiError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, any>;
  const candidates = [
    obj.error?.message,
    typeof obj.error === 'string' ? obj.error : undefined,
    obj.message,
    obj.msg,
    obj.detail,
    obj.error_msg
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function partToText(part: unknown): string {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';
  const p = part as Record<string, any>;
  if (typeof p.text === 'string') return p.text;
  if (typeof p.content === 'string') return p.content;
  return '';
}

/** 提取助手回复文本：兼容 content 为字符串/数组、choices[].text、output_text 等形态 */
export function extractAssistantContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, any>;
  const choice = obj.choices?.[0];
  const raw = choice?.message?.content ?? choice?.text ?? obj.output_text ?? obj.result;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const joined = raw.map(partToText).join('');
    if (joined.trim()) return joined;
  }
  if (raw && typeof raw === 'object') {
    const nested = partToText(raw);
    if (nested.trim()) return nested;
  }
  return undefined;
}

/** 提取模型 id 列表（OpenAI 的 data[].id、部分中转的 models[].name/id） */
export function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, any>;
  const list = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.models)
      ? obj.models
      : Array.isArray(obj.result)
        ? obj.result
        : [];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      ids.push(item);
      continue;
    }
    const id = item?.id ?? item?.name ?? item?.model;
    if (typeof id === 'string' && id.trim()) ids.push(id.trim());
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

// ── 失败提示 ──

/** 把状态码翻译成用户能照做的下一步 */
export function httpFailureHint(status: number): string {
  if (status === 401 || status === 403) {
    return 'API Key 无效、过期或没有该模型权限。请重新复制 Key（不要带空格或换行），并确认账户已开通该模型。';
  }
  if (status === 404) {
    return '请求路径不对：多数兼容接口的 Base URL 需要以 /v1 结尾（如 https://api.openai.com/v1），也可以直接粘贴完整的 /chat/completions 地址。';
  }
  if (status === 400 || status === 422) {
    return '请求参数被拒绝：最常见原因是模型名称不存在或该模型不支持当前参数。点“拉取模型列表”核对名称。';
  }
  if (status === 402) {
    return '账户余额不足或未开通付费，请到服务商控制台充值。';
  }
  if (status === 429) {
    return '触发限流或额度用尽，稍后重试，或检查账户配额。';
  }
  if (status >= 500) {
    return '服务端异常，稍后重试；若持续失败请检查 Base URL 是否为可用的接口地址。';
  }
  return '';
}

/** 截断长文本用于 UI 展示 */
export function previewText(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}

/** 单次兼容接口调用的失败信息：带上实际请求地址、状态码与处置建议 */
export class OpenAiRequestError extends Error {
  readonly requestUrl?: string;
  readonly status?: number;
  readonly hint?: string;

  constructor(message: string, requestUrl?: string, status?: number, hint?: string) {
    super(message);
    this.name = 'OpenAiRequestError';
    this.requestUrl = requestUrl;
    this.status = status;
    this.hint = hint;
  }
}
