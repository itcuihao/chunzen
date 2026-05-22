import { FunctionComponent, useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { Languages, FileCheck, RefreshCw } from 'lucide-react';
import { postMessage } from '../vscode';

// ── Paragraph role classification ──

type ParagraphRole = 'title' | 'heading' | 'body' | 'small';

const HEADING_RE = /^(?:abstract|introduction|background|methods|materials?\s+and\s+methods?|methodology|results|discussion|conclusion|conclusions|references|acknowledgments?|summary|keywords?|key\s+words|related\s+work|literature\s+review|objectives?|purpose|aims?|scope|table\s+of\s+contents|appendix|supplementary|figure\s+\d|table\s+\d|fig\.\s+\d)/i;

interface AnnotatedPara {
  id: string;
  text: string;
  section?: 'header' | 'left' | 'right' | 'footer' | 'full';
  sentences?: Array<{ id: string; text: string }>;
  fontSize?: number;
  bold?: boolean;
  blockType?: string;
  role: ParagraphRole;
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

// ── Layout block helpers ──

interface LayoutBlock {
  type: 'single' | 'double';
  paragraphs: AnnotatedPara[];
}

function groupParagraphsIntoBlocks(paragraphs: AnnotatedPara[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  for (const para of paragraphs) {
    const type = (para.section === 'left' || para.section === 'right') ? 'double' : 'single';
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
  const activeSentenceId = useStore((state) => state.activeSentenceId);

  const [layoutMode, setLayoutMode] = useState<'translation' | 'bilingual' | 'original'>('original');

  const hasTranslations = !!(currentPageText?.translations && Object.keys(currentPageText.translations).length > 0);

  const annotatedParagraphs: AnnotatedPara[] = useMemo(() => {
    if (!currentPageText?.paragraphs) return [];
    const roles = classifyParagraphs(currentPageText.paragraphs);
    return currentPageText.paragraphs.map((p, i) => ({
      ...p,
      role: roles[i],
    }));
  }, [currentPageText?.paragraphs]);

  // Scroll active sentence into view
  useEffect(() => {
    if (activeSentenceId) {
      const elements = document.querySelectorAll(`span[data-sentence-id="${activeSentenceId}"]`);
      if (elements.length > 0) {
        elements[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeSentenceId]);

  const handleSentenceHover = (id: string | null) => {
    useStore.setState({ activeSentenceId: id });
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
          onMouseEnter={() => handleSentenceHover(sent.id)}
          onMouseLeave={() => handleSentenceHover(null)}
          className={`translation-tab-sentence ${
            activeSentenceId === sent.id ? 'active' : ''
          }`}
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
          onMouseEnter={() => sent.id ? handleSentenceHover(sent.id) : undefined}
          onMouseLeave={() => sent.id ? handleSentenceHover(null) : undefined}
          className={`translation-tab-sentence ${
            sent.id && activeSentenceId === sent.id ? 'active' : ''
          }`}
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
    postMessage({
      type: 'translate-page',
      pageNumber: currentPageText.pageNumber,
      paragraphs: currentPageText.paragraphs
    });
  };

  const handleRefreshText = () => {
    postMessage({
      type: 'refresh-page-text'
    });
  };

  const paraClass = (para: AnnotatedPara, mode: 'en' | 'zh' | 'bi-en' | 'bi-zh'): string => {
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
    return `${styles[role]} ${indent} ${boldClass} ${PARA_SPACING[role]}`;
  };

  // ── Render helpers for each mode ──

  const renderOriginalBlockLayout = () => {
    const hasSections = annotatedParagraphs.some(p => p.section !== undefined);
    if (currentPageText!.columnsCount > 1 && hasSections) {
      const blocks = groupParagraphsIntoBlocks(annotatedParagraphs);
      return (
        <div className="select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300 flex flex-col gap-3">
          {blocks.map((block, idx) => {
            if (block.type === 'single') {
              return (
                <div key={idx} className="w-full">
                  {block.paragraphs.map(para => (
                    <p key={para.id} className={paraClass(para, 'en')}>
                      {renderEnglishParagraph(para)}
                    </p>
                  ))}
                </div>
              );
            } else {
              const leftParas = block.paragraphs.filter(p => p.section === 'left');
              const rightParas = block.paragraphs.filter(p => p.section === 'right');
              return (
                <div key={idx} className="grid grid-cols-2 gap-5 w-full">
                  <div className="flex flex-col">
                    {leftParas.map(para => (
                      <p key={para.id} className={paraClass(para, 'en')}>
                        {renderEnglishParagraph(para)}
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-col border-l border-dashed border-border/40 pl-5">
                    {rightParas.map(para => (
                      <p key={para.id} className={paraClass(para, 'en')}>
                        {renderEnglishParagraph(para)}
                      </p>
                    ))}
                  </div>
                </div>
              );
            }
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
        {annotatedParagraphs.map((para) => (
          <p key={para.id} className={paraClass(para, 'en')}>
            {renderEnglishParagraph(para)}
          </p>
        ))}
      </div>
    );
  };

  const renderTranslationBlockLayout = () => {
    const hasSections = annotatedParagraphs.some(p => p.section !== undefined);
    if (currentPageText!.columnsCount > 1 && hasSections) {
      const blocks = groupParagraphsIntoBlocks(annotatedParagraphs);
      return (
        <div className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300 flex flex-col gap-4">
          {blocks.map((block, idx) => {
            if (block.type === 'single') {
              return (
                <div key={idx} className="w-full">
                  {block.paragraphs.map(para => (
                    <p key={para.id} className={paraClass(para, 'zh')}>
                      {renderChineseParagraph(para, currentPageText!.translations?.[para.id] || '')}
                    </p>
                  ))}
                </div>
              );
            } else {
              const leftParas = block.paragraphs.filter(p => p.section === 'left');
              const rightParas = block.paragraphs.filter(p => p.section === 'right');
              return (
                <div key={idx} className="grid grid-cols-2 gap-5 w-full">
                  <div className="flex flex-col">
                    {leftParas.map(para => (
                      <p key={para.id} className={paraClass(para, 'zh')}>
                        {renderChineseParagraph(para, currentPageText!.translations?.[para.id] || '')}
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-col border-l border-dashed border-border/40 pl-5">
                    {rightParas.map(para => (
                      <p key={para.id} className={paraClass(para, 'zh')}>
                        {renderChineseParagraph(para, currentPageText!.translations?.[para.id] || '')}
                      </p>
                    ))}
                  </div>
                </div>
              );
            }
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
        {annotatedParagraphs.map((para) => (
          <p key={para.id} className={paraClass(para, 'zh')}>
            {renderChineseParagraph(para, currentPageText!.translations?.[para.id] || '')}
          </p>
        ))}
      </div>
    );
  };

  const renderBilingualBlockLayout = () => {
    const hasSections = annotatedParagraphs.some(p => p.section !== undefined);
    if (currentPageText!.columnsCount > 1 && hasSections) {
      const blocks = groupParagraphsIntoBlocks(annotatedParagraphs);
      return (
        <div className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300 flex flex-col gap-4">
          {blocks.map((block, idx) => {
            if (block.type === 'single') {
              return (
                <div key={idx} className="w-full">
                  {block.paragraphs.map(para => {
                    const translation = currentPageText!.translations?.[para.id];
                    return (
                      <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                        <p className={`${paraClass(para, 'bi-en')} mb-1.5`}>
                          {renderEnglishParagraph(para)}
                        </p>
                        {translation && (
                          <p className={`${paraClass(para, 'bi-zh')} mt-1 border-l-2 border-primary/20 pl-3`}>
                            {renderChineseParagraph(para, translation)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            } else {
              const leftParas = block.paragraphs.filter(p => p.section === 'left');
              const rightParas = block.paragraphs.filter(p => p.section === 'right');
              return (
                <div key={idx} className="grid grid-cols-2 gap-5 w-full">
                  <div className="flex flex-col">
                    {leftParas.map(para => {
                      const translation = currentPageText!.translations?.[para.id];
                      return (
                        <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                          <p className={`${paraClass(para, 'bi-en')} mb-1.5`}>
                            {renderEnglishParagraph(para)}
                          </p>
                          {translation && (
                            <p className={`${paraClass(para, 'bi-zh')} mt-1 border-l-2 border-primary/20 pl-3`}>
                              {renderChineseParagraph(para, translation)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col border-l border-dashed border-border/40 pl-5">
                    {rightParas.map(para => {
                      const translation = currentPageText!.translations?.[para.id];
                      return (
                        <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                          <p className={`${paraClass(para, 'bi-en')} mb-1.5`}>
                            {renderEnglishParagraph(para)}
                          </p>
                          {translation && (
                            <p className={`${paraClass(para, 'bi-zh')} mt-1 border-l-2 border-primary/20 pl-3`}>
                              {renderChineseParagraph(para, translation)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          })}
        </div>
      );
    }

    return (
      <div className="select-text selection:bg-accent/30 break-words animate-in fade-in duration-300">
        {annotatedParagraphs.map((para) => {
          const translation = currentPageText!.translations?.[para.id];
          return (
            <div key={para.id} className="mb-5 pb-4 border-b border-border/20 last:border-0">
              <p className={`${paraClass(para, 'bi-en')} mb-2`}>
                {renderEnglishParagraph(para)}
              </p>
              {translation && (
                <p className={`${paraClass(para, 'bi-zh')} mt-1 border-l-2 border-primary/20 pl-3`}>
                  {renderChineseParagraph(para, translation)}
                </p>
              )}
            </div>
          );
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
            onClick={() => setLayoutMode('bilingual')}
            className={`flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${
              layoutMode === 'bilingual'
                ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                : 'text-secondary-foreground hover:text-foreground'
            }`}
          >
            双语对照
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
      <article className="relative bg-editor-bg border border-border/80 shadow-md rounded-md p-6 min-h-[300px] flex flex-col justify-between transition-all duration-300">

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
            <div className="flex flex-col gap-3 py-4 animate-pulse">
              <div className="h-4 bg-secondary/50 rounded w-11/12"></div>
              <div className="h-4 bg-secondary/50 rounded w-full"></div>
              <div className="h-4 bg-secondary/50 rounded w-full"></div>
              <div className="h-4 bg-secondary/50 rounded w-3/4"></div>
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
