// Pure text rules for the PDF text layer (no DOM / pdf.js dependency, unit-tested in tests/textRules.test.ts)

const CIRCLED_NUM_MAP: Record<string, string> = {
  '①': '(1)', '②': '(2)', '③': '(3)', '④': '(4)', '⑤': '(5)',
  '⑥': '(6)', '⑦': '(7)', '⑧': '(8)', '⑨': '(9)', '⑩': '(10)',
  '⑪': '(11)', '⑫': '(12)', '⑬': '(13)', '⑭': '(14)', '⑮': '(15)',
  '⑯': '(16)', '⑰': '(17)', '⑱': '(18)', '⑲': '(19)', '⑳': '(20)',
  '⑴': '(1)', '⑵': '(2)', '⑶': '(3)', '⑷': '(4)', '⑸': '(5)',
  '⑹': '(6)', '⑺': '(7)', '⑻': '(8)', '⑼': '(9)', '⑽': '(10)',
  '⑾': '(11)', '⑿': '(12)', '⒀': '(13)', '⒁': '(14)', '⒂': '(15)',
  '⒃': '(16)', '⒄': '(17)', '⒅': '(18)', '⒆': '(19)', '⒇': '(20)',
  '⒈': '1.', '⒉': '2.', '⒊': '3.', '⒋': '4.', '⒌': '5.',
  '⒍': '6.', '⒎': '7.', '⒏': '8.', '⒐': '9.', '⒑': '10.',
  '⒒': '11.', '⒓': '12.', '⒔': '13.', '⒕': '14.', '⒖': '15.',
  '⒗': '16.', '⒘': '17.', '⒙': '18.', '⒚': '19.', '⒛': '20.',
  '❶': '(1)', '❷': '(2)', '❸': '(3)', '❹': '(4)', '❺': '(5)',
  '❻': '(6)', '❼': '(7)', '❽': '(8)', '❾': '(9)', '❿': '(10)',
  '➀': '(1)', '➁': '(2)', '➂': '(3)', '➃': '(4)', '➄': '(5)',
  '➅': '(6)', '➆': '(7)', '➇': '(8)', '➈': '(9)', '➉': '(10)',
  '➊': '(1)', '➋': '(2)', '➌': '(3)', '➍': '(4)', '➎': '(5)',
  '➏': '(6)', '➐': '(7)', '➑': '(8)', '➒': '(9)', '➓': '(10)',
  '⓵': '(1)', '⓶': '(2)', '⓷': '(3)', '⓸': '(4)', '⓹': '(5)',
  '⓺': '(6)', '⓻': '(7)', '⓼': '(8)', '⓽': '(9)', '⓾': '(10)',
  '㉑': '(21)', '㉒': '(22)', '㉓': '(23)', '㉔': '(24)', '㉕': '(25)',
  '㉖': '(26)', '㉗': '(27)', '㉘': '(28)', '㉙': '(29)', '㉚': '(30)',
  '㉛': '(31)', '㉜': '(32)', '㉝': '(33)', '㉞': '(34)', '㉟': '(35)',
  '㊱': '(36)', '㊲': '(37)', '㊳': '(38)', '㊴': '(39)', '㊵': '(40)',
};

const ROMAN_NUM_MAP: Record<string, string> = {
  'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V',
  'Ⅵ': 'VI', 'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X',
  'Ⅺ': 'XI', 'Ⅻ': 'XII', 'Ⅼ': 'L', 'Ⅽ': 'C', 'Ⅾ': 'D', 'Ⅿ': 'M',
  'ⅰ': 'i', 'ⅱ': 'ii', 'ⅲ': 'iii', 'ⅳ': 'iv', 'ⅴ': 'v',
  'ⅵ': 'vi', 'ⅶ': 'vii', 'ⅷ': 'viii', 'ⅸ': 'ix', 'ⅹ': 'x',
  'ⅺ': 'xi', 'ⅻ': 'xii', 'ⅼ': 'l', 'ⅽ': 'c', 'ⅾ': 'd', 'ⅿ': 'm',
};

const BULLET_MAP: Record<string, string> = {
  '\uf0b7': '•',
  '\uf02d': '•',
  '\u2219': '•',
  '\u25cf': '•',
  '\u25e6': '•',
  '\u25aa': '•',
  '\u25a0': '•',
  '\u25cb': '•',
  '\u25a1': '•',
  '\u25c6': '•',
  '\u25c7': '•',
  '\u27a4': '•',
  '\u2023': '•',
  '\u2043': '•',
};

const CIRCLED_NUM_REGEX = new RegExp('[' + Object.keys(CIRCLED_NUM_MAP).join('') + ']', 'g');
const BULLET_REGEX = new RegExp('[' + Object.keys(BULLET_MAP).join('') + ']', 'g');

