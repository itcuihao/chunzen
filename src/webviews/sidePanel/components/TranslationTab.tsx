import { FunctionComponent, useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { 
  Languages, FileCheck, RefreshCw, Compass, Plus, Copy,
  Highlighter, MessageSquareText, Sparkles, Trash2, X,
  Maximize2, Minimize2
} from 'lucide-react';
import { postMessage } from '../vscode';
import { SelectionHighlight } from '../../../types/models';
// @ts-ignore
import { marked } from 'marked';
import {
  protectMathAndCitations,
  restoreMathAndCitationsFallback,
  protectTextWithPlaceholders,
  splitTableCells,
  classifyParagraphs
} from '../textProcessing';
import {
  AnnotatedPara,
  LayoutBlock,
  EN_STYLES, ZH_STYLES, BI_EN_STYLES, BI_ZH_STYLES, PARA_SPACING, ZH_INDENT, EN_INDENT,
  isHeadingContinuation,
  isCollapsibleNoiseSkip,
  previousSemanticParagraph,
  getParagraphColumnIndex,
  groupParagraphsIntoBlocks
} from '../paragraphLayout';
import { renderMathInText, applyHighlightsToMineruText, applyJumpLinksToMineruText } from '../mineruText';
import { renderTextWithHighlightsAndCitations, renderTextWithPlaceholders } from './TextRenderers';

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
  // MinerU 入口当前停用（见 CLAUDE.md），以下状态随被注释的 UI 保留
  const _mineruProgress = useStore((state) => state.mineruProgress);
  const mineruMarkdown = useStore((state) => state.mineruMarkdown);
  const _mineruError = useStore((state) => state.mineruError);

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
    const hasPlaceholders = /\[\[CZ(NUM|FIG|CZNAR|CZPAR|CZSUP)_\d+\]\]/.test(translation);
    if (hasPlaceholders) {
      return renderTextWithPlaceholders(translation, para, bibliography);
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

  const _handleMineruToggle = () => {
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
            onClick={_handleMineruToggle}
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
                onClick={_handleMineruToggle}
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
