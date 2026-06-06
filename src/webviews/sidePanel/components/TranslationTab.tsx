import { FunctionComponent, useState, useEffect, useMemo, ReactNode, useRef } from 'react';
import { useStore } from '../store';
import { 
  Languages, FileCheck, RefreshCw, Compass, Plus, ArrowUpRight, Copy,
  Highlighter, MessageSquareText, Sparkles, BookOpen, Trash2, X,
  Maximize2, Minimize2
} from 'lucide-react';
import { postMessage } from '../vscode';
import { SelectionHighlight } from '../../../types/models';
// @ts-ignore
import { marked } from 'marked';
import katex from 'katex';

function renderMathInText(text: string): string {
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

function protectMathAndCitations(text: string): {
  protectedText: string;
  maths: string[];
  citations: string[];
} {
  const maths: string[] = [];
  const citations: string[] = [];
  
  let protectedText = text.replace(/\$\$(.+?)\$\$/gs, (match) => {
    maths.push(match);
    return `[[CZDISPLAYMATH_${maths.length - 1}]]`;
  });

  protectedText = protectedText.replace(/\$([^$\n]+?)\$/g, (match) => {
    maths.push(match);
    return `[[CZINLINEMATH_${maths.length - 1}]]`;
  });

  protectedText = protectedText.replace(/\[\d+(?:\s*[-–,]\s*\d+)*\]/g, (match) => {
    citations.push(match);
    return `[[CZCITATION_${citations.length - 1}]]`;
  });

  return { protectedText, maths, citations };
}

function restoreMathAndCitations(
  translatedText: string,
  maths: string[],
  citations: string[]
): string {
  let restored = translatedText;

  restored = restored.replace(/\[\[CZDISPLAYMATH_(\d+)\]\]/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return maths[idx] !== undefined ? maths[idx] : match;
  });

  restored = restored.replace(/\[\[CZINLINEMATH_(\d+)\]\]/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return maths[idx] !== undefined ? maths[idx] : match;
  });

  restored = restored.replace(/\[\[CZCITATION_(\d+)\]\]/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return citations[idx] !== undefined ? citations[idx] : match;
  });

  return restored;
}

function restoreMathAndCitationsFallback(
  translatedText: string,
  originalText: string
): string {
  const { maths, citations } = protectMathAndCitations(originalText);
  return restoreMathAndCitations(translatedText, maths, citations);
}

function applyHighlightsToMineruText(
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

function applyJumpLinksToMineruText(
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

function mapHtmlToPlain(html: string): { plainText: string; mapIdx: number[] } {
  let plain = '';
  const mapIdx: number[] = [];
  
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const closeIdx = html.indexOf('>', i);
      if (closeIdx !== -1) {
        i = closeIdx + 1;
        continue;
      }
    }
    mapIdx.push(i);
    plain += html[i];
    i++;
  }
  mapIdx.push(i);
  return { plainText: plain, mapIdx };
}

function renderFormattedContent(text: string): ReactNode {
  if (!text) return '';
  const htmlTagSplitRegex = /(<(?:i|sup|sub)>[\s\S]*?<\/(?:i|sup|sub)>)/gi;
  if (!htmlTagSplitRegex.test(text)) {
    return text;
  }
  const parts = text.split(htmlTagSplitRegex);
  return parts.map((part, idx) => {
    const match = part.match(/^<(i|sup|sub)>([\s\S]*?)<\/\1>$/i);
    if (match) {
      const Tag = match[1].toLowerCase() as 'i' | 'sup' | 'sub';
      const innerContent = match[2];
      return (
        <Tag key={`formatted-${idx}`}>
          {renderFormattedContent(innerContent)}
        </Tag>
      );
    } else {
      return part;
    }
  });
}

function mergeSplitDoi(text: string): string {
  const splitDoiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]*)\s+([-._;()/:A-Z0-9]+)/gi;
  let prevText = text;
  while (true) {
    const nextText = prevText.replace(splitDoiRegex, (match, g1, g2) => {
      const endsWithConnector = /[\/.\-_]$/.test(g1);
      const startsWithConnector = /^[\/.\-_]/.test(g2);
      if (endsWithConnector || startsWithConnector) {
        return g1 + g2;
      }
      return match;
    });
    if (nextText === prevText) break;
    prevText = nextText;
  }
  return prevText;
}

function mergeSplitUrl(text: string): string {
  const splitUrlRegex = /\b(https?:\/\/[^\s()<>]+)\s+([^\s()<>]+)/gi;
  let prevText = text;
  while (true) {
    const nextText = prevText.replace(splitUrlRegex, (match, g1, g2) => {
      const endsWithConnector = /[\/.\-_=?&]$/.test(g1);
      const startsWithConnector = /^[\/.\-_=?&]/.test(g2);
      if (endsWithConnector || startsWithConnector) {
        return g1 + g2;
      }
      return match;
    });
    if (nextText === prevText) break;
    prevText = nextText;
  }
  return prevText;
}

function preprocessLinks(text: string): string {
  if (!text) return '';
  return mergeSplitUrl(mergeSplitDoi(text));
}

function renderTextSegmentWithJumps(
  text: string,
  bibliography: Record<string, { text: string; pageNumber: number }>
): ReactNode {
  if (!text) return '';

  const preprocessed = preprocessLinks(text);
  const { plainText, mapIdx } = mapHtmlToPlain(preprocessed);

  const jumpRegex = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table|图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|((?:图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)|\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F\-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?(?:,\s*|，\s*)\d{4}[a-z]?(?:\s*[;；]\s*)?)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;
  const parts: ReactNode[] = [];
  let lastPlainIndex = 0;
  let match;

  while ((match = jumpRegex.exec(plainText)) !== null) {
    const matchIndex = match.index;
    const matchEndIndex = jumpRegex.lastIndex;

    const taggedStart = mapIdx[matchIndex];
    const taggedEnd = mapIdx[matchEndIndex];
    const taggedPrevEnd = mapIdx[lastPlainIndex];

    if (taggedStart > taggedPrevEnd) {
      parts.push(renderFormattedContent(preprocessed.substring(taggedPrevEnd, taggedStart)));
    }

    const taggedMatchText = preprocessed.substring(taggedStart, taggedEnd);

    if (match[1]) {
      const citationKeysStr = match[1];
      const keys: string[] = [];
      const subParts = citationKeysStr.split(',');
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

      parts.push(
        <span key={`citation-${matchIndex}`} className="select-none text-zinc-500 dark:text-zinc-400 font-sans">
          [
          {keys.map((key, idx) => {
            const hasRef = bibliography[key];
            const className = hasRef 
              ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-mono font-bold px-0.5"
              : "text-zinc-600 dark:text-zinc-400 font-mono px-0.5";
            return (
              <span key={idx}>
                {idx > 0 && ','}
                <span 
                  className={className}
                  onClick={(e) => {
                    if (hasRef) {
                      e.stopPropagation();
                      window.getSelection()?.removeAllRanges();
                      postMessage({
                        type: 'jump-to-page',
                        pageNumber: bibliography[key].pageNumber
                      });
                    }
                  }}
                  title={hasRef ? `跳转到文献 [${key}]` : undefined}
                >
                  {key}
                </span>
              </span>
            );
          })}
          ]
        </span>
      );
    } else if (match[2] || match[3] || match[4]) {
      const figQuery = (match[2] || match[3] || match[4]).trim();
      parts.push(
        <span 
          key={`fig-${matchIndex}`}
          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-bold px-0.5"
          onClick={(e) => {
            e.stopPropagation();
            window.getSelection()?.removeAllRanges();
            postMessage({
              type: 'find-and-jump-to-caption',
              query: figQuery
            });
          }}
          title={`跳转到 ${figQuery}`}
        >
          {renderFormattedContent(taggedMatchText)}
        </span>
      );
    } else if (match[5]) {
      const author = match[5].toLowerCase();
      const year = (match[6] + (match[7] || '')).toLowerCase();
      const key = `${author}-${year}`;
      const hasRef = bibliography[key];
      
      parts.push(
        <span 
          key={`narrative-${matchIndex}`}
          className={hasRef 
            ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5" 
            : "text-zinc-600 dark:text-zinc-400 px-0.5"}
          onClick={(e) => {
            if (hasRef) {
              e.stopPropagation();
              window.getSelection()?.removeAllRanges();
              postMessage({
                type: 'jump-to-page',
                pageNumber: bibliography[key].pageNumber
              });
            }
          }}
          title={hasRef ? `跳转到文献 [${key}]` : undefined}
        >
          {renderFormattedContent(taggedMatchText)}
        </span>
      );
    } else if (match[8]) {
      const innerText = match[9];
      const innerStartPlain = matchIndex + match[0].indexOf(innerText);
      const items = innerText.split(/[;；]/);
      const renderedItems: ReactNode[] = [];
      let currentPlainOffset = innerStartPlain;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemStartPlain = currentPlainOffset;
        const itemEndPlain = itemStartPlain + item.length;
        currentPlainOffset = itemEndPlain + 1;

        const itemMatch = item.match(/\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?(?:,\s*|，\s*)(\d{4})([a-z])?/i);
        
        if (i > 0) {
          renderedItems.push('; ');
        }

        const itemTaggedStart = mapIdx[itemStartPlain];
        const itemTaggedEnd = mapIdx[itemEndPlain];
        const itemTaggedText = preprocessed.substring(itemTaggedStart, itemTaggedEnd);
        
        if (itemMatch) {
          const author = itemMatch[1].toLowerCase();
          const year = (itemMatch[2] + (itemMatch[3] || '')).toLowerCase();
          const key = `${author}-${year}`;
          const hasRef = bibliography[key];
          
          renderedItems.push(
            <span 
              key={`parenthetical-item-${i}`}
              className={hasRef 
                ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5" 
                : "text-zinc-600 dark:text-zinc-400 px-0.5"}
              onClick={(e) => {
                if (hasRef) {
                  e.stopPropagation();
                  window.getSelection()?.removeAllRanges();
                  postMessage({
                    type: 'jump-to-page',
                    pageNumber: bibliography[key].pageNumber
                  });
                }
              }}
              title={hasRef ? `跳转到文献 [${key}]` : undefined}
            >
              {renderFormattedContent(itemTaggedText.trim())}
            </span>
          );
        } else {
          renderedItems.push(renderFormattedContent(itemTaggedText));
        }
      }
      
      parts.push(
        <span key={`parenthetical-block-${matchIndex}`}>
          ({renderedItems})
        </span>
      );
    } else if (match[10]) {
      const url = match[10];
      parts.push(
        <a
          key={`url-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans"
          onClick={(e) => {
            e.stopPropagation();
            window.getSelection()?.removeAllRanges();
          }}
          title={url}
        >
          {renderFormattedContent(taggedMatchText)}
        </a>
      );
    } else if (match[11]) {
      const doi = match[11];
      parts.push(
        <a
          key={`doi-${matchIndex}`}
          href={`https://doi.org/${doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-medium"
          onClick={(e) => {
            e.stopPropagation();
            window.getSelection()?.removeAllRanges();
          }}
          title={`https://doi.org/${doi}`}
        >
          {renderFormattedContent(taggedMatchText)}
        </a>
      );
    }

    lastPlainIndex = jumpRegex.lastIndex;
  }

  const taggedPrevEnd = mapIdx[lastPlainIndex];
  if (taggedPrevEnd < preprocessed.length) {
    parts.push(renderFormattedContent(preprocessed.substring(taggedPrevEnd)));
  }

  return parts.length > 0 ? parts : preprocessed;
}

