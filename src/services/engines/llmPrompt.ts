import type { GlossaryEntry } from '../../types/models';

export const DEFAULT_TRANSLATION_SYSTEM_PROMPT =
  '你是一个学术论文翻译专家。请将以下英文学术句子翻译成中文，保持专业术语准确，语言简洁流畅。只输出翻译结果，不要解释。';

/** AI 释义：先给译文，再给解释。输出格式固定，便于前端分栏展示 */
export const AI_EXPLAIN_SYSTEM_PROMPT = [
  '你是一个资深的学术论文导师。用户会给你一段英文学术文本（单词、缩写、术语或句子），请按下面格式用中文回答，不要使用 Markdown 标记：',
  '译文：<对原文的准确中文翻译；若原文是单词或缩写，写出全称与对应中文>',
  '解释：<简明解释它在论文中的含义、背景与常见用法，不超过100字；不要复述译文>',
  '只输出这两部分，且必须以“译文：”和“解释：”开头。'
].join('\n');

/** AI 释义的 system prompt，附带命中的术语表，保证与整页翻译用词一致 */
export function buildExplainSystemPrompt(glossary?: GlossaryEntry[]): string {
  return AI_EXPLAIN_SYSTEM_PROMPT + buildGlossaryPrompt(glossary);
}

export interface ParsedExplain {
  translation?: string;
  explanation?: string;
}

/**
 * 解析 AI 释义输出。模型未遵循“译文：/解释：”格式时，整段作为解释返回，不丢内容。
 */
export function parseExplainOutput(raw: string): ParsedExplain {
  const text = raw.trim();
  if (!text) return {};
  const match = text.match(/^\s*译文[:：]\s*([\s\S]*?)\s*(?:\n\s*解释[:：]\s*([\s\S]*))?$/);
  if (!match) return { explanation: text };
  const translation = match[1].trim();
  const explanation = match[2]?.trim();
  if (!translation && !explanation) return { explanation: text };
  return {
    translation: translation || undefined,
    explanation: explanation || undefined
  };
}

/** 把术语表拼成追加在 system prompt 末尾的约束文本 */
export function buildGlossaryPrompt(glossary?: GlossaryEntry[]): string {
  if (!glossary || glossary.length === 0) return '';
  return '\n\n在翻译时，请严格遵守以下学术专有名词/术语对照表：\n' +
    glossary.map(g => `- ${g.source} -> ${g.target}`).join('\n');
}
