import { FunctionComponent, useState } from 'react';
import { useStore } from '../store';
import { Languages, FileCheck, RefreshCw } from 'lucide-react';
import { postMessage } from '../vscode';

export const TranslationTab: FunctionComponent = () => {
  const loading = useStore((state) => state.isTranslating);
  const error = useStore((state) => state.translationError);
  const currentPageText = useStore((state) => state.currentPageText);

  const [layoutMode, setLayoutMode] = useState<'translation' | 'bilingual' | 'original'>('original');

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

  const hasTranslations = !!(currentPageText?.translations && Object.keys(currentPageText.translations).length > 0);

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
        
        {/* Page Header (Academic Style Decoration) */}
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
              currentPageText.paragraphs.length > 0 ? (
                (() => {
                  const hasSections = currentPageText.paragraphs.some(p => p.section !== undefined);
                  if (currentPageText.columnsCount > 1 && hasSections) {
                    const headerParas = currentPageText.paragraphs.filter(p => p.section === 'header');
                    const leftParas = currentPageText.paragraphs.filter(p => p.section === 'left');
                    const rightParas = currentPageText.paragraphs.filter(p => p.section === 'right');
                    const footerParas = currentPageText.paragraphs.filter(p => p.section === 'footer');

                    return (
                      <div className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify font-serif text-[11px] text-foreground animate-in fade-in duration-300 flex flex-col gap-3">
                        {headerParas.length > 0 && (
                          <div className="w-full mb-2">
                            {headerParas.map(para => (
                              <p key={para.id} className="mb-3 indent-4 leading-relaxed text-justify font-semibold">
                                {para.text}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-5 w-full">
                          <div className="flex flex-col">
                            {leftParas.map(para => (
                              <p key={para.id} className="mb-3 indent-4 leading-relaxed text-justify">
                                {para.text}
                              </p>
                            ))}
                          </div>
                          <div className="flex flex-col border-l border-dashed border-border/40 pl-5">
                            {rightParas.map(para => (
                              <p key={para.id} className="mb-3 indent-4 leading-relaxed text-justify">
                                {para.text}
                              </p>
                            ))}
                          </div>
                        </div>
                        {footerParas.length > 0 && (
                          <div className="w-full mt-2 border-t border-dashed border-border/40 pt-2">
                            {footerParas.map(para => (
                              <p key={para.id} className="mb-3 indent-4 leading-relaxed text-justify text-secondary-foreground/80">
                                {para.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify font-serif text-[11px] text-foreground animate-in fade-in duration-300"
                      style={{
                        columnCount: currentPageText.columnsCount > 1 ? currentPageText.columnsCount : undefined,
                        columnGap: '20px',
                        columnRule: currentPageText.columnsCount > 1 ? '1px dashed var(--border)' : undefined,
                      }}
                    >
                      {currentPageText.paragraphs.map((para) => (
                        <p key={para.id} className="mb-3 indent-4 leading-relaxed text-justify">
                          {para.text}
                        </p>
                      ))}
                    </div>
                  );
                })()
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
              (() => {
                const hasSections = currentPageText.paragraphs.some(p => p.section !== undefined);
                if (currentPageText.columnsCount > 1 && hasSections) {
                  const headerParas = currentPageText.paragraphs.filter(p => p.section === 'header');
                  const leftParas = currentPageText.paragraphs.filter(p => p.section === 'left');
                  const rightParas = currentPageText.paragraphs.filter(p => p.section === 'right');
                  const footerParas = currentPageText.paragraphs.filter(p => p.section === 'footer');

                  return (
                    <div className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify font-zhSerif text-[14px] leading-[2.0] text-foreground font-medium tracking-wide animate-in fade-in duration-300 flex flex-col gap-4">
                      {headerParas.length > 0 && (
                        <div className="w-full mb-2">
                          {headerParas.map(para => (
                            <p key={para.id} className="mb-3 indent-8 text-justify font-semibold">
                              {currentPageText.translations?.[para.id] || ''}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-5 w-full">
                        <div className="flex flex-col">
                          {leftParas.map(para => (
                            <p key={para.id} className="mb-3 indent-8 text-justify">
                              {currentPageText.translations?.[para.id] || ''}
                            </p>
                          ))}
                        </div>
                        <div className="flex flex-col border-l border-dashed border-border/40 pl-5">
                          {rightParas.map(para => (
                            <p key={para.id} className="mb-3 indent-8 text-justify">
                              {currentPageText.translations?.[para.id] || ''}
                            </p>
                          ))}
                        </div>
                      </div>
                      {footerParas.length > 0 && (
                        <div className="w-full mt-2 border-t border-dashed border-border/40 pt-2">
                          {footerParas.map(para => (
                            <p key={para.id} className="mb-3 indent-8 text-justify text-secondary-foreground/80">
                              {currentPageText.translations?.[para.id] || ''}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify font-zhSerif text-[14.5px] leading-[2.1] text-foreground font-medium tracking-wide animate-in fade-in duration-300"
                    style={{
                      columnCount: currentPageText.columnsCount > 1 ? currentPageText.columnsCount : undefined,
                      columnGap: '20px',
                      columnRule: currentPageText.columnsCount > 1 ? '1px dashed var(--border)' : undefined,
                    }}
                  >
                    {currentPageText.paragraphs.map((para) => (
                      <p key={para.id} className="mb-4 indent-8 text-justify">
                        {currentPageText.translations?.[para.id] || ''}
                      </p>
                    ))}
                  </div>
                );
              })()
            ) : (
              (() => {
                const hasSections = currentPageText.paragraphs.some(p => p.section !== undefined);
                if (currentPageText.columnsCount > 1 && hasSections) {
                  const headerParas = currentPageText.paragraphs.filter(p => p.section === 'header');
                  const leftParas = currentPageText.paragraphs.filter(p => p.section === 'left');
                  const rightParas = currentPageText.paragraphs.filter(p => p.section === 'right');
                  const footerParas = currentPageText.paragraphs.filter(p => p.section === 'footer');

                  return (
                    <div className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify animate-in fade-in duration-300 flex flex-col gap-4">
                      {headerParas.length > 0 && (
                        <div className="w-full mb-2">
                          {headerParas.map(para => {
                            const translation = currentPageText.translations?.[para.id];
                            return (
                              <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                                <p className="font-serif text-[11px] text-secondary-foreground leading-relaxed italic mb-1.5 font-semibold">
                                  {para.text}
                                </p>
                                {translation && (
                                  <p className="font-zhSerif text-[14px] leading-[2] text-foreground font-medium tracking-wide indent-8 mt-1 border-l-2 border-primary/20 pl-3 font-semibold">
                                    {translation}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-5 w-full">
                        <div className="flex flex-col">
                          {leftParas.map(para => {
                            const translation = currentPageText.translations?.[para.id];
                            return (
                              <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                                <p className="font-serif text-[11px] text-secondary-foreground leading-relaxed italic mb-1.5">
                                  {para.text}
                                </p>
                                {translation && (
                                  <p className="font-zhSerif text-[14px] leading-[2] text-foreground font-medium tracking-wide indent-8 mt-1 border-l-2 border-primary/20 pl-3">
                                    {translation}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-col border-l border-dashed border-border/40 pl-5">
                          {rightParas.map(para => {
                            const translation = currentPageText.translations?.[para.id];
                            return (
                              <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                                <p className="font-serif text-[11px] text-secondary-foreground leading-relaxed italic mb-1.5">
                                  {para.text}
                                </p>
                                {translation && (
                                  <p className="font-zhSerif text-[14px] leading-[2] text-foreground font-medium tracking-wide indent-8 mt-1 border-l-2 border-primary/20 pl-3">
                                    {translation}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {footerParas.length > 0 && (
                        <div className="w-full mt-2 border-t border-dashed border-border/40 pt-2">
                          {footerParas.map(para => {
                            const translation = currentPageText.translations?.[para.id];
                            return (
                              <div key={para.id} className="mb-4 pb-3 border-b border-border/20 last:border-0">
                                <p className="font-serif text-[11px] text-secondary-foreground/80 leading-relaxed italic mb-1.5">
                                  {para.text}
                                </p>
                                {translation && (
                                  <p className="font-zhSerif text-[14px] leading-[2] text-secondary-foreground/80 font-medium tracking-wide indent-8 mt-1 border-l-2 border-primary/20 pl-3">
                                    {translation}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="select-text selection:bg-accent/30 break-words leading-relaxed text-justify animate-in fade-in duration-300">
                    {currentPageText.paragraphs.map((para) => {
                      const translation = currentPageText.translations?.[para.id];
                      return (
                        <div key={para.id} className="mb-5 pb-4 border-b border-border/20 last:border-0">
                          <p className="font-serif text-[11px] text-secondary-foreground leading-relaxed italic mb-2">
                            {para.text}
                          </p>
                          {translation && (
                            <p className="font-zhSerif text-[14px] leading-[2] text-foreground font-medium tracking-wide indent-4 mt-1 border-l-2 border-primary/20 pl-3">
                              {translation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
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

        {/* Page Footer (Academic Style Decoration) */}
        <div className="flex justify-between items-center border-t border-border/30 pt-2.5 mt-5 text-[8px] font-mono text-secondary-foreground/40">
          <span>DOCUMENT TRANSLATION SERVICE</span>
          <span>PAGE {currentPageText?.pageNumber || 1}</span>
        </div>
      </article>
    </div>
  );
};