function renderTextWithHighlightsAndCitations(
  text: string,
  paragraphId: string,
  bibliography: Record<string, { text: string; pageNumber: number }>,
  highlights: SelectionHighlight[],
  onHighlightClick: (hl: SelectionHighlight, rect: DOMRect) => void
): ReactNode {
  if (!text) return '';

  const plainText = text.replace(/<[^>]+>/g, '');
  const paraHighlights = highlights.filter(hl => hl.paragraphId === paragraphId && plainText.includes(hl.text));
  if (paraHighlights.length === 0) {
    return renderTextSegmentWithJumps(text, bibliography);
  }

  const sortedHls = [...paraHighlights].sort((a, b) => b.text.length - a.text.length);
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const buildTagInsensitiveRegexStr = (hlText: string) => {
    const escaped = escapeRegExp(hlText);
    const words = escaped.split(/\s+/);
    const wordPatterns = words.map(w => {
      return w.split('').map(char => escapeRegExp(char)).join('(?:<[^>]+>)*');
    });
    return wordPatterns.join('\\s*(?:<[^>]+>)*\\s*');
  };

  const pattern = new RegExp('(' + sortedHls.map(h => buildTagInsensitiveRegexStr(h.text)).join('|') + ')', 'gi');

  const parts = text.split(pattern);
  const resultNodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const matchedHl = sortedHls.find(h => {
      const regex = new RegExp('^' + buildTagInsensitiveRegexStr(h.text) + '$', 'i');
      return regex.test(part);
    });

    if (matchedHl) {
      const colorsMap = {
        yellow: 'bg-amber-100 dark:bg-amber-950/40 border-b-2 border-amber-400/80 text-foreground',
        green: 'bg-emerald-100 dark:bg-emerald-950/40 border-b-2 border-emerald-400/80 text-foreground',
        blue: 'bg-sky-100 dark:bg-sky-950/40 border-b-2 border-sky-400/80 text-foreground',
        purple: 'bg-purple-100 dark:bg-purple-950/40 border-b-2 border-purple-400/80 text-foreground'
      };
      const colorClass = colorsMap[matchedHl.color] || colorsMap.yellow;

      resultNodes.push(
        <span
          key={`hl-${matchedHl.id}-${i}`}
          className={`${colorClass} cursor-pointer hover:opacity-90 transition-all px-0.5 rounded-sm relative inline group/hl`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onHighlightClick(matchedHl, rect);
          }}
          title={matchedHl.note ? `批注: ${matchedHl.note}` : '点击查看/修改高亮'}
        >
          {renderFormattedContent(part)}
          {matchedHl.note && (
            <span className="inline-flex items-center ml-0.5 select-none text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-600 rounded px-0.5 font-sans leading-none transform scale-90 origin-left">
              ✍️
            </span>
          )}
        </span>
      );
    } else {
      const jumpedNodes = renderTextSegmentWithJumps(part, bibliography);
      if (Array.isArray(jumpedNodes)) {
        resultNodes.push(...jumpedNodes);
      } else {
        resultNodes.push(jumpedNodes);
      }
    }
  }

  return resultNodes.length > 0 ? resultNodes : text;
}

function protectTextWithPlaceholders(text: string): string {
  if (!text) return '';

  const preprocessed = preprocessLinks(text);
  const { plainText, mapIdx } = mapHtmlToPlain(preprocessed);

  const unionRegexWithoutHtml = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F\-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?,\s*\d{4}[a-z]?(?:\s*;|，|;|,)?\s*)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;

  const citations: Array<{
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI';
    taggedStart: number;
    taggedEnd: number;
  }> = [];

  let match;
  unionRegexWithoutHtml.lastIndex = 0;
  while ((match = unionRegexWithoutHtml.exec(plainText)) !== null) {
    const plainStart = match.index;
    const plainEnd = unionRegexWithoutHtml.lastIndex;
    const taggedStart = mapIdx[plainStart];
    const taggedEnd = mapIdx[plainEnd];
    
    let type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI';
    if (match[1]) type = 'CZNUM';
    else if (match[2] || match[3]) type = 'CZFIG';
    else if (match[4]) type = 'CZNAR';
    else if (match[7]) type = 'CZPAR';
    else if (match[9]) type = 'CZURL';
    else if (match[10]) type = 'CZDOI';
    else continue;

    citations.push({ type, taggedStart, taggedEnd });
  }

  const htmlTags: Array<{ taggedStart: number; taggedEnd: number; tag: string }> = [];
  const htmlTagRegex = /<(i|sup|sub)>([\s\S]*?)<\/\1>/gi;
  let htmlMatch;
  while ((htmlMatch = htmlTagRegex.exec(preprocessed)) !== null) {
    const taggedStart = htmlMatch.index;
    const taggedEnd = htmlTagRegex.lastIndex;
    
    const isInsideCitation = citations.some(c => taggedStart >= c.taggedStart && taggedEnd <= c.taggedEnd);
    if (!isInsideCitation) {
      htmlTags.push({
        taggedStart,
        taggedEnd,
        tag: htmlMatch[1]
      });
    }
  }

  const allMatches: Array<{
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZHTML' | 'CZURL' | 'CZDOI';
    taggedStart: number;
    taggedEnd: number;
  }> = [];

  for (const c of citations) {
    allMatches.push({ type: c.type, taggedStart: c.taggedStart, taggedEnd: c.taggedEnd });
  }
  for (const h of htmlTags) {
    allMatches.push({ type: 'CZHTML', taggedStart: h.taggedStart, taggedEnd: h.taggedEnd });
  }

  allMatches.sort((a, b) => a.taggedStart - b.taggedStart);

  let result = '';
  let lastIdx = 0;
  
  let refIndex = 0;
  let figIndex = 0;
  let narIndex = 0;
  let parIndex = 0;
  let htmlIndex = 0;
  let urlIndex = 0;
  let doiIndex = 0;

  for (const m of allMatches) {
    result += preprocessed.substring(lastIdx, m.taggedStart);
    if (m.type === 'CZNUM') {
      result += `[[CZNUM_${refIndex++}]]`;
    } else if (m.type === 'CZFIG') {
      result += `[[CZFIG_${figIndex++}]]`;
    } else if (m.type === 'CZNAR') {
      result += `[[CZNAR_${narIndex++}]]`;
    } else if (m.type === 'CZPAR') {
      result += `[[CZPAR_${parIndex++}]]`;
    } else if (m.type === 'CZHTML') {
      result += `[[CZHTML_${htmlIndex++}]]`;
    } else if (m.type === 'CZURL') {
      result += `[[CZURL_${urlIndex++}]]`;
    } else if (m.type === 'CZDOI') {
      result += `[[CZDOI_${doiIndex++}]]`;
    }
    lastIdx = m.taggedEnd;
  }
  result += preprocessed.substring(lastIdx);
  return result;
}

