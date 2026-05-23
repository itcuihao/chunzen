import { FunctionComponent, useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { Languages, FileCheck, RefreshCw, Compass } from 'lucide-react';
import { postMessage } from '../vscode';

// ── Paragraph role classification ──

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

// ── Component ──

export const TranslationTab: FunctionComponent = () => {
  const loading = useStore((state) => state.isTranslating);
  const error = useStore((state) => state.translationError);
  const currentPageText = useStore((state) => state.currentPageText);
  const activeParagraphId = useStore((state) => state.activeParagraphId);

  const layoutMode = useStore((state) => state.layoutMode);
  const setLayoutMode = useStore((state) => state.setLayoutMode);
  const hoverHighlightStyle = useStore((state) => state.layoutConfig?.hoverHighlightStyle ?? 'overlay');

  // Auto-translate on page turn if remembered mode is translation or bilingual
  useEffect(() => {
    if (!currentPageText) return;
    const hasTrans = !!(currentPageText.translations && Object.keys(currentPageText.translations).length > 0);
    if ((layoutMode === 'translation' || layoutMode === 'bilingual') && !hasTrans && !loading) {
      handleTranslatePage();
    }
  }, [currentPageText?.pageNumber, layoutMode]);

  const hasTranslations = !!(currentPageText?.translations && Object.keys(currentPageText.translations).length > 0);

  const annotatedParagraphs: AnnotatedPara[] = useMemo(() => {
    if (!currentPageText?.paragraphs) return [];
    const roles = classifyParagraphs(currentPageText.paragraphs);
    return currentPageText.paragraphs.map((p, i) => ({
      ...p,
      role: roles[i],
    }));
  }, [currentPageText?.paragraphs]);

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
          {sent.text}{' '}
        </span>
      ));
    }
    return para.text;
  };

  const renderChineseParagraph = (
    para: AnnotatedPara,
    translation: string
  ) => {
    if (!translation) return '';
    const aligned = alignSentences(para.sentences, translation);
    if (aligned.length > 0) {
      return aligned.map((sent) => (
        <span
          key={sent.id || para.id}
          data-sentence-id={sent.id || undefined}
          className="translation-tab-sentence"
        >
          {sent.text}
        </span>
      ));
    }
    return translation;
  };

  const handleTranslatePage = () => {
    if (!currentPageText) return;
    useStore.setState({ isTranslating: true });
    const translatableParagraphs = currentPageText.paragraphs
      .filter(para => !para.skipped && para.lineMarker !== 'horizontal-rule' && !!para.text.trim())
      .map(para => ({ id: para.id, text: para.text }));
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
    if (cells.length <= 1) {
      return (
        <p key={id} className={className}>
          {text}
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
            {cell}
          </span>
        ))}
      </div>
    );
  };

  const wrapHoverableParagraph = (para: AnnotatedPara, child: JSX.Element) => (
    <div
      key={para.id}
      data-paragraph-id={para.id}
      onMouseEnter={() => handleParagraphHover(para.id)}
      onMouseLeave={() => handleParagraphHover(null)}
      className={`translation-tab-paragraph ${activeParagraphId === para.id ? 'active' : ''}`}
    >
      {child}
    </div>
  );

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
    return wrapHoverableParagraph(para, <p className={className}>{para.text}</p>);
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
        <button
          onClick={handleRefreshText}
          title="重新提取当前页原文"
          className="p-1.5 rounded-lg border border-border/40 bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* The Academic PDF Paper Sheet */}
      <article className={`relative bg-editor-bg border border-border/80 shadow-md rounded-md p-6 min-h-[300px] flex flex-col justify-between transition-all duration-300 ${
        hoverHighlightStyle === 'bar' ? 'hover-highlight-bar' : 'hover-highlight-overlay'
      }`}>

        {/* Page Header */}
        <div className="flex justify-between items-center border-b border-border/40 pb-2 mb-4">
          <span className="text-[8px] font-mono tracking-widest text-secondary-foreground/60 uppercase">
            {layoutMode === 'original' && 'CHUNZEN ACADEMIC READER // ORIGINAL VIEW'}
            {layoutMode === 'translation' && 'CHUNZEN ACADEMIC READER // TRANSLATED VIEW'}
            {layoutMode === 'bilingual' && 'CHUNZEN ACADEMIC READER // BILINGUAL VIEW'}
            {currentPageText && ` (PAGE ${currentPageText.pageNumber})`}
          </span>
          {hasTranslations && layoutMode !== 'original' && (
            <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded">
              TRANSLATED
            </span>
          )}
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
            ) : !hasTranslations ? (
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
      </article>
    </div>
  );
};
