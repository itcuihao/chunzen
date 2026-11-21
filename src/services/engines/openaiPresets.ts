/**
 * 常见 OpenAI 兼容服务商预设。
 *
 * 只用于设置页“一键填入表单”，绝不作为回退值：用户不点击就不会写入任何设置，
 * 因此不会出现“更新默认值后已保存的 Key 被发往另一家服务商”的问题。
 * 本模块不 import 任何东西，避免与 defaults/openaiCompat 形成循环依赖。
 *
 * 注意“自定义”预设：中转站用户占多数，其地址无法预设，因此 baseUrl/model
 * 留空——点击它只清空表单、不做任何填入，等于退回到手填状态。
 */

export interface OpenAiPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  /** 获取 API Key 的页面；空串表示没有控制台（自填/中转站） */
  keyUrl: string;
  /** 表单下方的说明文案 */
  note: string;
}

export const OPENAI_PRESETS: readonly OpenAiPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note:
      'deepseek-flash 即 V4.1-Flash（版本 DeepSeek-V4.1-Flash-1017）；另有 deepseek-v4-pro。' +
      '旧的 deepseek-chat / deepseek-reasoner 已下线，填了会报模型不存在。'
  },
  {
    id: 'glm',
    label: '智谱 BigModel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: '免费模型如 glm-4-flash、glm-4.5-flash；可用模型以控制台为准，点“拉取模型列表”可看全部 12 个。'
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'zai-org/GLM-5.3-Flash',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note:
      '模型名需带命名空间前缀，如 zai-org/GLM-5.3-Flash、Qwen/Qwen2.5-7B-Instruct。' +
      '注意中转名与智谱直连不同：这里写 zai-org/GLM-5.3-Flash，不是 glm-4-flash。'
  },
  {
    id: 'custom',
    label: '自定义 / 中转站',
    baseUrl: '',
    model: '',
    keyUrl: '',
    note: '中转站或自建服务：Base URL 与模型名按你拿到的说明填写。根地址、带 /v1 的地址、完整 /chat/completions 地址都能识别。'
  }
];

export function findPreset(id: unknown): OpenAiPreset | undefined {
  if (typeof id !== 'string') return undefined;
  return OPENAI_PRESETS.find((p) => p.id === id);
}

/** 该预设是否携带具体地址（自定义/中转站为 false） */
export function isConcretePreset(preset: OpenAiPreset): boolean {
  return preset.baseUrl.length > 0;
}