function renderTextWithPlaceholders(
  translated: string,
  para: AnnotatedPara,
  bibliography: Record<string, { text: string; pageNumber: number }>,
  highlights: SelectionHighlight[],
  onHighlightClick: (hl: SelectionHighlight, rect: DOMRect) => void
): ReactNode {
  const nums: Array<{ match: string; key: string }> = [];
  const figs: Array<{ match: string; query: string }> = [];
  const nars: Array<{ match: string; author: string; year: string }> = [];
  const pars: Array<{ match: string; items: Array<{ text: string; taggedText: string }> }> = [];
  const htmls: Array<{ match: string; tag: string; content: string }> = [];
  const urls: Array<{ match: string; url: string }> = [];
  const dois: Array<{ match: string; doi: string }> = [];

  const preprocessedParaText = preprocessLinks(para.text);
  const { plainText, mapIdx } = mapHtmlToPlain(preprocessedParaText);

  const unionRegexWithoutHtml = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F\-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?,\s*\d{4}[a-z]?(?:\s*;|，|;|,)?\s*)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;

  const citations: Array<{
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI';
    taggedStart: number;
    taggedEnd: number;
    match: any;
  }> = [];

  let match;
  unionRegexWithoutHtml.lastIndex = 0;
  while ((match = unionRegexWithoutHtml.exec(plainText)) !== null) {
    const plainStart = match.index;
    const plainEnd = unionRegexWithoutHtml.lastIndex;
    const taggedStart = mapIdx[plainStart];
    const taggedEnd = mapIdx[plainEnd];
    
    let type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI';
    if (match[1]) type = 'CZNUM';
    else if (match[2] || match[3]) type = 'CZFIG';
    else if (match[4]) type = 'CZNAR';
    else if (match[7]) type = 'CZPAR';
    else if (match[9]) type = 'CZURL';
    else if (match[10]) type = 'CZDOI';
    else continue;

    citations.push({ type, taggedStart, taggedEnd, match });
  }

  const htmlTags: Array<{ taggedStart: number; taggedEnd: number; tag: string; content: string }> = [];
  const htmlTagRegex = /<(i|sup|sub)>([\s\S]*?)<\/\1>/gi;
  let htmlMatch;
  while ((htmlMatch = htmlTagRegex.exec(preprocessedParaText)) !== null) {
    const taggedStart = htmlMatch.index;
    const taggedEnd = htmlTagRegex.lastIndex;
    
    const isInsideCitation = citations.some(c => taggedStart >= c.taggedStart && taggedEnd <= c.taggedEnd);
    if (!isInsideCitation) {
      htmlTags.push({
        taggedStart,
        taggedEnd,
        tag: htmlMatch[1],
        content: htmlMatch[2]
      });
    }
  }

  const allMatches: Array<{
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZHTML' | 'CZURL' | 'CZDOI';
    taggedStart: number;
    taggedEnd: number;
    data: any;
  }> = [];

  for (const c of citations) {
    allMatches.push({ type: c.type, taggedStart: c.taggedStart, taggedEnd: c.taggedEnd, data: c.match });
  }
  for (const h of htmlTags) {
    allMatches.push({ type: 'CZHTML', taggedStart: h.taggedStart, taggedEnd: h.taggedEnd, data: h });
  }

  allMatches.sort((a, b) => a.taggedStart - b.taggedStart);

  for (const m of allMatches) {
    const taggedMatchText = preprocessedParaText.substring(m.taggedStart, m.taggedEnd);
    if (m.type === 'CZNUM') {
      nums.push({ match: taggedMatchText, key: m.data[1] });
    } else if (m.type === 'CZFIG') {
      figs.push({ match: taggedMatchText, query: (m.data[2] || m.data[3]).trim() });
    } else if (m.type === 'CZNAR') {
      nars.push({ match: taggedMatchText, author: m.data[4], year: m.data[5] + (m.data[6] || '') });
    } else if (m.type === 'CZPAR') {
      const innerText = m.data[8];
      const innerStartPlain = m.data.index + m.data[0].indexOf(innerText);
      const itemsPlain = innerText.split(/[;；]/);
      const itemsData: Array<{ text: string; taggedText: string }> = [];
      let currentPlainOffset = innerStartPlain;
      
      for (const item of itemsPlain) {
        const itemStartPlain = currentPlainOffset;
        const itemEndPlain = itemStartPlain + item.length;
        currentPlainOffset = itemEndPlain + 1;
        
        const itemTaggedStart = mapIdx[itemStartPlain];
        const itemTaggedEnd = mapIdx[itemEndPlain];
        const itemTaggedText = preprocessedParaText.substring(itemTaggedStart, itemTaggedEnd);
        
        itemsData.push({
          text: item,
          taggedText: itemTaggedText
        });
      }
      pars.push({ match: taggedMatchText, items: itemsData });
    } else if (m.type === 'CZHTML') {
      htmls.push({ match: taggedMatchText, tag: m.data.tag, content: m.data.content });
    } else if (m.type === 'CZURL') {
      urls.push({ match: taggedMatchText, url: m.data[9] });
    } else if (m.type === 'CZDOI') {
      dois.push({ match: taggedMatchText, doi: m.data[10] });
    }
  }

  const placeholderSplitRegex = /(\[\[(?:CZNUM|CZFIG|CZNAR|CZPAR|CZHTML|CZURL|CZDOI)_\d+\]\])/g;
  const parts = translated.split(placeholderSplitRegex);
  const resultNodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const placeholderMatch = part.match(/^\[\[(CZNUM|CZFIG|CZNAR|CZPAR|CZHTML|CZURL|CZDOI)_(\d+)\]\]$/);
    if (placeholderMatch) {
      const type = placeholderMatch[1];
      const idx = parseInt(placeholderMatch[2], 10);

      if (type === 'CZHTML') {
        const data = htmls[idx];
        if (data) {
          const Tag = data.tag.toLowerCase() as 'i' | 'sup' | 'sub';
          resultNodes.push(
            <Tag key={`placeholder-html-${idx}-${i}`}>
              {renderFormattedContent(data.content)}
            </Tag>
          );
        } else {
          resultNodes.push(part);
        }
      } else if (type === 'CZNUM') {
        const data = nums[idx];
        if (data) {
          const keysStr = data.key;
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
                for (let k = low; k <= high; k++) {
                  keys.push(String(k));
                }
              }
            } else {
              const k = parseInt(trimmed, 10);
              if (!isNaN(k)) {
                keys.push(String(k));
              }
            }
          }

          resultNodes.push(
            <span key={`placeholder-num-${i}`} className="select-none text-zinc-500 dark:text-zinc-400 font-sans">
              [
              {keys.map((key, keyIdx) => {
                const hasRef = bibliography[key];
                const className = hasRef 
                  ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-mono font-bold px-0.5"
                  : "text-zinc-600 dark:text-zinc-400 font-mono px-0.5";
                return (
                  <span key={keyIdx}>
                    {keyIdx > 0 && ','}
                    <span 
                      className={className}
                      onClick={(e) => {
                        if (hasRef) {
                          e.stopPropagation();
                          window.getSelection()?.removeAllRanges();
                          postMessage({
                            type: 'jump-to-page',
                            pageNumber: bibliography[key].pageNumber
                          });
                        }
                      }}
                      title={hasRef ? `跳转到文献 [${key}]` : undefined}
                    >
                      {key}
                    </span>
                  </span>
                );
              })}
              ]
            </span>
          );
        } else {
          resultNodes.push(part);
        }
      } else if (type === 'CZFIG') {
        const data = figs[idx];
        if (data) {
          resultNodes.push(
            <span 
              key={`placeholder-fig-${i}`}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-bold px-0.5"
              onClick={(e) => {
                e.stopPropagation();
                window.getSelection()?.removeAllRanges();
                postMessage({
                  type: 'find-and-jump-to-caption',
                  query: data.query
                });
              }}
              title={`跳转到 ${data.query}`}
            >
              {renderFormattedContent(data.match)}
            </span>
          );
        } else {
          resultNodes.push(part);
        }
      } else if (type === 'CZNAR') {
        const data = nars[idx];
        if (data) {
          const key = `${data.author.toLowerCase()}-${data.year.toLowerCase()}`;
          const hasRef = bibliography[key];
          resultNodes.push(
            <span 
              key={`placeholder-nar-${i}`}
              className={hasRef 
                ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5" 
                : "text-zinc-600 dark:text-zinc-400 px-0.5"}
              onClick={(e) => {
                if (hasRef) {
                  e.stopPropagation();
                  window.getSelection()?.removeAllRanges();
                  postMessage({
                    type: 'jump-to-page',
                    pageNumber: bibliography[key].pageNumber
                  });
                }
              }}
              title={hasRef ? `跳转到文献 [${key}]` : undefined}
            >
              {renderFormattedContent(data.match)}
            </span>
          );
        } else {
          resultNodes.push(part);
        }
      } else if (type === 'CZPAR') {
        const data = pars[idx];
        if (data) {
          const renderedItems: ReactNode[] = [];
          for (let k = 0; k < data.items.length; k++) {
            const itemObj = data.items[k];
            const itemMatch = itemObj.text.match(/\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?(?:,\s*|，\s*)(\d{4})([a-z])?/i);
            
            if (k > 0) {
              renderedItems.push('; ');
            }
            
            if (itemMatch) {
              const author = itemMatch[1].toLowerCase();
              const year = (itemMatch[2] + (itemMatch[3] || '')).toLowerCase();
              const key = `${author}-${year}`;
              const hasRef = bibliography[key];
              
              renderedItems.push(
                <span 
                  key={`parenthetical-item-${k}`}
                  className={hasRef 
                    ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5" 
                    : "text-zinc-600 dark:text-zinc-400 px-0.5"}
                  onClick={(e) => {
                    if (hasRef) {
                      e.stopPropagation();
                      window.getSelection()?.removeAllRanges();
                      postMessage({
                        type: 'jump-to-page',
                        pageNumber: bibliography[key].pageNumber
                      });
                    }
                  }}
                  title={hasRef ? `跳转到文献 [${key}]` : undefined}
                >
                  {renderFormattedContent(itemObj.taggedText.trim())}
                </span>
              );
            } else {
              renderedItems.push(renderFormattedContent(itemObj.taggedText));
            }
          }
          resultNodes.push(
            <span key={`placeholder-par-${i}`}>
              ({renderedItems})
            </span>
          );
        } else {
          resultNodes.push(part);
        }
      } else if (type === 'CZURL') {
        const data = urls[idx];
        if (data) {
          resultNodes.push(
            <a
              key={`placeholder-url-${i}`}
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans"
              onClick={(e) => {
                e.stopPropagation();
                window.getSelection()?.removeAllRanges();
              }}
              title={data.url}
            >
              {data.match}
            </a>
          );
        } else {
          resultNodes.push(part);
        }
      } else if (type === 'CZDOI') {
        const data = dois[idx];
        if (data) {
          resultNodes.push(
            <a
              key={`placeholder-doi-${i}`}
              href={`https://doi.org/${data.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-medium"
              onClick={(e) => {
                e.stopPropagation();
                window.getSelection()?.removeAllRanges();
              }}
              title={`https://doi.org/${data.doi}`}
            >
              {data.match}
            </a>
          );
        } else {
          resultNodes.push(part);
        }
      }
    } else {
      resultNodes.push(part);
    }
  }

  return resultNodes;
}

type ParagraphRole = 'title' | 'heading' | 'body' | 'small';

const HEADING_RE = /^(?:abstract|introduction|background|methods|materials?\s+and\s+methods?|methodology|results|discussion|conclusion|conclusions|references|acknowledgments?|summary|keywords?|key\s+words|related\s+work|literature\s+review|objectives?|purpose|aims?|scope|table\s+of\s+contents|appendix|supplementary|figure\s+\d|table\s+\d|fig\.\s+\d)/i;

interface AnnotatedPara {
  id: string;
  text: string;
  section?: 'header' | 'left' | 'right' | 'footer' | 'full';
  columnIndex?: number;
  sentences?: Array<{ id: string; text: string }>;
  fontSize?: number;
  height?: number;
  bold?: boolean;
  blockType?: string;
  skipped?: boolean;
  skipReason?: string;
  lineMarker?: 'horizontal-rule' | 'table-image' | 'figure-image';
  ruleX1?: number;
  ruleX2?: number;
  imageDataUrl?: string;
  imageAlt?: string;
  role: ParagraphRole;
}

function splitTableCells(text: string): string[] {
  const normalized = text.replace(/\u00a0/g, ' ').trim();
  if (!normalized) return [];

  const tabCells = normalized.split('\t').map(cell => cell.trim()).filter(Boolean);
  if (tabCells.length > 1) return tabCells;

  const multiSpaceCells = normalized.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
  if (multiSpaceCells.length > 1) return multiSpaceCells;

  return [normalized];
}

function classifyParagraphs(
  paragraphs: Array<{ text: string; fontSize?: number; blockType?: string }>
): ParagraphRole[] {
  const sizes = paragraphs.map(p => p.fontSize).filter((s): s is number => s !== undefined && s > 0);

  if (sizes.length === 0) {
    return paragraphs.map(() => 'body');
  }

  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return paragraphs.map(para => {
    // Use blockType from textLayer when available
    if (para.blockType === 'title') return 'title';
    if (para.blockType === 'heading') return 'heading';
    if (para.blockType === 'authors' || para.blockType === 'table'
        || para.blockType === 'figure-caption' || para.blockType === 'reference') return 'small';

    // Fall back to font-size heuristic for body/unknown
    const fs = para.fontSize;
    if (!fs) return 'body';

    const ratio = fs / median;
    const text = para.text.trim();

    if (ratio >= 1.5) return 'title';
    if (ratio >= 1.15 && text.length < 80) return 'heading';
    if (HEADING_RE.test(text) && text.length < 60) return 'heading';
    if (ratio < 0.85) return 'small';
    return 'body';
  });
}

