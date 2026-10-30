/** OpenAI 兼容接口默认值 — 须与 package.json 中 chunzen.translation.openai.* 的 default 保持一致 */
export const OPENAI_DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const OPENAI_DEFAULT_MODEL = 'deepseek-flash';

/** 0.1.0 及之前的默认值。迁移时用来固定老用户的行为，见 legacyOpenAiPins */
export const LEGACY_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const LEGACY_OPENAI_MODEL = 'gpt-4o-mini';

export interface OpenAiSettingsState {
  apiKey: string;
  /** 用户是否在任一作用域显式设置过该项（而不是依赖默认值） */
  baseUrlExplicit: boolean;
  modelExplicit: boolean;
}

/**
 * 默认值从 OpenAI 改为 DeepSeek 后，只填了 Key、没填地址/模型的老用户会在不知情时
 * 把 OpenAI 密钥发往 DeepSeek。对这类用户，把旧默认值显式写回设置，行为保持不变。
 * 没有配置 Key 的用户（包括新用户）不受影响，直接使用新默认值。
 */
export function legacyOpenAiPins(state: OpenAiSettingsState): { baseUrl?: string; model?: string } {
  if (!state.apiKey.trim()) return {};
  const pins: { baseUrl?: string; model?: string } = {};
  if (!state.baseUrlExplicit) pins.baseUrl = LEGACY_OPENAI_BASE_URL;
  if (!state.modelExplicit) pins.model = LEGACY_OPENAI_MODEL;
  return pins;
}
