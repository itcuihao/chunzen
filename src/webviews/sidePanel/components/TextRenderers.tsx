// Pure render helpers: turn paragraph text into React nodes with citation/figure/DOI/URL jumps and highlights.
// No hooks and no store access — they depend only on their arguments and postMessage.

import { ReactNode } from 'react';
import { postMessage } from '../vscode';
import { SelectionHighlight } from '../../../types/models';
import { convertSupTagsToUnicode, parseCitationKeys, parseAuthorYearCitations } from '../../../utils/academicHelper';
import { mapHtmlToPlain, preprocessLinks } from '../textProcessing';
import type { AnnotatedPara } from '../paragraphLayout';

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

function renderTextSegmentWithJumps(
  text: string,
  bibliography: Record<string, { text: string; pageNumber: number }>
): ReactNode {
  if (!text) return '';

  const preprocessed = convertSupTagsToUnicode(preprocessLinks(text));
  const { plainText, mapIdx } = mapHtmlToPlain(preprocessed);

  // Appended Group 12 for unicode superscript citations
  const jumpRegex = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table|图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|((?:图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)|\b([A-Z][a-zA-Z\u00C0-\u017F-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?(?:,\s*|，\s*)\d{4}[a-z]?(?:(?:,\s*|，\s*)(?:\d{4}[a-z]?|[a-z]))*(?:\s*[;；]\s*)?)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b|(?<!\d)([⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:\s*[,⁻–-]\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+)*)(?!\d)/gi;
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
      const keys = parseCitationKeys(citationKeysStr);

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

        if (i > 0) {
          renderedItems.push('; ');
        }

        const itemTaggedStart = mapIdx[itemStartPlain];
        const itemTaggedEnd = mapIdx[itemEndPlain];
        const itemTaggedText = preprocessed.substring(itemTaggedStart, itemTaggedEnd);

        const parsedCites = parseAuthorYearCitations(item);

        if (parsedCites.length > 1) {
          let lastIdx = 0;
          for (let ci = 0; ci < parsedCites.length; ci++) {
            const cite = parsedCites[ci];
            const found = itemTaggedText.indexOf(cite.rawText, lastIdx);
            if (found !== -1) {
              if (found > lastIdx) {
                renderedItems.push(renderFormattedContent(itemTaggedText.substring(lastIdx, found)));
              }
              const hasRef = bibliography[cite.key];
              renderedItems.push(
                <span
                  key={`parenthetical-multi-${i}-${ci}`}
                  className={hasRef
                    ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5"
                    : "text-zinc-600 dark:text-zinc-400 px-0.5"}
                  onClick={(e) => {
                    if (hasRef) {
                      e.stopPropagation();
                      window.getSelection()?.removeAllRanges();
                      postMessage({
                        type: 'jump-to-page',
                        pageNumber: bibliography[cite.key].pageNumber
                      });
                    }
                  }}
                  title={hasRef ? `跳转到文献 [${cite.key}]` : undefined}
                >
                  {cite.rawText}
                </span>
              );
              lastIdx = found + cite.rawText.length;
            }
          }
          if (lastIdx < itemTaggedText.length) {
            renderedItems.push(renderFormattedContent(itemTaggedText.substring(lastIdx)));
          }
        } else if (parsedCites.length === 1) {
          const key = parsedCites[0].key;
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
    } else if (match[12]) {
      const citationKeysStr = match[12];
      const keys = parseCitationKeys(citationKeysStr);
      parts.push(
        <sup key={`citation-${matchIndex}`} className="select-none text-zinc-500 dark:text-zinc-400 font-sans">
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
        </sup>
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

export function renderTextWithHighlightsAndCitations(
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
              注
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

export function renderTextWithPlaceholders(
  translated: string,
  para: AnnotatedPara,
  bibliography: Record<string, { text: string; pageNumber: number }>
): ReactNode {
  const nums: Array<{ match: string; key: string }> = [];
  const sups: Array<{ match: string; key: string }> = [];
  const figs: Array<{ match: string; query: string }> = [];
  const nars: Array<{ match: string; author: string; year: string }> = [];
  const pars: Array<{ match: string; items: Array<{ text: string; taggedText: string }> }> = [];
  const htmls: Array<{ match: string; tag: string; content: string }> = [];
  const urls: Array<{ match: string; url: string }> = [];
  const dois: Array<{ match: string; doi: string }> = [];

  const preprocessedParaText = convertSupTagsToUnicode(preprocessLinks(para.text));
  const { plainText, mapIdx } = mapHtmlToPlain(preprocessedParaText);

  // Appended Group 11 for unicode superscript citations
  const unionRegexWithoutHtml = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|\b([A-Z][a-zA-Z\u00C0-\u017F-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?,\s*\d{4}[a-z]?(?:\s*;|，|;|,)?\s*)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b|(?<!\d)([⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:\s*[,⁻–-]\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+)*)(?!\d)/gi;

  const citations: Array<{
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI' | 'CZSUP';
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
    
    let type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI' | 'CZSUP';
    if (match[1]) type = 'CZNUM';
    else if (match[2] || match[3]) type = 'CZFIG';
    else if (match[4]) type = 'CZNAR';
    else if (match[7]) type = 'CZPAR';
    else if (match[9]) type = 'CZURL';
    else if (match[10]) type = 'CZDOI';
    else if (match[11]) type = 'CZSUP';
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
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZHTML' | 'CZURL' | 'CZDOI' | 'CZSUP';
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
    } else if (m.type === 'CZSUP') {
      sups.push({ match: taggedMatchText, key: m.data[11] });
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

  const placeholderSplitRegex = /(\[\[(?:CZNUM|CZFIG|CZNAR|CZPAR|CZHTML|CZURL|CZDOI|CZSUP)_\d+\]\])/g;
  const parts = translated.split(placeholderSplitRegex);
  const resultNodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const placeholderMatch = part.match(/^\[\[(CZNUM|CZFIG|CZNAR|CZPAR|CZHTML|CZURL|CZDOI|CZSUP)_(\d+)\]\]$/);
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
      } else if (type === 'CZSUP') {
        const data = sups[idx];
        if (data) {
          const keys = parseCitationKeys(data.key);
          resultNodes.push(
            <sup key={`placeholder-sup-${i}`} className="select-none text-zinc-500 dark:text-zinc-400 font-sans">
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
            </sup>
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
            const itemMatch = itemObj.text.match(/\b([A-Z][a-zA-Z\u00C0-\u017F-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?(?:,\s*|，\s*)(\d{4})([a-z])?/i);
            
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