// ── Role-based style maps ──

const EN_STYLES: Record<ParagraphRole, string> = {
  title: 'font-serif text-[16px] font-bold text-center leading-[1.4] tracking-wide',
  heading: 'font-serif text-[12px] font-bold leading-[1.5]',
  body: 'font-serif text-[11px] leading-[1.65] text-justify',
  small: 'font-serif text-[9.5px] leading-[1.5] text-secondary-foreground/80',
};

const ZH_STYLES: Record<ParagraphRole, string> = {
  title: 'font-zhSerif text-[18px] font-bold text-center leading-[1.6] tracking-wider',
  heading: 'font-zhSerif text-[15px] font-bold leading-[1.7]',
  body: 'font-zhSerif text-[14px] font-medium leading-[2.0] tracking-wide text-justify',
  small: 'font-zhSerif text-[12px] leading-[1.7]',
};

const BI_EN_STYLES: Record<ParagraphRole, string> = {
  title: 'font-serif text-[13px] font-bold text-center leading-[1.4] italic',
  heading: 'font-serif text-[11px] font-bold leading-[1.4] italic',
  body: 'font-serif text-[11px] leading-[1.5] italic text-secondary-foreground',
  small: 'font-serif text-[9.5px] leading-[1.4] italic text-secondary-foreground/60',
};

const BI_ZH_STYLES: Record<ParagraphRole, string> = {
  title: 'font-zhSerif text-[16px] font-bold text-center leading-[1.6] tracking-wide',
  heading: 'font-zhSerif text-[14px] font-bold leading-[1.8] tracking-wide',
  body: 'font-zhSerif text-[14px] leading-[2.0] font-medium tracking-wide text-foreground',
  small: 'font-zhSerif text-[12px] leading-[1.7] text-secondary-foreground',
};

const PARA_SPACING: Record<ParagraphRole, string> = {
  title: 'mb-5',
  heading: 'mb-3 mt-4 para-heading',
  body: 'mb-3',
  small: 'mb-2',
};

const ZH_INDENT: Record<ParagraphRole, string> = {
  title: '',
  heading: '',
  body: 'indent-8',
  small: '',
};

const EN_INDENT: Record<ParagraphRole, string> = {
  title: '',
  heading: '',
  body: 'indent-4',
  small: '',
};

function isHeadingContinuation(prev: AnnotatedPara | undefined, cur: AnnotatedPara): boolean {
  if (!prev) return false;
  if (cur.role !== 'heading') return false;
  if (cur.skipped) return false;

  const prevIsHeadingLike = prev.role === 'heading' || prev.blockType === 'heading';
  if (!prevIsHeadingLike) return false;

  const prevText = prev.text.trim();
  const curText = cur.text.trim();
  if (!prevText || !curText) return false;
  if (/[.!?;:。！？；：]$/.test(prevText)) return false;

  if (/^[a-z0-9(]/.test(curText)) return true;
  if (/^(and|or|of|for|to|in|on|with|without|between|by)\b/i.test(curText)) return true;
  if (curText.length <= 42) return true;
  return false;
}

function isCollapsibleNoiseSkip(para: AnnotatedPara | undefined): boolean {
  if (!para?.skipped) return false;
  const reason = (para.skipReason || '').toLowerCase();
  if (!reason) return false;
  return reason.includes('watermark')
    || reason.includes('http')
    || reason.includes('repeated-noise')
    || reason.includes('table-image');
}

function previousSemanticParagraph(paragraphs: AnnotatedPara[], index: number): AnnotatedPara | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const prev = paragraphs[i];
    if (prev.lineMarker === 'horizontal-rule') return undefined;
    if (isCollapsibleNoiseSkip(prev)) continue;
    return prev;
  }
  return undefined;
}

// ── Layout block helpers ──

interface LayoutBlock {
  type: 'single' | 'columns';
  paragraphs: AnnotatedPara[];
}

function getParagraphColumnIndex(para: AnnotatedPara, columnsCount: number): number {
  if (para.columnIndex !== undefined && para.columnIndex >= 0) {
    return Math.min(para.columnIndex, Math.max(columnsCount - 1, 0));
  }
  if (para.section === 'left') return 0;
  if (para.section === 'right') return Math.min(1, Math.max(columnsCount - 1, 0));
  return -1;
}

function groupParagraphsIntoBlocks(paragraphs: AnnotatedPara[], columnsCount: number): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  for (const para of paragraphs) {
    const type = getParagraphColumnIndex(para, columnsCount) >= 0 ? 'columns' : 'single';
    if (blocks.length === 0 || blocks[blocks.length - 1].type !== type) {
      blocks.push({ type, paragraphs: [para] });
    } else {
      blocks[blocks.length - 1].paragraphs.push(para);
    }
  }
  return blocks;
}

interface MineruPara {
  id: string;
  text: string;
  role: 'title' | 'heading' | 'body' | 'small' | 'table';
  originalText: string;
}

// ── Component ──

