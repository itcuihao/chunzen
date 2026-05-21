// Text layer: extracts text items, groups into lines/sentences, renders span overlay

import { TextItem, PdfViewport } from './pdfRenderer';

declare const pdfjsLib: {
  Util: { transform(transform: number[], viewportTransform: number[]): number[] };
};

export interface TextSpan {
  element: HTMLSpanElement;
  sentenceId: string;
}

export interface Sentence {
  id: string;
  text: string;
  spans: HTMLSpanElement[];
}

interface LayoutItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildTextLayer(
  container: HTMLElement,
  items: TextItem[],
  viewport: PdfViewport
): { sentences: Map<string, Sentence>; spanToSentence: Map<HTMLSpanElement, string> } {
  container.innerHTML = '';

  const sentences = new Map<string, Sentence>();
  const spanToSentence = new Map<HTMLSpanElement, string>();

  // 1. Transform items to layout coordinates
  const layoutItems = items
    .map(item => {
      const tx = pdfjsLib.Util.transform(viewport as unknown as number[], item.transform);
      return {
        str: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width * viewport.scale,
        height: item.height * viewport.scale
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // 2. Group by lines (Y coordinate within threshold)
  const lines = groupIntoLines(layoutItems);

  // 3. Split into sentences
  const allSentences = linesToSentences(lines);

  // 4. Create span elements
  let sentenceId = 0;
  for (const sent of allSentences) {
    if (!sent.text || sent.text.length < 3) continue;
    const sid = String(sentenceId++);
    const spans: HTMLSpanElement[] = [];

    for (const item of sent.items) {
      const span = createSpan(item, sid);
      container.appendChild(span);
      spans.push(span);
      spanToSentence.set(span, sid);
    }

    sentences.set(sid, { id: sid, text: sent.text, spans });
  }

  return { sentences, spanToSentence };
}

function groupIntoLines(items: LayoutItem[]): LayoutItem[][] {
  const lines: LayoutItem[][] = [];
  let currentLine: LayoutItem[] = [];
  let currentY: number | null = null;
  const LINE_THRESHOLD = 5;

  for (const item of items) {
    if (currentY === null || Math.abs(item.y - currentY) <= LINE_THRESHOLD) {
      currentLine.push(item);
      currentY = currentY === null ? item.y : (currentY + item.y) / 2;
    } else {
      if (currentLine.length) lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length) lines.push(currentLine);
  return lines;
}

interface SentenceItem { text: string; items: LayoutItem[] }

function linesToSentences(lines: LayoutItem[][]): SentenceItem[] {
  const result: SentenceItem[] = [];
  let paraBuffer = '';
  let paraItems: LayoutItem[] = [];

  function flushParagraph() {
    if (!paraBuffer.trim()) { paraBuffer = ''; paraItems = []; return; }
    const segs = splitIntoSentences(paraBuffer);
    let pos = 0;
    for (const seg of segs) {
      const start = pos;
      const end = pos + seg.length;
      const count = paraItems.length;
      const sliceStart = Math.floor((start / paraBuffer.length) * count);
      const sliceEnd = Math.max(sliceStart + 1, Math.ceil((end / paraBuffer.length) * count));
      result.push({ text: seg.trim(), items: paraItems.slice(sliceStart, sliceEnd) });
      pos = end;
    }
    paraBuffer = '';
    paraItems = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.map(it => it.str).join(' ');
    const nextLine = lines[i + 1];
    paraBuffer += (paraBuffer ? ' ' : '') + lineText;
    paraItems.push(...line);

    const lineHeight = line[0]?.height || 12;
    const nextY = nextLine?.[0]?.y;
    const thisY = line[0]?.y;
    if (!nextLine || (nextY - thisY > lineHeight * 1.8)) {
      flushParagraph();
    }
  }
  flushParagraph();

  return result;
}

function splitIntoSentences(text: string): string[] {
  const results: string[] = [];
  const regex = /[^.!?]*[.!?]+(?:\s|$)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    results.push(match[0]);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    results.push(text.slice(lastIndex));
  }
  return results.filter(s => s.trim().length > 2);
}

function createSpan(item: LayoutItem, sentenceId: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = item.str;
  span.dataset.sentenceId = sentenceId;
  span.style.left = item.x + 'px';
  span.style.top = item.y + 'px';
  span.style.fontSize = item.height + 'px';
  return span;
}