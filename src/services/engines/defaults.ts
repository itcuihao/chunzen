/**
 * OpenAI 兼容接口的连接设置没有默认值。
 *
 * 安全约束：API Key 只会发往用户亲手填写的地址，因此 Base URL 和模型名都必须由用户填写，
 * 任何一项为空即视为“未配置”，引擎不会发出任何请求。不要给它们加默认值或回退值：
 * 否则更新默认值时，已保存 Key 的用户会在不知情时把 Key 发往另一家服务商。
 */

/** 设置页“填入示例”按钮使用的 DeepSeek 示例：只在用户点击后写入表单，绝不作为回退值 */
export const DEEPSEEK_EXAMPLE_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_EXAMPLE_MODEL = 'deepseek-flash';

/**
 * 规范化并校验用户填写的 Base URL。
 * 返回 undefined 表示不可用（为空或不是 http/https 地址），调用方必须据此拒绝发送请求。
 * 末尾斜杠会被去掉，便于拼接 /chat/completions。
 */
export function resolveOpenAiBaseUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  return trimmed.replace(/\/+$/, '');
}

/** 模型名必须由用户填写；为空返回 undefined，调用方必须据此拒绝发送请求 */
export function resolveOpenAiModel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}
