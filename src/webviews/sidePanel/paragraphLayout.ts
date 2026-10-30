// Paragraph model, role styles and block grouping for the translation tab (pure; unit-tested in tests/paragraphLayout.test.ts)

import type { ParagraphRole } from './textProcessing';

export interface AnnotatedPara {
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

// ── Role-based style maps ──

export const EN_STYLES: Record<ParagraphRole, string> = {
  title: 'font-serif text-[16px] font-bold text-center leading-[1.4] tracking-wide',
  heading: 'font-serif text-[12px] font-bold leading-[1.5]',
  body: 'font-serif text-[11px] leading-[1.65] text-justify',
  small: 'font-serif text-[9.5px] leading-[1.5] text-secondary-foreground/80',
};

export const ZH_STYLES: Record<ParagraphRole, string> = {
  title: 'font-zhSerif text-[18px] font-bold text-center leading-[1.6] tracking-wider',
  heading: 'font-zhSerif text-[15px] font-bold leading-[1.7]',
  body: 'font-zhSerif text-[14px] font-medium leading-[2.0] tracking-wide text-justify',
  small: 'font-zhSerif text-[12px] leading-[1.7]',
};

export const BI_EN_STYLES: Record<ParagraphRole, string> = {
  title: 'font-serif text-[13px] font-bold text-center leading-[1.4] italic',
  heading: 'font-serif text-[11px] font-bold leading-[1.4] italic',
  body: 'font-serif text-[11px] leading-[1.5] italic text-secondary-foreground',
  small: 'font-serif text-[9.5px] leading-[1.4] italic text-secondary-foreground/60',
};

export const BI_ZH_STYLES: Record<ParagraphRole, string> = {
  title: 'font-zhSerif text-[16px] font-bold text-center leading-[1.6] tracking-wide',
  heading: 'font-zhSerif text-[14px] font-bold leading-[1.8] tracking-wide',
  body: 'font-zhSerif text-[14px] leading-[2.0] font-medium tracking-wide text-foreground',
  small: 'font-zhSerif text-[12px] leading-[1.7] text-secondary-foreground',
};

export const PARA_SPACING: Record<ParagraphRole, string> = {
  title: 'mb-5',
  heading: 'mb-3 mt-4 para-heading',
  body: 'mb-3',
  small: 'mb-2',
};

export const ZH_INDENT: Record<ParagraphRole, string> = {
  title: '',
  heading: '',
  body: 'indent-8',
  small: '',
};

export const EN_INDENT: Record<ParagraphRole, string> = {
  title: '',
  heading: '',
  body: 'indent-4',
  small: '',
};

export function isHeadingContinuation(prev: AnnotatedPara | undefined, cur: AnnotatedPara): boolean {
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

export function isCollapsibleNoiseSkip(para: AnnotatedPara | undefined): boolean {
  if (!para?.skipped) return false;
  const reason = (para.skipReason || '').toLowerCase();
  if (!reason) return false;
  return reason.includes('watermark')
    || reason.includes('http')
    || reason.includes('repeated-noise')
    || reason.includes('table-image');
}

export function previousSemanticParagraph(paragraphs: AnnotatedPara[], index: number): AnnotatedPara | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const prev = paragraphs[i];
    if (prev.lineMarker === 'horizontal-rule') return undefined;
    if (isCollapsibleNoiseSkip(prev)) continue;
    return prev;
  }
  return undefined;
}

// ── Layout block helpers ──

export interface LayoutBlock {
  type: 'single' | 'columns';
  paragraphs: AnnotatedPara[];
}

export function getParagraphColumnIndex(para: AnnotatedPara, columnsCount: number): number {
  if (para.columnIndex !== undefined && para.columnIndex >= 0) {
    return Math.min(para.columnIndex, Math.max(columnsCount - 1, 0));
  }
  if (para.section === 'left') return 0;
  if (para.section === 'right') return Math.min(1, Math.max(columnsCount - 1, 0));
  return -1;
}

export function groupParagraphsIntoBlocks(paragraphs: AnnotatedPara[], columnsCount: number): LayoutBlock[] {
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
