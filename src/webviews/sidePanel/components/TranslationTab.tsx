import { FunctionComponent, useState } from 'react';
import { useStore } from '../store';
import { Languages, FileText, History, Sparkles, BookOpen, FileCheck } from 'lucide-react';
import { TranslationHistoryEntry } from '../../../types/models';

export const TranslationTab: FunctionComponent = () => {
  const result = useStore((state) => state.currentTranslation);
  const loading = useStore((state) => state.isTranslating);
  const error = useStore((state) => state.translationError);
  const translationHistory = useStore((state) => state.translationHistory);

  const [layoutMode, setLayoutMode] = useState<'translation' | 'bilingual' | 'original'>('translation');

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      {/* Layout Mode Switcher */}
      <div className="flex bg-secondary/25 p-0.5 rounded-lg border border-border/40 text-[10px] font-semibold shadow-inner">
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
      </div>

      {/* The Academic PDF Paper Sheet */}
      <article className="relative bg-editor-bg border border-border/80 shadow-md rounded-md p-6 min-h-[300px] flex flex-col justify-between transition-all duration-300">
        
        {/* Page Header (Academic Style Decoration) */}
        <div className="flex justify-between items-center border-b border-border/40 pb-2 mb-4">
          <span className="text-[8px] font-mono tracking-widest text-secondary-foreground/60 uppercase">
            CHUNZEN ACADEMIC READER // TRANSLATED VIEW
          </span>
          {result && (
            <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded">
              {result.engine} {result.cached ? 'C' : 'N'}
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
          ) : result ? (
            <div className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify">
              
              {/* 1. Original (English) view */}
              {(layoutMode === 'original' || layoutMode === 'bilingual') && (
                <p className="font-serif text-xs text-secondary-foreground leading-relaxed italic mb-4">
                  {result.original}
                </p>
              )}

              {/* Divider for bilingual mode */}
              {layoutMode === 'bilingual' && (
                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-dashed border-border/50"></span>
                  </div>
                  <span className="relative bg-editor-bg px-2 text-[9px] font-mono text-secondary-foreground/40">TRANSLATION</span>
                </div>
              )}

              {/* 2. Translation (Chinese) view */}
              {(layoutMode === 'translation' || layoutMode === 'bilingual') && (
                <p className="font-zhSerif text-[14.5px] leading-[2.1] text-foreground font-medium tracking-wide indent-8">
                  {result.translated}
                </p>
              )}
              
            </div>
          ) : (
            // Academic Paper Placeholder
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 opacity-70">
              <FileCheck className="w-12 h-12 mb-3 text-secondary-foreground/40 stroke-[1.2]" />
              <h3 className="font-zhSerif text-sm font-bold text-foreground mb-1">春蝉学术译稿</h3>
              <p className="text-[11px] text-secondary-foreground/60 max-w-[200px] leading-relaxed">
                请在左侧 PDF 编辑器中悬停或划选英文段落，译文将以标准的学术排版在此自动生成。
              </p>
            </div>
          )}
        </div>

        {/* Page Footer (Academic Style Decoration) */}
        <div className="flex justify-between items-center border-t border-border/30 pt-2.5 mt-5 text-[8px] font-mono text-secondary-foreground/40">
          <span>DOCUMENT TRANSLATION SERVICE</span>
          <span>PAGE 1 OF 1</span>
        </div>
      </article>

      {/* Translation History Section */}
      {translationHistory.length > 0 && (
        <TranslationHistoryList history={translationHistory} />
      )}
    </div>
  );
};

interface TranslationHistoryListProps {
  history: TranslationHistoryEntry[];
}

const TranslationHistoryList: FunctionComponent<TranslationHistoryListProps> = ({ history }) => {
  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-secondary-foreground/80" />
          <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">翻译历史</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary font-mono text-secondary-foreground">{history.length}</span>
      </div>
      <div className="max-height-[250px] overflow-y-auto divide-y divide-border/60">
        {history.slice(0, 20).map((entry, i) => (
          <div key={i} className="p-3 hover:bg-secondary/20 transition-colors group">
            <p className="font-serif text-xs text-secondary-foreground line-clamp-1 group-hover:line-clamp-none transition-all duration-300">
              {entry.original}
            </p>
            <p className="font-zhSerif text-sm text-foreground mt-1 leading-relaxed select-text">
              {entry.translated}
            </p>
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[9px] text-secondary-foreground/50 bg-secondary/40 px-1.5 py-0.5 rounded border border-border/30">
                {entry.engine}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};