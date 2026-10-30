// Text-to-HTML helpers for MinerU markdown (pure string processing; unit-tested in tests/mineruText.test.ts)

import katex from 'katex';
import type { SelectionHighlight } from '../../types/models';
import { preprocessLinks } from './textProcessing';

export function renderMathInText(text: string): string {
  let processed = text;
  
  // Protect display math $$ ... $$
  processed = processed.replace(/\$\$(.+?)\$\$/gs, (match, equation) => {
    try {
      return katex.renderToString(equation.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  // Protect inline math $ ... $
  processed = processed.replace(/\$([^$\n]+?)\$/g, (match, equation) => {
    try {
      return katex.renderToString(equation.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  return processed;
}

export function applyHighlightsToMineruText(
  text: string,
  paragraphId: string,
  highlights: SelectionHighlight[]
): string {
  const paraHighlights = highlights.filter(hl => hl.paragraphId === paragraphId && text.includes(hl.text));
  if (paraHighlights.length === 0) return text;

  const sorted = [...paraHighlights].sort((a, b) => b.text.length - a.text.length);
  let result = text;

  for (const hl of sorted) {
    const escapedText = hl.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedText, 'g');
    
    const colorsMap = {
      yellow: 'bg-amber-100 dark:bg-amber-950/40 border-b-2 border-amber-400/80 text-foreground',
      green: 'bg-emerald-100 dark:bg-emerald-950/40 border-b-2 border-emerald-400/80 text-foreground',
      blue: 'bg-sky-100 dark:bg-sky-950/40 border-b-2 border-sky-400/80 text-foreground',
      purple: 'bg-purple-100 dark:bg-purple-950/40 border-b-2 border-purple-400/80 text-foreground'
    };
    const colorClass = colorsMap[hl.color] || colorsMap.yellow;
    const noteBadge = hl.note ? '<span class="inline-flex items-center ml-0.5 select-none text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-600 rounded px-0.5 font-sans leading-none transform scale-90 origin-left">✍️</span>' : '';

    result = result.replace(regex, `<span class="${colorClass} cursor-pointer hover:opacity-90 transition-all px-0.5 rounded-sm relative inline" data-highlight-id="${hl.id}" title="${hl.note ? `批注: ${hl.note}` : '点击查看/修改高亮'}">${hl.text}${noteBadge}</span>`);
  }
  return result;
}

export function applyJumpLinksToMineruText(
  text: string,
  bibliography: Record<string, { text: string; pageNumber: number }>
): string {
  if (!text) return '';
  const preprocessed = preprocessLinks(text);

  const jumpRegex = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table|图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|((?:图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)/gi;

  return preprocessed.replace(jumpRegex, (match, p1, p2, p3, p4) => {
    if (p1) {
      const keysStr = p1;
      const keys: string[] = [];
      const subParts = keysStr.split(',');
      for (const subPart of subParts) {
        const trimmed = subPart.trim();
        if (trimmed.includes('-') || trimmed.includes('–')) {
          const hyphen = trimmed.includes('-') ? '-' : '–';
          const [startStr, endStr] = trimmed.split(hyphen);
          const start = parseInt(startStr.trim(), 10);
          const end = parseInt(endStr.trim(), 10);
          if (!isNaN(start) && !isNaN(end)) {
            const low = Math.min(start, end);
            const high = Math.max(start, end);
            for (let i = low; i <= high; i++) {
              keys.push(String(i));
            }
          }
        } else {
          const key = parseInt(trimmed, 10);
          if (!isNaN(key)) {
            keys.push(String(key));
          }
        }
      }

      let rendered = '[';
      keys.forEach((key, idx) => {
        const hasRef = bibliography[key];
        if (idx > 0) rendered += ',';
        if (hasRef) {
          rendered += `<span class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-mono font-bold px-0.5" data-jump-citation="${key}" title="跳转到文献 [${key}]">${key}</span>`;
        } else {
          rendered += `<span class="text-zinc-600 dark:text-zinc-400 font-mono px-0.5">${key}</span>`;
        }
      });
      rendered += ']';
      return rendered;
    } else {
      const query = (p2 || p3 || p4).trim();
      return `<span class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-bold px-0.5" data-jump-caption="${query}" title="跳转到 ${query}">${match}</span>`;
    }
  });
}
