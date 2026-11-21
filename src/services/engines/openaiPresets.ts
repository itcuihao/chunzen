/**
 * 常见 OpenAI 兼容服务商预设。
 *
 * 只用于设置页“一键填入表单”，绝不作为回退值：用户不点击就不会写入任何设置，
 * 因此不会出现“更新默认值后已保存的 Key 被发往另一家服务商”的问题。
 * 本模块不 import 任何东西，避免与 defaults/openaiCompat 形成循环依赖。
 */

export interface OpenAiPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  /** 获取 API Key 的页面 */
  keyUrl: string;
  /** 表单下方的说明文案 */
  note: string;
}

export const OPENAI_PRESETS: readonly OpenAiPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '对话模型：deepseek-chat；推理模型：deepseek-reasoner（不支持 temperature，已按兼容方式发送）。'
  },
  {
    id: 'glm',
    label: '智谱 BigModel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: '免费模型如 glm-4-flash、glm-4.5-flash；可用模型以控制台为准。'
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '模型名需带命名空间前缀，例如 Qwen/Qwen2.5-7B-Instruct、deepseek-ai/DeepSeek-V3。'
  },
  {
    id: 'moonshot',
    label: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    note: '模型名如 moonshot-v1-8k / moonshot-v1-32k，或 kimi 系列新模型。'
  },
  {
    id: 'openai',
    label: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Base URL 必须带 /v1；也兼容任何遵循 chat/completions 格式的中转服务。'
  }
];

export function findPreset(id: unknown): OpenAiPreset | undefined {
  if (typeof id !== 'string') return undefined;
  return OPENAI_PRESETS.find((p) => p.id === id);
}
