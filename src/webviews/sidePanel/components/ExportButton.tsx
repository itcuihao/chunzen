import { FunctionComponent, useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { postMessage } from '../vscode';
import { FileDown } from 'lucide-react';

export const ExportButton: FunctionComponent = () => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const translationHistory = useStore((state) => state.translationHistory);

  const handleExport = (format: 'markdown' | 'bilingual') => {
    postMessage({ type: 'export-translations', format });
    setOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (translationHistory.length === 0) return null;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200"
      >
        <FileDown className="w-3.5 h-3.5" />
        导出
      </button>
      
      {open && (
        <div className="absolute right-0 mt-1.5 w-32 origin-top-right rounded-md border border-border bg-editor-bg shadow-xl focus:outline-none z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="py-1">
            <button
              onClick={() => handleExport('markdown')}
              className="block w-full px-4 py-2 text-left text-xs text-foreground hover:bg-secondary-hover transition-colors"
            >
              Markdown 格式
            </button>
            <button
              onClick={() => handleExport('bilingual')}
              className="block w-full px-4 py-2 text-left text-xs text-foreground hover:bg-secondary-hover transition-colors"
            >
              双语对照
            </button>
          </div>
        </div>
      )}
    </div>
  );
};