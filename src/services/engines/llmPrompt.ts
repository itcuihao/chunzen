import type { GlossaryEntry } from '../../types/models';

export const DEFAULT_TRANSLATION_SYSTEM_PROMPT =
  '你是一个学术论文翻译专家。请将以下英文学术句子翻译成中文，保持专业术语准确，语言简洁流畅。只输出翻译结果，不要解释。';

/** 把术语表拼成追加在 system prompt 末尾的约束文本 */
export function buildGlossaryPrompt(glossary?: GlossaryEntry[]): string {
  if (!glossary || glossary.length === 0) return '';
  return '\n\n在翻译时，请严格遵守以下学术专有名词/术语对照表：\n' +
    glossary.map(g => `- ${g.source} -> ${g.target}`).join('\n');
}
