import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { translationHistory } from '../state/translation';
import { postMessage } from '../vscode';

export const ExportButton: FunctionComponent = () => {
  const [open, setOpen] = useState(false);

  const handleExport = (format: 'markdown' | 'bilingual') => {
    postMessage({ type: 'export-translations', format });
    setOpen(false);
  };

  if (translationHistory.value.length === 0) return null;

  return (
    <div class="export-wrapper">
      <button class="btn btn-sm" onClick={() => setOpen(!open)}>
        导出
      </button>
      {open && (
        <div class="export-dropdown">
          <button onClick={() => handleExport('markdown')}>Markdown</button>
          <button onClick={() => handleExport('bilingual')}>双语对照</button>
        </div>
      )}
    </div>
  );
};