export function normalizeText(str: string): string {
  if (!str) return '';
  str = str.replace(/[\uFF10-\uFF19]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
  str = str.replace(/[\u2160-\u217F]/g, (m) => ROMAN_NUM_MAP[m] || m);
  str = str.replace(CIRCLED_NUM_REGEX, (m) => CIRCLED_NUM_MAP[m] || m);
  // Normalize circled/parenthesized letters:
  // Circled Capital Letters U+24B6 - U+24CF (Ⓐ - Ⓩ) -> (A) - (Z)
  str = str.replace(/[\u24B6-\u24CF]/g, (m) => `(${String.fromCharCode(m.charCodeAt(0) - 0x24B6 + 65)})`);
  // Circled Small Letters U+24D0 - U+24E9 (ⓐ - ⓩ) -> (a) - (z)
  str = str.replace(/[\u24D0-\u24E9]/g, (m) => `(${String.fromCharCode(m.charCodeAt(0) - 0x24D0 + 97)})`);
  // Parenthesized Small Letters U+249C - U+24B5 (⒜ - ⒵) -> (a) - (z)
  str = str.replace(/[\u249C-\u24B5]/g, (m) => `(${String.fromCharCode(m.charCodeAt(0) - 0x249C + 97)})`);
  str = str.replace(BULLET_REGEX, (m) => BULLET_MAP[m] || m);
  str = str.replace(/^(\s*)[·⋅](\s+)/, '$1•$2');
  return str;
}

export function splitIntoSentences(text: string): string[] {
  const DOT_PLACEHOLDER = '__DOT_ABBR__';
  const protectedText = text
    // Common academic abbreviations that should not terminate a sentence.
    .replace(/\bet al\./gi, (m) => m.replace('.', DOT_PLACEHOLDER))
    .replace(/\b(fig|figs|eq|eqs|ref|refs|no|nos|dr|mr|mrs|ms|prof|inc|vs)\./gi, (m) => m.replace('.', DOT_PLACEHOLDER))
    // Single-letter initials (e.g. "S.-S. Wang", "A. B. Smith")
    .replace(/\b([A-Z])\./g, `$1${DOT_PLACEHOLDER}`);

  const results: string[] = [];
  // 英文句末标点需后跟空白/结尾（避免切开 3.14、e.g. 等）；中文标点后通常无空格，直接断句
  const re = /[^.!?。！？]*(?:[.!?]+(?:\s|$)|[。！？]+\s*)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(protectedText)) !== null) {
    results.push(m[0]);
    last = re.lastIndex;
  }
  if (last < protectedText.length) results.push(protectedText.slice(last));
  return results
    .map(s => s.replaceAll(DOT_PLACEHOLDER, '.'))
    .filter(s => s.trim().length > 2);
}

export function isMathArtifact(str: string): boolean {
  // LaTeX commands
  if (/^\\[a-zA-Z]+/.test(str)) return true;

  // Pure math symbols (single char)
  if (str.length === 1 && /[∫∑∏∞∂√∇×±≤≥→←↑↓↔⇒⇐⇔ℕℝℂℤ]/.test(str)) return true;

  // Filter only if it has no alphanumeric characters and length > 1 (e.g. operators like "+-", "<=")
  if (str.length > 1 && !/[a-zA-Z0-9]/.test(str)) return true;

  return false;
}

export function isReferenceStart(str: string, inReferencesSection: boolean = false, isHanging?: boolean): boolean {
  const text = str.replace(/<[^>]+>/g, '').trim();
  if (/^\[\d{1,4}\]/.test(text)) return true;
  if (/^\[\d{1,4}[,;]/.test(text)) return true;
  
  const dotNumMatch = text.match(/^(\d{1,4})\.\s/);
  if (dotNumMatch) {
    const num = parseInt(dotNumMatch[1], 10);
    const isYear = num >= 1800 && num <= 2100;
    if (!isYear) {
      if (inReferencesSection || text.length > 10) return true;
    }
  }

  // Standalone dot-numbers like "17." (which may be a separate segment)
  const standaloneDotNumMatch = text.match(/^(\d{1,4})\.$/);
  if (standaloneDotNumMatch) {
    const num = parseInt(standaloneDotNumMatch[1], 10);
    const isYear = num >= 1800 && num <= 2100;
    if (!isYear) return true;
  }

  // Standalone bracketed numbers like "[17]"
  if (/^\[\d{1,4}\]$/.test(text)) return true;
  
  // Naked numbers in references section
  if (inReferencesSection) {
    const nakedMatch = text.match(/^(\d{1,4})(?:\s+(.*))?$/);
    if (nakedMatch) {
      const num = parseInt(nakedMatch[1], 10);
      const isYear = num >= 1800 && num <= 2100;
      if (!isYear) return true;
    }
  }

  // Author-date style check
  const hasAuthorPattern = /^[A-Z][a-zA-Z\u00C0-\u017F\-]+,?\s+[A-Z]\b/.test(text);
  if (hasAuthorPattern) {
    if (inReferencesSection) {
      if (isHanging === true) {
        return true;
      } else if (isHanging === false) {
        return false;
      } else {
        return /\b(19|20)\d{2}\b/.test(text);
      }
    } else {
      return /\b(19|20)\d{2}\b/.test(text);
    }
  }

  return false;
}