export const TranslationTab: FunctionComponent = () => {
  const loading = useStore((state) => state.isTranslating);
  const error = useStore((state) => state.translationError);
  const currentPageText = useStore((state) => state.currentPageText);
  const activeParagraphId = useStore((state) => state.activeParagraphId);
  const bibliography = useStore((state) => state.bibliography);

  const layoutMode = useStore((state) => state.layoutMode);
  const setLayoutMode = useStore((state) => state.setLayoutMode);
  const hoverHighlightStyle = useStore((state) => state.layoutConfig?.hoverHighlightStyle ?? 'overlay');

  const highlights = useStore((state) => state.highlights);
  const activePdfUri = useStore((state) => state.activePdfUri);
  const aiExplainResult = useStore((state) => state.aiExplainResult);

  const mineruConfig = useStore((state) => state.mineruConfig);
  const mineruStatus = useStore((state) => state.mineruStatus);
  const mineruProgress = useStore((state) => state.mineruProgress);
  const mineruMarkdown = useStore((state) => state.mineruMarkdown);
  const mineruError = useStore((state) => state.mineruError);

  const [mineruViewActive, setMineruViewActive] = useState(true);

  useEffect(() => {
    if (mineruStatus === 'done' && mineruMarkdown) {
      setMineruViewActive(true);
    }
  }, [mineruStatus, !!mineruMarkdown]);

  const mineruPages = useMemo(() => {
    if (!mineruMarkdown) return [];
    // Split by horizontal rules, page break comments, or page markers
    return mineruMarkdown.split(/\n\s*(?:---|---|---|---|---|---|---|---|---|\*\*\*|<!--\s*page\s*(?:=\s*)?\d+\s*-->)\s*\n/i);
  }, [mineruMarkdown]);

  const mineruParas = useMemo(() => {
    if (!currentPageText || mineruPages.length === 0) return [];
    const pageMd = mineruPages[currentPageText.pageNumber - 1] || '';
    if (!pageMd.trim()) return [];

    const rawParas = pageMd.split(/\n\s*\n+/);
    const parsed: MineruPara[] = [];
    let paraIndex = 0;

    for (const rawText of rawParas) {
      const trimmed = rawText.trim();
      if (!trimmed) continue;

      let role: MineruPara['role'] = 'body';
      if (trimmed.startsWith('#')) {
        role = 'heading';
      } else if (trimmed.startsWith('|')) {
        role = 'table';
      }

      parsed.push({
        id: `mineru-para-${currentPageText.pageNumber}-${paraIndex++}`,
        text: trimmed,
        role,
        originalText: trimmed
      });
    }
    return parsed;
  }, [mineruPages, currentPageText?.pageNumber]);

  const [addingGlossaryParaId, setAddingGlossaryParaId] = useState<string | null>(null);
  const [glossarySource, setGlossarySource] = useState('');
  const [glossaryTarget, setGlossaryTarget] = useState('');
  const [glossaryCategory, setGlossaryCategory] = useState('学术词汇');

  // Local state for highlights, notes, and AI explanation
  const [aiExplanation, setAiExplanation] = useState<{ text: string; result?: string; error?: string; loading: boolean } | null>(null);
  const [activeHighlightAction, setActiveHighlightAction] = useState<{ highlight: SelectionHighlight; rect: { x: number; y: number; width: number; height: number } } | null>(null);
  const [noteEditingHlId, setNoteEditingHlId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    postMessage({ type: 'toggle-panel-fullscreen' });
  };

  // Sync AI explanation result from global store
  useEffect(() => {
    if (aiExplainResult) {
      if (aiExplanation && aiExplanation.text === aiExplainResult.text) {
        setAiExplanation({
          text: aiExplainResult.text,
          result: aiExplainResult.explanation,
          error: aiExplainResult.error,
          loading: false
        });
      }
    }
  }, [aiExplainResult]);

  const handleAddHighlight = (color: 'yellow' | 'green' | 'blue' | 'purple') => {
    if (!selectedText || !selectedParaId || !activePdfUri || !currentPageText) return;
    postMessage({
      type: 'add-highlight',
      pdfUri: activePdfUri,
      pageNumber: currentPageText.pageNumber,
      paragraphId: selectedParaId,
      text: selectedText,
      color,
      note: ''
    });
    setBubbleCoords(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddNoteFromBubble = () => {
    if (!selectedText || !selectedParaId || !activePdfUri || !currentPageText) return;
    const generatedId = Math.random().toString(36).substring(2, 9);
    postMessage({
      type: 'add-highlight',
      id: generatedId,
      pdfUri: activePdfUri,
      pageNumber: currentPageText.pageNumber,
      paragraphId: selectedParaId,
      text: selectedText,
      color: 'yellow',
      note: ''
    });
    setNoteEditingHlId(generatedId);
    setNoteText('');
    setAddingGlossaryParaId(null);
    setBubbleCoords(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAiExplainFromBubble = () => {
    if (!selectedText) return;
    setAiExplanation({
      text: selectedText,
      loading: true
    });
    postMessage({
      type: 'ai-explain',
      text: selectedText
    });
    setBubbleCoords(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteHighlight = (id: string) => {
    postMessage({
      type: 'delete-highlight',
      id
    });
    setActiveHighlightAction(null);
  };

  const handleChangeHighlightColor = (id: string, color: SelectionHighlight['color']) => {
    const hl = highlights.find(h => h.id === id);
    if (!hl) return;
    postMessage({
      type: 'add-highlight',
      id: hl.id,
      pdfUri: hl.pdfUri,
      pageNumber: hl.pageNumber,
      paragraphId: hl.paragraphId,
      text: hl.text,
      color,
      note: hl.note
    });
    setActiveHighlightAction(null);
  };

  const handleHighlightClick = (hl: SelectionHighlight, rect: DOMRect) => {
    const container = document.querySelector('article');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    setActiveHighlightAction({
      highlight: hl,
      rect: {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height
      }
    });
  };

  const handleOpenAddGlossary = (para: AnnotatedPara) => {
    const selection = window.getSelection()?.toString().trim() || '';
    let sourceVal = '';
    let targetVal = '';

    if (selection) {
      const isChinese = /[\u4e00-\u9fa5]/.test(selection);
      if (isChinese) {
        targetVal = selection;
      } else {
        sourceVal = selection;
      }
    }

    setGlossarySource(sourceVal);
    setGlossaryTarget(targetVal);
    setAddingGlossaryParaId(para.id);
  };

  const renderInlineGlossaryForm = (para: AnnotatedPara) => {
    if (addingGlossaryParaId !== para.id) return null;

    const handleSave = () => {
      if (!glossarySource.trim() || !glossaryTarget.trim()) {
        return;
      }
      postMessage({
        type: 'add-term',
        source: glossarySource.trim(),
        target: glossaryTarget.trim(),
        category: glossaryCategory.trim()
      });
      setAddingGlossaryParaId(null);
      setGlossarySource('');
      setGlossaryTarget('');
    };

    return (
      <div 
        className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-left select-text animate-in slide-in-from-top-2 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1">
          <span>录入术语库</span>
          <span className="text-secondary-foreground/50 font-normal">(提示: 双击选词后点击 + 可自动填充)</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[8px] font-semibold text-secondary-foreground mb-0.5">英文原文</label>
            <input
              type="text"
              value={glossarySource}
              onChange={(e) => setGlossarySource(e.target.value)}
              placeholder="e.g. lncRNA"
              className="w-full px-2 py-1 text-xs rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text"
            />
          </div>
          <div>
            <label className="block text-[8px] font-semibold text-secondary-foreground mb-0.5">汉语译文</label>
            <input
              type="text"
              value={glossaryTarget}
              onChange={(e) => setGlossaryTarget(e.target.value)}
              placeholder="e.g. 长链非编码RNA"
              className="w-full px-2 py-1 text-xs rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text"
            />
          </div>
        </div>
        <div className="flex gap-2 items-center justify-between mt-1">
          <div className="flex-1 max-w-[120px]">
            <input
              type="text"
              value={glossaryCategory}
              onChange={(e) => setGlossaryCategory(e.target.value)}
              placeholder="类别 (默认: 学术词汇)"
              className="w-full px-2 py-1 text-[10px] rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setAddingGlossaryParaId(null)}
              className="px-2.5 py-1 text-[10px] font-semibold rounded border border-border hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-2.5 py-1 text-[10px] font-bold rounded bg-primary text-primary-foreground hover:bg-primary/95 active:scale-95 transition-all duration-150 cursor-pointer"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderInlineNoteForm = (paraId: string) => {
    const hlBeingEdited = highlights.find(h => h.paragraphId === paraId && h.id === noteEditingHlId);
    if (!hlBeingEdited) return null;

    const handleSaveNote = () => {
      postMessage({
        type: 'add-highlight',
        id: hlBeingEdited.id,
        pdfUri: hlBeingEdited.pdfUri,
        pageNumber: hlBeingEdited.pageNumber,
        paragraphId: hlBeingEdited.paragraphId,
        text: hlBeingEdited.text,
        color: hlBeingEdited.color,
        note: noteText.trim()
      });
      setNoteEditingHlId(null);
      setNoteText('');
    };

    return (
      <div 
        className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-left select-text animate-in slide-in-from-top-2 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-bold text-primary mb-2 flex items-center justify-between">
          <span>撰写想法 / 批注</span>
          <button 
            onClick={() => setNoteEditingHlId(null)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 bg-transparent border-0 cursor-pointer"
          >
            关闭
          </button>
        </div>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="输入您的想法或笔记..."
          rows={3}
          className="w-full p-2 text-xs rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text mb-2 resize-none"
        />
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={() => {
              setNoteEditingHlId(null);
              setNoteText('');
            }}
            className="px-2.5 py-1 text-[10px] font-semibold rounded border border-border hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSaveNote}
            className="px-2.5 py-1 text-[10px] font-bold rounded bg-primary text-primary-foreground hover:bg-primary/95 active:scale-95 transition-all duration-150 cursor-pointer"
          >
            保存想法
          </button>
        </div>
      </div>
    );
  };

  const isMineruActiveView = false;

  const hasMineruTranslations = useMemo(() => {
    if (mineruParas.length === 0) return false;
    return mineruParas.some(p => !!currentPageText?.translations?.[p.id]);
  }, [mineruParas, currentPageText?.translations]);

  const hasTranslations = !!(currentPageText?.translations && Object.keys(currentPageText.translations).length > 0);
  const pageHasTranslations = isMineruActiveView ? hasMineruTranslations : hasTranslations;

  // Auto-translate on page turn if remembered mode is translation or bilingual
  useEffect(() => {
    if (!currentPageText) return;
    if ((layoutMode === 'translation' || layoutMode === 'bilingual') && !pageHasTranslations && !loading) {
      handleTranslatePage();
    }
  }, [currentPageText?.pageNumber, layoutMode, pageHasTranslations]);

  const annotatedParagraphs: AnnotatedPara[] = useMemo(() => {
    if (!currentPageText?.paragraphs) return [];
    const roles = classifyParagraphs(currentPageText.paragraphs);
    return currentPageText.paragraphs.map((p, i) => ({
      ...p,
      role: roles[i],
    }));
  }, [currentPageText?.paragraphs]);


  const [bubbleCoords, setBubbleCoords] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedParaId, setSelectedParaId] = useState<string | null>(null);

  const handleAddFromBubble = () => {
    if (!selectedText || !selectedParaId) return;
    const isChinese = /[\u4e00-\u9fa5]/.test(selectedText);
    if (isChinese) {
      setGlossaryTarget(selectedText);
      setGlossarySource('');
    } else {
      setGlossarySource(selectedText);
      setGlossaryTarget('');
    }
    setAddingGlossaryParaId(selectedParaId);
    setBubbleCoords(null);
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    const checkSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setBubbleCoords(null);
        setSelectedText('');
        return;
      }

      // Check if selecting inside input/textarea
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        setBubbleCoords(null);
        return;
      }

      // Find the anchor node's parent paragraph to know which paragraph is selected
      let node: Node | null = sel.anchorNode;
      let paraId: string | null = null;
      while (node) {
        if (node instanceof HTMLElement && node.dataset.paragraphId) {
          paraId = node.dataset.paragraphId;
          break;
        }
        node = node.parentNode;
      }

      const text = sel.toString().trim();
      if (!text) {
        setBubbleCoords(null);
        return;
      }

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const articleEl = document.querySelector('article');
        if (articleEl && paraId) {
          const articleRect = articleEl.getBoundingClientRect();
          const relativeX = rect.left - articleRect.left + rect.width / 2;
          const clampedX = Math.max(50, Math.min(articleRect.width - 50, relativeX));
          
          setBubbleCoords({
            x: clampedX,
            y: rect.top - articleRect.top - 36
          });
          setSelectedText(text);
          setSelectedParaId(paraId);
        } else {
          setBubbleCoords(null);
        }
      } catch (err) {
        setBubbleCoords(null);
      }
    };

    document.addEventListener('mouseup', checkSelection);
    document.addEventListener('keyup', checkSelection);
    return () => {
      document.removeEventListener('mouseup', checkSelection);
      document.removeEventListener('keyup', checkSelection);
    };
  }, [annotatedParagraphs]);

  // Scroll active paragraph into view
  useEffect(() => {
    if (activeParagraphId) {
      const elements = document.querySelectorAll(`[data-paragraph-id="${activeParagraphId}"]`);
      if (elements.length > 0) {
        (elements[0] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeParagraphId]);

  const handleParagraphHover = (id: string | null) => {
    useStore.setState({ activeParagraphId: id });
    postMessage({
      type: 'panel-hover',
      id: id || undefined
    });
  };

  const splitChineseSentences = (text: string): string[] => {
    const results: string[] = [];
    const re = /[^。！？]*[。！？]+(?:\s|$)/g;
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = re.exec(text)) !== null) {
      results.push(m[0]);
      last = re.lastIndex;
    }
    if (last < text.length) {
      const rest = text.slice(last).trim();
      if (rest) results.push(rest);
    }
    return results.filter(s => s.trim().length > 0);
  };

  const alignSentences = (
    englishSentences: Array<{ id: string; text: string }> | undefined,
    translatedText: string
  ): Array<{ id: string; text: string }> => {
    if (!translatedText) return [];
    if (!englishSentences || englishSentences.length === 0) {
      return [{ id: '', text: translatedText }];
    }

    const chineseSentences = splitChineseSentences(translatedText);

    if (chineseSentences.length === englishSentences.length) {
      return englishSentences.map((eng, idx) => ({
        id: eng.id,
        text: chineseSentences[idx]
      }));
    }

    if (englishSentences.length === 1) {
      return [{ id: englishSentences[0].id, text: translatedText }];
    }

    return [{ id: englishSentences[0].id, text: translatedText }];
  };

  const renderEnglishParagraph = (para: AnnotatedPara) => {
    if (para.sentences && para.sentences.length > 0) {
      return para.sentences.map((sent) => (
        <span
          key={sent.id}
          data-sentence-id={sent.id}
          className="translation-tab-sentence"
        >
          {renderTextWithHighlightsAndCitations(sent.text, para.id, bibliography, highlights, handleHighlightClick)}{' '}
        </span>
      ));
    }
    return renderTextWithHighlightsAndCitations(para.text, para.id, bibliography, highlights, handleHighlightClick);
  };

  const renderChineseParagraph = (
    para: AnnotatedPara,
    translation: string
  ) => {
    if (!translation) return '';

    // If translation has CZ placeholders, use renderTextWithPlaceholders
    const hasPlaceholders = /\[\[CZ(NUM|FIG|CZNAR|CZPAR)_\d+\]\]/.test(translation);
    if (hasPlaceholders) {
      return renderTextWithPlaceholders(translation, para, bibliography, highlights, handleHighlightClick);
    }

    const aligned = alignSentences(para.sentences, translation);
    if (aligned.length > 0) {
      return aligned.map((sent) => (
        <span
          key={sent.id || para.id}
          data-sentence-id={sent.id || undefined}
          className="translation-tab-sentence"
        >
          {renderTextWithHighlightsAndCitations(sent.text, para.id, bibliography, highlights, handleHighlightClick)}
        </span>
      ));
    }
    return renderTextWithHighlightsAndCitations(translation, para.id, bibliography, highlights, handleHighlightClick);
  };

  const handleTranslatePage = () => {
    if (!currentPageText) return;
    useStore.setState({ isTranslating: true });

    const isMineruActive = mineruConfig.enable && mineruStatus === 'done' && mineruMarkdown && mineruViewActive && mineruParas.length > 0;

    const translatableParagraphs = isMineruActive
      ? mineruParas.map(para => {
          const { protectedText } = protectMathAndCitations(para.text);
          return { id: para.id, text: protectedText };
        })
      : currentPageText.paragraphs
          .filter(para => !para.skipped && para.lineMarker !== 'horizontal-rule' && !!para.text.trim())
          .map(para => {
            const protectedText = protectTextWithPlaceholders(para.text);
            return { id: para.id, text: protectedText };
          });

    postMessage({
      type: 'translate-page',
      pageNumber: currentPageText.pageNumber,
      paragraphs: translatableParagraphs
    });
  };

  const handleRefreshText = () => {
    postMessage({
      type: 'refresh-page-text'
    });
  };

  const handleMineruToggle = () => {
    if (mineruStatus === 'parsing') {
      return;
    }
    if (mineruStatus === 'done') {
      setMineruViewActive(!mineruViewActive);
    } else {
      if (activePdfUri) {
        postMessage({
          type: 'trigger-mineru-parse',
          pdfUri: activePdfUri
        });
        useStore.setState({ mineruStatus: 'parsing', mineruProgress: 0 });
      }
    }
  };

  const paraClass = (
    para: AnnotatedPara,
    mode: 'en' | 'zh' | 'bi-en' | 'bi-zh',
    prevPara?: AnnotatedPara
  ): string => {
    const role = para.role;
    const styles = mode === 'en' ? EN_STYLES
      : mode === 'zh' ? ZH_STYLES
      : mode === 'bi-en' ? BI_EN_STYLES
      : BI_ZH_STYLES;
    const indent = (mode === 'en') ? EN_INDENT[role]
      : (mode === 'zh') ? ZH_INDENT[role]
      : '';
    // Add font-bold from PDF data when role doesn't already include bold
    const boldClass = (para.bold && role !== 'title' && role !== 'heading') ? 'font-bold' : '';
    const spacing = (role === 'heading' && isHeadingContinuation(prevPara, para))
      ? 'mb-1'
      : PARA_SPACING[role];
    return `${styles[role]} ${indent} ${boldClass} ${spacing}`;
  };

  const renderTableRow = (id: string, text: string, className: string) => {
    const cells = splitTableCells(text);
    const paraId = id.split('-')[0];
    if (cells.length <= 1) {
      return (
        <p key={id} className={className}>
          {renderTextWithHighlightsAndCitations(text, paraId, bibliography, highlights, handleHighlightClick)}
        </p>
      );
    }

    return (
      <div
        key={id}
        className={`${className} grid gap-x-4 gap-y-1 font-mono`}
        style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, idx) => (
          <span key={`${id}-${idx}`} className="block whitespace-pre-wrap break-words">
            {renderTextWithHighlightsAndCitations(cell, paraId, bibliography, highlights, handleHighlightClick)}
          </span>
        ))}
      </div>
    );
  };

  const wrapHoverableParagraph = (para: AnnotatedPara, child: JSX.Element) => {
    return (
      <div
        key={para.id}
        data-paragraph-id={para.id}
        onMouseEnter={(e) => {
          if (e.buttons === 1) return; // Do not hover while selecting/dragging
          handleParagraphHover(para.id);
        }}
        onMouseLeave={(e) => {
          if (e.buttons === 1) return; // Do not hover while selecting/dragging
          handleParagraphHover(null);
        }}
        className={`translation-tab-paragraph relative ${activeParagraphId === para.id ? 'active' : ''}`}
      >
        {child}
        {/* Inline glossary addition form */}
        {renderInlineGlossaryForm(para)}
        {/* Inline note/thought form */}
        {renderInlineNoteForm(para.id)}
      </div>
    );
  };

  const renderOriginalParagraphNode = (para: AnnotatedPara, prevPara?: AnnotatedPara) => {
    if (para.lineMarker === 'horizontal-rule') {
      return <hr key={para.id} className="border-0 border-t border-border/45 my-4" />;
    }
    if (para.imageDataUrl) {
      return (
        <figure key={para.id} className="mb-4">
          <img src={para.imageDataUrl} alt={para.imageAlt || 'table image'} className="w-full rounded border border-border/40 shadow-sm" />
        </figure>
      );
    }
    if (para.skipped) {
      if (isCollapsibleNoiseSkip(para)) return null;
      const h = Math.max(4, Math.min(220, para.height || para.fontSize || 12));
      return <div key={para.id} className="opacity-0 pointer-events-none" style={{ height: `${h}px` }} aria-hidden />;
    }
    const className = paraClass(para, 'en', prevPara);
    if (para.blockType === 'table') {
      return wrapHoverableParagraph(para, renderTableRow(`${para.id}-en`, para.text, className));
    }
    return wrapHoverableParagraph(para, <p className={className}>{renderEnglishParagraph(para)}</p>);
  };

  const renderTranslatedParagraphNode = (para: AnnotatedPara, prevPara?: AnnotatedPara) => {
    if (para.lineMarker === 'horizontal-rule') {
      return <hr key={para.id} className="border-0 border-t border-border/45 my-4" />;
    }
    if (para.imageDataUrl) {
      return (
        <figure key={para.id} className="mb-4">
          <img src={para.imageDataUrl} alt={para.imageAlt || 'table image'} className="w-full rounded border border-border/40 shadow-sm" />
        </figure>
      );
    }
    if (para.skipped) {
      if (isCollapsibleNoiseSkip(para)) return null;
      const h = Math.max(4, Math.min(220, para.height || para.fontSize || 12));
      return <div key={para.id} className="opacity-0 pointer-events-none" style={{ height: `${h}px` }} aria-hidden />;
    }
    const className = paraClass(para, 'zh', prevPara);
    const translated = currentPageText!.translations?.[para.id] || '';
    if (para.blockType === 'table') {
      return wrapHoverableParagraph(para, renderTableRow(`${para.id}-zh`, translated || para.text, className));
    }
    return wrapHoverableParagraph(para, <p className={className}>{renderChineseParagraph(para, translated)}</p>);
  };

  const renderBilingualParagraphNode = (para: AnnotatedPara, prevPara?: AnnotatedPara) => {
    if (para.lineMarker === 'horizontal-rule') {
      return <hr key={para.id} className="border-0 border-t border-border/45 my-4" />;
    }
    if (para.imageDataUrl) {
      return (
        <figure key={para.id} className="mb-4">
          <img src={para.imageDataUrl} alt={para.imageAlt || 'table image'} className="w-full rounded border border-border/40 shadow-sm" />
        </figure>
      );
    }
    if (para.skipped) {
      if (isCollapsibleNoiseSkip(para)) return null;
      const h = Math.max(4, Math.min(220, para.height || para.fontSize || 12));
      return <div key={para.id} className="opacity-0 pointer-events-none" style={{ height: `${h}px` }} aria-hidden />;
    }
    const translation = currentPageText!.translations?.[para.id];
    return wrapHoverableParagraph(
      para,
      <div className="mb-4 pb-3 border-b border-border/20 last:border-0">
        {para.blockType === 'table'
          ? renderTableRow(`${para.id}-en`, para.text, `${paraClass(para, 'bi-en', prevPara)} mb-1.5`)
          : (
            <p className={`${paraClass(para, 'bi-en', prevPara)} mb-1.5`}>
              {renderEnglishParagraph(para)}
            </p>
          )}
        {translation && (
          para.blockType === 'table'
            ? renderTableRow(`${para.id}-zh`, translation, `${paraClass(para, 'bi-zh', prevPara)} mt-1 border-l-2 border-primary/20 pl-3`)
            : (
              <p className={`${paraClass(para, 'bi-zh', prevPara)} mt-1 border-l-2 border-primary/20 pl-3`}>
                {renderChineseParagraph(para, translation)}
              </p>
            )
        )}
      </div>
    );
  };

  const renderColumnBlock = (
    block: LayoutBlock,
    columnsCount: number,
    renderPara: (para: AnnotatedPara, prevPara?: AnnotatedPara) => JSX.Element | null
  ) => {
    const perColumn: AnnotatedPara[][] = Array.from({ length: columnsCount }, () => []);
    for (const para of block.paragraphs) {
      const col = getParagraphColumnIndex(para, columnsCount);
      if (col >= 0 && col < columnsCount) {
        perColumn[col].push(para);
      }
    }

    return (
      <div className="grid gap-5 w-full" style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}>
        {perColumn.map((colParas, colIdx) => (
          <div
            key={`col-${colIdx}`}
            className={colIdx > 0 ? 'flex flex-col border-l border-dashed border-border/40 pl-5' : 'flex flex-col'}
          >
            {colParas.map((para, idx) => renderPara(para, previousSemanticParagraph(colParas, idx)))}
          </div>
        ))}
      </div>
    );
  };

  // ── Render helpers for each mode ──

  const renderOriginalBlockLayout = () => {
    const hasColumnHints = annotatedParagraphs.some(
      p => (p.columnIndex !== undefined && p.columnIndex >= 0) || p.section === 'left' || p.section === 'right'
    );
    if (currentPageText!.columnsCount > 1 && hasColumnHints) {
      const blocks = groupParagraphsIntoBlocks(annotatedParagraphs, currentPageText!.columnsCount);
      return (
        <div className="select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300 flex flex-col gap-3">
          {blocks.map((block, idx) => {
            if (block.type === 'single') {
              return (
                <div key={idx} className="w-full">
                  {block.paragraphs.map((para, i) => renderOriginalParagraphNode(para, previousSemanticParagraph(block.paragraphs, i)))}
                </div>
              );
            }
            return <div key={idx}>{renderColumnBlock(block, currentPageText!.columnsCount, renderOriginalParagraphNode)}</div>;
          })}
        </div>
      );
    }

    return (
      <div
        className="select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300"
        style={{
          columnCount: currentPageText!.columnsCount > 1 ? currentPageText!.columnsCount : undefined,
          columnGap: '20px',
          columnRule: currentPageText!.columnsCount > 1 ? '1px dashed var(--border)' : undefined,
        }}
        >
        {annotatedParagraphs.map((para, i) => renderOriginalParagraphNode(para, previousSemanticParagraph(annotatedParagraphs, i)))}
      </div>
    );
  };

  const renderTranslationBlockLayout = () => {
    const hasColumnHints = annotatedParagraphs.some(
      p => (p.columnIndex !== undefined && p.columnIndex >= 0) || p.section === 'left' || p.section === 'right'
    );
    if (currentPageText!.columnsCount > 1 && hasColumnHints) {
      const blocks = groupParagraphsIntoBlocks(annotatedParagraphs, currentPageText!.columnsCount);
      return (
        <div className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300 flex flex-col gap-4">
          {blocks.map((block, idx) => {
            if (block.type === 'single') {
              return (
                <div key={idx} className="w-full">
                  {block.paragraphs.map((para, i) => renderTranslatedParagraphNode(para, previousSemanticParagraph(block.paragraphs, i)))}
                </div>
              );
            }
            return <div key={idx}>{renderColumnBlock(block, currentPageText!.columnsCount, renderTranslatedParagraphNode)}</div>;
          })}
        </div>
      );
    }

    return (
      <div
        className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300"
        style={{
          columnCount: currentPageText!.columnsCount > 1 ? currentPageText!.columnsCount : undefined,
          columnGap: '20px',
          columnRule: currentPageText!.columnsCount > 1 ? '1px dashed var(--border)' : undefined,
        }}
        >
        {annotatedParagraphs.map((para, i) => renderTranslatedParagraphNode(para, previousSemanticParagraph(annotatedParagraphs, i)))}
      </div>
    );
  };

  const renderBilingualBlockLayout = () => {
    const hasColumnHints = annotatedParagraphs.some(
      p => (p.columnIndex !== undefined && p.columnIndex >= 0) || p.section === 'left' || p.section === 'right'
    );
    if (currentPageText!.columnsCount > 1 && hasColumnHints) {
      const blocks = groupParagraphsIntoBlocks(annotatedParagraphs, currentPageText!.columnsCount);
      return (
        <div className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300 flex flex-col gap-4">
          {blocks.map((block, idx) => {
            if (block.type === 'single') {
              return (
                <div key={idx} className="w-full">
                  {block.paragraphs.map((para, i) => renderBilingualParagraphNode(para, previousSemanticParagraph(block.paragraphs, i)))}
                </div>
              );
            }
            return <div key={idx}>{renderColumnBlock(block, currentPageText!.columnsCount, renderBilingualParagraphNode)}</div>;
          })}
        </div>
      );
    }

    return (
      <div className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300">
        {annotatedParagraphs.map((para, i) => renderBilingualParagraphNode(para, previousSemanticParagraph(annotatedParagraphs, i)))}
      </div>
    );
  };
  const handleArticleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Handle highlight clicks
    const hlSpan = target.closest('[data-highlight-id]');
    if (hlSpan) {
      const hlId = hlSpan.getAttribute('data-highlight-id');
      const hl = highlights.find(h => h.id === hlId);
      if (hl) {
        e.stopPropagation();
        const rect = hlSpan.getBoundingClientRect();
        handleHighlightClick(hl, rect);
        return;
      }
    }
    
    // Handle citation jumps
    const citationSpan = target.closest('[data-jump-citation]');
    if (citationSpan) {
      const key = citationSpan.getAttribute('data-jump-citation')!;
      const hasRef = bibliography[key];
      if (hasRef) {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        postMessage({
          type: 'jump-to-page',
          pageNumber: bibliography[key].pageNumber
        });
        return;
      }
    }
    
    // Handle figure jumps
    const captionSpan = target.closest('[data-jump-caption]');
    if (captionSpan) {
      const query = captionSpan.getAttribute('data-jump-caption')!;
      e.stopPropagation();
      window.getSelection()?.removeAllRanges();
      postMessage({
        type: 'find-and-jump-to-caption',
        query
      });
      return;
    }
  };

  const renderMineruContent = (text: string, paraId: string) => {
    let processed = applyHighlightsToMineruText(text, paraId, highlights);
    processed = applyJumpLinksToMineruText(processed, bibliography);
    processed = renderMathInText(processed);
    const html = marked.parse(processed, { async: false }) as string;
    return (
      <div 
        dangerouslySetInnerHTML={{ __html: html }} 
        className="mineru-markdown-content text-left"
      />
    );
  };

  const renderOriginalMineruNode = (para: MineruPara) => {
    return wrapHoverableParagraph(
      { id: para.id, text: para.originalText, role: para.role === 'table' ? 'small' : para.role } as any,
      renderMineruContent(para.originalText, para.id)
    );
  };

  const renderTranslatedMineruNode = (para: MineruPara) => {
    const translationRaw = currentPageText!.translations?.[para.id] || '';
    const textToRender = translationRaw
      ? restoreMathAndCitationsFallback(translationRaw, para.originalText)
      : para.originalText;
    return wrapHoverableParagraph(
      { id: para.id, text: para.originalText, role: para.role === 'table' ? 'small' : para.role } as any,
      renderMineruContent(textToRender, para.id)
    );
  };

  const renderBilingualMineruNode = (para: MineruPara) => {
    const translationRaw = currentPageText!.translations?.[para.id] || '';
    const textToRender = translationRaw
      ? restoreMathAndCitationsFallback(translationRaw, para.originalText)
      : '';

    return wrapHoverableParagraph(
      { id: para.id, text: para.originalText, role: para.role === 'table' ? 'small' : para.role } as any,
      <div className="mb-4 pb-3 border-b border-border/20 last:border-0 text-left">
        <div className="mb-1.5 italic text-secondary-foreground font-serif">
          {renderMineruContent(para.originalText, para.id)}
        </div>
        {textToRender && (
          <div className="mt-1 border-l-2 border-primary/20 pl-3 text-foreground font-sans">
            {renderMineruContent(textToRender, para.id)}
          </div>
        )}
      </div>
    );
  };

  const renderMineruLayout = () => {
    return (
      <div className="select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300 flex flex-col gap-3 text-left">
        {mineruParas.map((para) => {
          if (layoutMode === 'original') return renderOriginalMineruNode(para);
          if (layoutMode === 'translation') return renderTranslatedMineruNode(para);
          return renderBilingualMineruNode(para);
        })}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      {/* Layout Mode Switcher & Refresh Button */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex bg-secondary/25 p-0.5 rounded-lg border border-border/40 text-[10px] font-semibold shadow-inner">
          <button
            onClick={() => setLayoutMode('original')}
            className={`flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${
              layoutMode === 'original'
                ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                : 'text-secondary-foreground hover:text-foreground'
            }`}
          >
            纯原文 (英文)
          </button>
          <button
            onClick={() => setLayoutMode('translation')}
            className={`flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${
              layoutMode === 'translation'
                ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                : 'text-secondary-foreground hover:text-foreground'
            }`}
          >
            纯译文 (中文)
          </button>
          <button
            onClick={() => setLayoutMode('bilingual')}
            className={`flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${
              layoutMode === 'bilingual'
                ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                : 'text-secondary-foreground hover:text-foreground'
            }`}
          >
            双语对照
          </button>
        </div>
        {/* {activePdfUri && (
          <label 
            onClick={handleMineruToggle}
            className={`flex items-center gap-1.5 text-[10px] font-bold cursor-pointer select-none bg-secondary/25 border border-border/40 rounded-lg px-2.5 py-1.5 hover:bg-secondary/40 active:scale-95 transition-all duration-150 flex-shrink-0 ${
              mineruStatus === 'done' ? 'text-primary' : 'text-secondary-foreground/60'
            }`}
          >
            <input 
              type="checkbox"
              checked={mineruStatus === 'done' ? mineruViewActive : (mineruStatus === 'parsing')}
              disabled={mineruStatus === 'parsing'}
              readOnly
              className="w-3 h-3 accent-primary cursor-pointer disabled:cursor-not-allowed"
            />
            {mineruStatus === 'parsing' ? (
              <RefreshCw className="w-3 h-3 text-primary animate-spin" />
            ) : (
              <Sparkles className={`w-3 h-3 ${mineruStatus === 'done' ? 'text-primary animate-pulse' : 'text-secondary-foreground/60'}`} />
            )}
            <span>
              {mineruStatus === 'parsing' && `AI排版解析中...`}
              {mineruStatus === 'failed' && `使用AI排版 (重试)`}
              {mineruStatus === 'idle' && `使用AI排版`}
              {mineruStatus === 'done' && (
                layoutMode === 'original' ? '只展示 MinerU 原文' : 'AI 排版重构'
              )}
            </span>
          </label>
        )} */}
        <button
          onClick={handleRefreshText}
          title="重新提取当前页原文"
          className="p-1.5 rounded-lg border border-border/40 bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleToggleFullscreen}
          title="翻译全屏切换"
          className="p-1.5 rounded-lg border border-border/40 bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      {/* MinerU Parsing Progress Bar */}
      {/* {mineruStatus === 'parsing' && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex flex-col gap-1.5 animate-in slide-in-from-top duration-200">
          <div className="flex justify-between items-center text-[10px] font-bold text-primary">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary animate-pulse" />
              AI 正在重新排版公式与表格...
            </span>
            <span>{mineruProgress}%</span>
          </div>
          <div className="w-full bg-secondary h-1 rounded-full overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-300 rounded-full" 
              style={{ width: `${mineruProgress}%` }}
            />
          </div>
        </div>
      )} */}

      {/* MinerU Parsing Failure Warning */}
      {/* {mineruStatus === 'failed' && (
        <div className="bg-error/5 border border-error/20 rounded-lg p-2.5 flex flex-col gap-1.5 text-[10px] text-error font-semibold animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              ⚠️ AI 排版重构失败，已自动使用标准排版
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleMineruToggle}
                className="text-[9px] underline hover:text-error-hover bg-transparent border-0 cursor-pointer font-bold"
              >
                重试
              </button>
              <button 
                onClick={() => useStore.setState({ mineruStatus: 'idle', mineruError: null })}
                className="text-[9px] underline hover:text-error-hover bg-transparent border-0 cursor-pointer"
              >
                忽略
              </button>
            </div>
          </div>
          {mineruError && (
            <div className="text-[9px] opacity-90 font-mono break-all border-t border-error/15 pt-1.5 leading-relaxed">
              <strong>错误原由:</strong> {mineruError}
            </div>
          )}
        </div>
      )} */}

      {/* The Academic PDF Paper Sheet */}
      <article 
        onClick={handleArticleClick}
        className={`relative bg-editor-bg border border-border/80 shadow-md rounded-md p-6 min-h-[300px] flex flex-col justify-between transition-all duration-300 ${
          hoverHighlightStyle === 'bar' ? 'hover-highlight-bar' : 'hover-highlight-overlay'
        }`}
      >

        {/* Page Header */}
        <div className="flex justify-between items-center border-b border-border/40 pb-2 mb-4">
          <span className="text-[8px] font-mono tracking-widest text-secondary-foreground/60 uppercase">
            {layoutMode === 'original' && 'CHUNZEN ACADEMIC READER // ORIGINAL VIEW'}
            {layoutMode === 'translation' && 'CHUNZEN ACADEMIC READER // TRANSLATED VIEW'}
            {layoutMode === 'bilingual' && 'CHUNZEN ACADEMIC READER // BILINGUAL VIEW'}
            {currentPageText && ` (PAGE ${currentPageText.pageNumber})`}
          </span>
          <div className="flex items-center gap-2">
            {pageHasTranslations && layoutMode !== 'original' && (
              <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded">
                TRANSLATED
              </span>
            )}
          </div>
        </div>

        {/* Main Document Content */}
        <div className="flex-1 flex flex-col justify-start">
          {loading ? (
            <div className="flex-grow flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-300">
              <div className="relative mb-6">
                {/* Spinning Outer Ring */}
                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin"></div>
                {/* Center Icon */}
                <Compass className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80" />
              </div>
              <h3 className="font-zhSerif text-sm font-bold text-foreground mb-1 animate-pulse">正在翻译第 {currentPageText?.pageNumber || 1} 页</h3>
              <p className="text-[11px] text-secondary-foreground/60 max-w-[220px] leading-relaxed mb-6">
                正在使用高精度学术翻译引擎进行整页解析与对照翻译，请稍候...
              </p>
              {/* Skeleton placeholder underneath */}
              <div className="flex flex-col gap-3.5 py-2 animate-pulse w-full max-w-xs opacity-40">
                <div className="h-3 bg-secondary/50 rounded w-11/12"></div>
                <div className="h-3 bg-secondary/50 rounded w-full"></div>
                <div className="h-3 bg-secondary/50 rounded w-4/5"></div>
              </div>
            </div>
          ) : error ? (
            <div className="p-3.5 rounded bg-error/10 border border-error/20 text-error text-xs leading-relaxed font-mono">
              {error}
            </div>
          ) : currentPageText ? (
            isMineruActiveView ? (
              layoutMode === 'original' ? (
                renderMineruLayout()
              ) : !pageHasTranslations ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 animate-in fade-in duration-300">
                  <Languages className="w-12 h-12 mb-4 text-primary/70 stroke-[1.2]" />
                  <h3 className="font-zhSerif text-base font-bold text-foreground mb-2">整页学术翻译 (AI 排版)</h3>
                  <p className="text-xs text-secondary-foreground/70 max-w-[240px] leading-relaxed mb-6">
                    已通过 MinerU 提取第 {currentPageText.pageNumber} 页的高精度公式与表格，点击下方按钮开始翻译当前整页内容。
                  </p>
                  <button
                    onClick={handleTranslatePage}
                    className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 active:scale-[0.98] rounded-lg shadow-md cursor-pointer transition-all duration-150 inline-flex items-center gap-2"
                  >
                    <Languages className="w-3.5 h-3.5" />
                    翻译当前页
                  </button>
                </div>
              ) : (
                renderMineruLayout()
              )
            ) : (
              layoutMode === 'original' ? (
                annotatedParagraphs.length > 0 ? (
                  renderOriginalBlockLayout()
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-10 opacity-70">
                    <FileCheck className="w-12 h-12 mb-3 text-secondary-foreground/40 stroke-[1.2]" />
                    <h3 className="font-zhSerif text-sm font-bold text-foreground mb-1">未检测到原文文本</h3>
                    <p className="text-[11px] text-secondary-foreground/60 max-w-[200px] leading-relaxed">
                      当前页面未能成功提取到文本段落。
                    </p>
                  </div>
                )
              ) : !pageHasTranslations ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 animate-in fade-in duration-300">
                  <Languages className="w-12 h-12 mb-4 text-primary/70 stroke-[1.2]" />
                  <h3 className="font-zhSerif text-base font-bold text-foreground mb-2">整页学术翻译</h3>
                  <p className="text-xs text-secondary-foreground/70 max-w-[240px] leading-relaxed mb-6">
                    已提取第 {currentPageText.pageNumber} 页的排版原文，点击下方按钮开始翻译当前整页内容。
                  </p>
                  <button
                    onClick={handleTranslatePage}
                    className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 active:scale-[0.98] rounded-lg shadow-md cursor-pointer transition-all duration-150 inline-flex items-center gap-2"
                  >
                    <Languages className="w-3.5 h-3.5" />
                    翻译当前页
                  </button>
                </div>
              ) : layoutMode === 'translation' ? (
                renderTranslationBlockLayout()
              ) : (
                renderBilingualBlockLayout()
              )
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 opacity-70">
              <FileCheck className="w-12 h-12 mb-3 text-secondary-foreground/40 stroke-[1.2]" />
              <h3 className="font-zhSerif text-sm font-bold text-foreground mb-1">春蝉学术译稿</h3>
              <p className="text-[11px] text-secondary-foreground/60 max-w-[200px] leading-relaxed">
                请在左侧 PDF 编辑器中加载文档，以自动提取页面排版并进行翻译。
              </p>
            </div>
          )}
        </div>

        {/* Page Footer */}
        <div className="flex justify-between items-center border-t border-border/30 pt-2.5 mt-5 text-[8px] font-mono text-secondary-foreground/40">
          <span>DOCUMENT TRANSLATION SERVICE</span>
          <span>PAGE {currentPageText?.pageNumber || 1}</span>
        </div>

        {/* Selection Bubble (WeChat Read Capsule Menu) */}
        {bubbleCoords && (
          <div
            className="absolute z-[1000] flex items-center bg-zinc-950 text-zinc-100 rounded-full shadow-xl text-[10px] font-bold cursor-pointer transition-all duration-150 transform -translate-x-1/2 scale-100 hover:scale-[1.02] select-none border border-zinc-800 divide-x divide-zinc-800/80 p-0.5"
            style={{
              left: `${bubbleCoords.x}px`,
              top: `${bubbleCoords.y}px`
            }}
            onMouseUp={(e) => e.stopPropagation()}
          >
            {/* Action 1: Highlight */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddHighlight('yellow');
              }}
              title="划线高亮"
              className="px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans"
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>划线</span>
            </button>

            {/* Action 2: Add Note */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddNoteFromBubble();
              }}
              title="撰写想法与批注"
              className="px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans"
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>写想法</span>
            </button>

            {/* Action 3: AI Explain */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAiExplainFromBubble();
              }}
              title="AI 学术词汇解释"
              className="px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI解释</span>
            </button>

            {/* Action 5: Save Glossary */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddFromBubble();
              }}
              title="添加到学术术语库"
              className="px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>记术语</span>
            </button>

            {/* Action 6: Copy Text */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(selectedText);
                setBubbleCoords(null);
                window.getSelection()?.removeAllRanges();
              }}
              title="复制所选文字"
              className="px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </button>
          </div>
        )}

        {/* Highlight Action Picker (Color, Note, Delete) */}
        {activeHighlightAction && (
          <div
            className="absolute z-[1010] flex flex-col bg-zinc-950 text-zinc-100 rounded-lg shadow-xl text-[10px] font-bold p-2 border border-zinc-800 select-none animate-in fade-in duration-100 font-sans"
            style={{
              left: `${activeHighlightAction.rect.x}px`,
              top: `${activeHighlightAction.rect.y}px`,
              transform: 'translate(-50%, -100%)',
              marginTop: '-10px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-2 justify-center mb-1.5 pb-1.5 border-b border-zinc-800/80">
              {(['yellow', 'green', 'blue', 'purple'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => handleChangeHighlightColor(activeHighlightAction.highlight.id, color)}
                  className={`w-3.5 h-3.5 rounded-full border transition-all cursor-pointer ${
                    color === 'yellow' ? 'bg-amber-400 border-amber-500' :
                    color === 'green' ? 'bg-emerald-400 border-emerald-500' :
                    color === 'blue' ? 'bg-sky-400 border-sky-500' :
                    'bg-purple-400 border-purple-500'
                  } ${activeHighlightAction.highlight.color === color ? 'scale-125 ring-2 ring-zinc-100' : 'hover:scale-110'}`}
                />
              ))}
            </div>
            <div className="flex gap-1.5 items-center">
              <button
                onClick={() => {
                  setNoteEditingHlId(activeHighlightAction.highlight.id);
                  setNoteText(activeHighlightAction.highlight.note || '');
                  setActiveHighlightAction(null);
                }}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 cursor-pointer flex items-center gap-1 border-0"
              >
                <MessageSquareText className="w-2.5 h-2.5" />
                <span>想法</span>
              </button>
              <button
                onClick={() => handleDeleteHighlight(activeHighlightAction.highlight.id)}
                className="px-2 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800/40 rounded text-red-200 cursor-pointer flex items-center justify-center"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => setActiveHighlightAction(null)}
                className="px-1.5 py-1 bg-zinc-900 hover:bg-zinc-800 rounded text-zinc-400 cursor-pointer border-0 flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        )}



        {/* AI Explanation Slide-up Drawer */}
        {aiExplanation && (
          <div className="fixed bottom-0 left-0 right-0 z-[1030] bg-zinc-950 text-zinc-100 border-t border-zinc-800 shadow-2xl p-4 animate-in slide-in-from-bottom duration-300 rounded-t-xl select-text">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5 font-sans">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" /> 春蝉 AI 学术释义
              </span>
              <button
                onClick={() => setAiExplanation(null)}
                className="text-zinc-400 hover:text-zinc-100 bg-transparent border-0 cursor-pointer p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="max-h-40 overflow-y-auto mb-3">
              <p className="text-[10px] text-zinc-400 italic mb-2 font-serif border-l-2 border-zinc-800 pl-2">
                原文: "{aiExplanation.text}"
              </p>
              {aiExplanation.loading ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <div className="w-4 h-4 rounded-full border border-primary/20 border-t-primary animate-spin"></div>
                  <span className="text-xs text-zinc-400 font-sans animate-pulse">AI 正在深度分析中...</span>
                </div>
              ) : aiExplanation.error ? (
                <div className="text-red-400 text-xs py-2 font-mono">{aiExplanation.error}</div>
              ) : (
                <div className="text-[11.5px] leading-relaxed font-serif whitespace-pre-wrap">
                  {aiExplanation.result}
                </div>
              )}
            </div>

            {!aiExplanation.loading && !aiExplanation.error && (
              <div className="flex gap-2 justify-end border-t border-zinc-900 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(aiExplanation.result || '');
                  }}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 cursor-pointer border-0 font-sans"
                >
                  复制释义
                </button>
                <button
                  onClick={() => {
                    const text = aiExplanation.text;
                    const explanation = aiExplanation.result || '';
                    setGlossarySource(text);
                    setGlossaryTarget(explanation.slice(0, 50));
                    setAddingGlossaryParaId(selectedParaId || '');
                    setAiExplanation(null);
                  }}
                  className="px-2.5 py-1 text-[10px] bg-primary text-primary-foreground hover:bg-primary/95 rounded cursor-pointer font-bold border-0 font-sans"
                >
                  记术语
                </button>
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  );
};
