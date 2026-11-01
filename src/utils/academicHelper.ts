/**
 * Academic Literature Format Helper
 * Provides unified helper functions for matching, normalising, and parsing academic citations,
 * such as superscript citations (both unicode and HTML <sup> tags).
 */

// Mapping of unicode superscript characters to standard ASCII equivalents
const FROM_UNICODE_SUP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
  '–': '-',
  '—': '-',
};

// Mapping of standard ASCII equivalents to unicode superscript characters
const TO_UNICODE_SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};

/**
 * Normalizes superscript unicode characters in a string to standard digits/operators.
 */
export function normalizeSuperscript(text: string): string {
  return text.split('').map(char => FROM_UNICODE_SUP[char] || char).join('');
}

/**
 * Converts standard digits and hyphens in a string to unicode superscripts.
 */
export function toSuperscript(text: string): string {
  return text.split('').map(char => TO_UNICODE_SUP[char] || char).join('');
}

/**
 * Checks if a string consists entirely of superscript digits, commas, hyphens and spaces.
 */
export function isSuperscriptCitation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^[⁰¹²³⁴⁵⁶⁷⁸⁹\s,⁻–—]+$/.test(trimmed);
}

/**
 * Checks if the content of a <sup> tag represents a citation (digits, commas, hyphens).
 */
export function isSuperscriptTagCitation(content: string): boolean {
  const normalized = normalizeSuperscript(content.trim());
  return /^\d+(?:\s*[-–—,]\s*\d+)*$/.test(normalized);
}

/**
 * Converts HTML <sup> tag citations in text to unicode superscript citations.
 * E.g., "word<sup>1,2</sup>" -> "word¹,²"
 * E.g., "word<sup>3-5</sup>" -> "word³⁻⁵"
 */
export function convertSupTagsToUnicode(text: string): string {
  if (!text) return '';
  return text.replace(/<sup>([\s\S]*?)<\/sup>/gi, (match, content) => {
    if (isSuperscriptTagCitation(content)) {
      return toSuperscript(normalizeSuperscript(content));
    }
    return match;
  });
}

/**
 * Parses a citation string (e.g. "1-3", "1,2", "¹⁻³") into an array of individual citation keys.
 */
export function parseCitationKeys(citationStr: string): string[] {
  const normalized = normalizeSuperscript(citationStr.trim());
  const keys: string[] = [];
  const parts = normalized.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-') || trimmed.includes('–') || trimmed.includes('—')) {
      const hyphen = trimmed.includes('-') ? '-' : (trimmed.includes('–') ? '–' : '—');
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

  return keys;
}

export interface AuthorYearCitation {
  author: string;
  year: string;
  key: string;
  rawText: string;
}

/**
 * Parses author-year citation strings, including multiple years or suffix letters.
 * E.g., "Smith et al., 2020, 2021" -> key: "smith-2020", "smith-2021"
 * E.g., "Smith, 2020a, b" -> key: "smith-2020a", "smith-2020b"
 */
export function parseAuthorYearCitations(text: string): AuthorYearCitation[] {
  const result: AuthorYearCitation[] = [];
  const authorMatch = text.match(/\b([A-Z][a-zA-Z\u00C0-\u017F-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F-]+)?(?:,\s*|，\s*)/i);
  if (!authorMatch) return result;

  const author = authorMatch[1].toLowerCase();
  const rest = text.slice((authorMatch.index ?? 0) + authorMatch[0].length);

  const yearRegex = /\b(18\d{2}|19\d{2}|20\d{2})([a-z])?\b/gi;
  let m: RegExpExecArray | null;
  let lastYear = '';

  while ((m = yearRegex.exec(rest)) !== null) {
    const yearBase = m[1];
    const suffix = m[2] || '';
    lastYear = yearBase;
    const year = `${yearBase}${suffix}`.toLowerCase();
    result.push({
      author,
      year,
      key: `${author}-${year}`,
      rawText: m[0]
    });
  }

  if (lastYear) {
    const shortSuffixRegex = /(?:,\s*|\s+)([a-z])\b/gi;
    let sm: RegExpExecArray | null;
    while ((sm = shortSuffixRegex.exec(rest)) !== null) {
      const suffix = sm[1].toLowerCase();
      if (suffix.length === 1 && !result.some(r => r.year === `${lastYear}${suffix}`)) {
        result.push({
          author,
          year: `${lastYear}${suffix}`,
          key: `${author}-${lastYear}${suffix}`,
          rawText: sm[1]
        });
      }
    }
  }

  return result;
}
