// Pure text processing for the translation tab (no React / DOM dependency; unit-tested in tests/textProcessing.test.ts)

import { convertSupTagsToUnicode } from '../../utils/academicHelper';

export type ParagraphRole = 'title' | 'heading' | 'body' | 'small';

const HEADING_RE = /^(?:abstract|introduction|background|methods|materials?\s+and\s+methods?|methodology|results|discussion|conclusion|conclusions|references|acknowledgments?|summary|keywords?|key\s+words|related\s+work|literature\s+review|objectives?|purpose|aims?|scope|table\s+of\s+contents|appendix|supplementary|figure\s+\d|table\s+\d|fig\.\s+\d)/i;

export function protectMathAndCitations(text: string): {
  protectedText: string;
  maths: string[];
  citations: string[];
} {
  const maths: string[] = [];
  const citations: string[] = [];
  
  let protectedText = convertSupTagsToUnicode(text);

  protectedText = protectedText.replace(/\$\$(.+?)\$\$/gs, (match) => {
    maths.push(match);
    return `[[CZDISPLAYMATH_${maths.length - 1}]]`;
  });

  protectedText = protectedText.replace(/\$([^$\n]+?)\$/g, (match) => {
    maths.push(match);
    return `[[CZINLINEMATH_${maths.length - 1}]]`;
  });

  // 1. Bracket citations: [1], [1-3]
  protectedText = protectedText.replace(/\[\d+(?:\s*[-–,]\s*\d+)*\]/g, (match) => {
    citations.push(match);
    return `[[CZCITATION_${citations.length - 1}]]`;
  });

  // 2. Superscript citations: ¹, ¹⁻³
  protectedText = protectedText.replace(/(?<!\d)([⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:\s*[,⁻–-]\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+)*)(?!\d)/g, (match) => {
    citations.push(match);
    return `[[CZCITATION_${citations.length - 1}]]`;
  });

  return { protectedText, maths, citations };
}

export function restoreMathAndCitations(
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

export function restoreMathAndCitationsFallback(
  translatedText: string,
  originalText: string
): string {
  const { maths, citations } = protectMathAndCitations(originalText);
  return restoreMathAndCitations(translatedText, maths, citations);
}


export function mapHtmlToPlain(html: string): { plainText: string; mapIdx: number[] } {
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


export function mergeSplitDoi(text: string): string {
  const splitDoiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]*)\s+([-._;()/:A-Z0-9]+)/gi;
  let prevText = text;
  while (true) {
    const nextText = prevText.replace(splitDoiRegex, (match, g1, g2) => {
      const endsWithConnector = /[/.\-_]$/.test(g1);
      const startsWithConnector = /^[/.\-_]/.test(g2);
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

export function mergeSplitUrl(text: string): string {
  const splitUrlRegex = /\b(https?:\/\/[^\s()<>]+)\s+([^\s()<>]+)/gi;
  let prevText = text;
  while (true) {
    const nextText = prevText.replace(splitUrlRegex, (match, g1, g2) => {
      const endsWithConnector = /[/.\-_=?&]$/.test(g1);
      const startsWithConnector = /^[/.\-_=?&]/.test(g2);
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

export function preprocessLinks(text: string): string {
  if (!text) return '';
  return mergeSplitUrl(mergeSplitDoi(text));
}


export function protectTextWithPlaceholders(text: string): string {
  if (!text) return '';

  const preprocessed = convertSupTagsToUnicode(preprocessLinks(text));
  const { plainText, mapIdx } = mapHtmlToPlain(preprocessed);

  // Appended Group 11 for unicode superscript citations
  const unionRegexWithoutHtml = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|\b([A-Z][a-zA-Z\u00C0-\u017F-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?,\s*\d{4}[a-z]?(?:\s*;|，|;|,)?\s*)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b|(?<!\d)([⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:\s*[,⁻–-]\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+)*)(?!\d)/gi;

  const citations: Array<{
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI' | 'CZSUP';
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
    
    let type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZURL' | 'CZDOI' | 'CZSUP';
    if (match[1]) type = 'CZNUM';
    else if (match[2] || match[3]) type = 'CZFIG';
    else if (match[4]) type = 'CZNAR';
    else if (match[7]) type = 'CZPAR';
    else if (match[9]) type = 'CZURL';
    else if (match[10]) type = 'CZDOI';
    else if (match[11]) type = 'CZSUP';
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
    type: 'CZNUM' | 'CZFIG' | 'CZNAR' | 'CZPAR' | 'CZHTML' | 'CZURL' | 'CZDOI' | 'CZSUP';
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
  let supIndex = 0;

  for (const m of allMatches) {
    result += preprocessed.substring(lastIdx, m.taggedStart);
    if (m.type === 'CZNUM') {
      result += `[[CZNUM_${refIndex++}]]`;
    } else if (m.type === 'CZSUP') {
      result += `[[CZSUP_${supIndex++}]]`;
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


export function splitTableCells(text: string): string[] {
  const normalized = text.replace(/\u00a0/g, ' ').trim();
  if (!normalized) return [];

  const tabCells = normalized.split('\t').map(cell => cell.trim()).filter(Boolean);
  if (tabCells.length > 1) return tabCells;

  const multiSpaceCells = normalized.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
  if (multiSpaceCells.length > 1) return multiSpaceCells;

  return [normalized];
}

export function classifyParagraphs(
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
