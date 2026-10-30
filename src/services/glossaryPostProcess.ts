import type { GlossaryEntry } from '../types/models';

const ENGLISH_TERM = /^[a-zA-Z\s\-_]+$/;

function escapeRegExp(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * 对非大模型翻译结果进行术语后处理纠偏替换。
 * source 支持 `a|b` 多写法；英文按单词边界忽略大小写匹配。
 */
export function applyGlossary(translatedText: string, glossary: GlossaryEntry[]): string {
  let result = translatedText;
  for (const term of glossary) {
    for (const raw of term.source.split('|')) {
      const s = raw.trim();
      if (!s) continue;
      const escaped = escapeRegExp(s);
      const reg = ENGLISH_TERM.test(s)
        ? new RegExp(`\\b${escaped}\\b`, 'gi')
        : new RegExp(escaped, 'g');
      // 使用函数替换，避免 target 中的 `$&` / `$1` 被当作替换模式
      result = result.replace(reg, () => term.target);
    }
  }
  return result;
}
