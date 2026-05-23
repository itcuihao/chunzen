import { FunctionComponent, useState, useEffect } from 'react';
import { useStore } from '../store';
import { postMessage } from '../vscode';
import { FileDown, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export const ExportButton: FunctionComponent = () => {
  const [showModal, setShowModal] = useState(false);
  const [scope, setScope] = useState<'read' | 'all' | 'custom'>('read');
  const [customRange, setCustomRange] = useState('');
  const [untranslatedPolicy, setUntranslatedPolicy] = useState<'english' | 'translate'>('english');
  const [format, setFormat] = useState<'bilingual' | 'chinese' | 'markdown'>('bilingual');
  const [documentName, setDocumentName] = useState('');

  const exportProgress = useStore((state) => state.exportProgress);

  const isExporting = !!exportProgress;

  // Auto-close modal when export completes
  useEffect(() => {
    if (exportProgress && exportProgress.stage === 'compiling' && exportProgress.current === exportProgress.total) {
      const timer = setTimeout(() => {
        setShowModal(false);
        useStore.setState({ exportProgress: null });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [exportProgress]);

  const handleStartExport = () => {
    postMessage({
      type: 'export-doc',
      scope,
      customRange: scope === 'custom' ? customRange : undefined,
      untranslatedPolicy,
      format,
      documentName: documentName.trim() || undefined
    });
  };

  const handleCancel = () => {
    if (isExporting) return;
    setShowModal(false);
    useStore.setState({ exportProgress: null });
  };

  return (
    <>
      <button 
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#d8cebc] bg-[#faf6ee] text-[#5c4f3c] hover:bg-[#faf6ee]/70 active:bg-[#e4dac6] transition-all duration-200"
      >
        <FileDown className="w-3.5 h-3.5" />
        高级导出
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-[#3d3325]/45 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-[310px] rounded-lg border border-[#d8cebc] bg-[#f5efe4] p-4.5 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4 text-[#3d3325] my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#d8cebc] pb-2">
              <div className="flex items-center gap-1.5 font-bold text-[#5c4f3c] text-xs">
                <FileDown className="w-4 h-4 text-[#8c7e6b]" />
                <span>高级导出与文档编译</span>
              </div>
              {!isExporting && (
                <button 
                  onClick={handleCancel}
                  className="p-1 rounded-full text-[#8c7e6b] hover:bg-[#e4dac6] hover:text-[#3d3325] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Config Form (Hidden if compiling/exporting is active but let's show status) */}
            {!isExporting ? (
              <div className="flex flex-col gap-3.5 text-xs">
                {/* File Name */}
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-[#5c4f3c]">文档名称</label>
                  <input
                    type="text"
                    placeholder="春蝉导出文档 (可选)"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-[#d8cebc] bg-[#faf6ee] text-xs text-[#3d3325] placeholder-[#8c7e6b]/50 focus:outline-none focus:border-[#b5a48c] transition-colors"
                  />
                </div>

                {/* Export Scope */}
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-[#5c4f3c]">导出范围</label>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-[#3d3325]/90">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'read'}
                        onChange={() => setScope('read')}
                        className="w-3.5 h-3.5 accent-[#b5a48c]"
                      />
                      <span>已读页面 (快速)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-[#3d3325]/90">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'all'}
                        onChange={() => setScope('all')}
                        className="w-3.5 h-3.5 accent-[#b5a48c]"
                      />
                      <span>整篇论文</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-[#3d3325]/90">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'custom'}
                        onChange={() => setScope('custom')}
                        className="w-3.5 h-3.5 accent-[#b5a48c]"
                      />
                      <span>自定义页码</span>
                    </label>
                  </div>
                  {scope === 'custom' && (
                    <input
                      type="text"
                      placeholder="例如: 1-3, 5"
                      value={customRange}
                      onChange={(e) => setCustomRange(e.target.value)}
                      className="mt-1 w-full px-2 py-1 rounded border border-[#d8cebc] bg-[#faf6ee] text-xs text-[#3d3325] placeholder-[#8c7e6b]/50 focus:outline-none focus:border-[#b5a48c] transition-colors"
                    />
                  )}
                </div>

                {/* Untranslated policy */}
                <div className="flex flex-col gap-1 border-t border-[#d8cebc]/50 pt-2.5">
                  <label className="font-semibold text-[#5c4f3c]">未翻译段落处理</label>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-[#3d3325]/90">
                      <input
                        type="radio"
                        name="untranslatedPolicy"
                        checked={untranslatedPolicy === 'english'}
                        onChange={() => setUntranslatedPolicy('english')}
                        className="w-3.5 h-3.5 accent-[#b5a48c]"
                      />
                      <span>仅导出英文原文 (免费且快)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-[#3d3325]/90">
                      <input
                        type="radio"
                        name="untranslatedPolicy"
                        checked={untranslatedPolicy === 'translate'}
                        onChange={() => setUntranslatedPolicy('translate')}
                        className="w-3.5 h-3.5 accent-[#b5a48c]"
                      />
                      <span>调用 AI 补全翻译</span>
                    </label>
                  </div>
                  {untranslatedPolicy === 'translate' && (
                    <div className="mt-1 flex items-start gap-1 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] leading-relaxed text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>调用 AI 补全翻译将对剩余页段发起翻译接口请求，会消耗您的接口 Token，耗时与段数相关。</span>
                    </div>
                  )}
                </div>

                {/* Export Format */}
                <div className="flex flex-col gap-1 border-t border-[#d8cebc]/50 pt-2.5">
                  <label className="font-semibold text-[#5c4f3c]">导出格式</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    className="w-full px-2 py-1 rounded border border-[#d8cebc] bg-[#faf6ee] text-xs text-[#3d3325] focus:outline-none focus:border-[#b5a48c] transition-colors"
                  >
                    <option value="bilingual">Markdown 双语对照 (段落级)</option>
                    <option value="chinese">Markdown 纯中文译文</option>
                    <option value="markdown">Markdown 双语引用格式 (原文+译文)</option>
                  </select>
                </div>
              </div>
            ) : (
              // Exporting Progress Screen
              <div className="flex flex-col items-center justify-center py-4 gap-3 text-xs text-[#3d3325]">
                {exportProgress.stage === 'compiling' && exportProgress.current === exportProgress.total ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 animate-bounce" />
                    <span className="font-semibold text-emerald-700">导出成功，正在打开文件...</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-8 h-8 text-[#b5a48c] animate-spin" />
                    <div className="flex flex-col items-center gap-1.5 w-full text-center">
                      <span className="font-semibold text-[#5c4f3c]">
                        {exportProgress.stage === 'extracting' && '正在从 PDF 提取内容段落...'}
                        {exportProgress.stage === 'translating' && `正在翻译未完成段落...`}
                        {exportProgress.stage === 'compiling' && '已完成，正在编译并创建文件...'}
                      </span>
                      {exportProgress.stage === 'translating' && (
                        <div className="w-full flex flex-col gap-1.5 mt-1 px-2">
                          <div className="flex justify-between items-center text-[10px] text-[#8c7e6b] font-mono">
                            <span>已完成 {exportProgress.current} / {exportProgress.total} 段</span>
                            <span>{Math.round((exportProgress.current / exportProgress.total) * 100)}%</span>
                          </div>
                          <div className="w-full bg-[#faf6ee] rounded-full h-2 border border-[#d8cebc] overflow-hidden">
                            <div 
                              className="bg-[#b5a48c] h-full transition-all duration-300 rounded-full" 
                              style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                            ></div>
                          </div>
                          {exportProgress.pageNumber && (
                            <span className="text-[10px] text-[#8c7e6b] mt-0.5">当前位置: 第 {exportProgress.pageNumber} 页</span>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Footer Buttons */}
            {!isExporting && (
              <div className="flex items-center justify-end gap-2 border-t border-[#d8cebc] pt-2.5">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-[#d8cebc] bg-transparent text-[#5c4f3c] hover:bg-[#faf6ee] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleStartExport}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-[#b5a48c] text-white hover:bg-[#a3927a] active:bg-[#8c7e6b] transition-colors"
                >
                  开始导出
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};