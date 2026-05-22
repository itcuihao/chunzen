import { FunctionComponent, useState } from 'react';
import { useStore } from '../store';
import { postMessage } from '../vscode';
import { GlossaryEntry } from '../../../types/models';
import { Plus, Search, ArrowRight, Edit2, Trash2, X, Check, BookMarked, HelpCircle } from 'lucide-react';

export const GlossaryTab: FunctionComponent = () => {
  const [showEditor, setShowEditor] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];
  const glossaryFilter = useStore((state) => state.glossaryFilter);
  const setGlossaryFilter = useStore((state) => state.setGlossaryFilter);
  const editingTermId = useStore((state) => state.editingTermId);
  const setEditingTermId = useStore((state) => state.setEditingTermId);

  const filtered = glossaryTerms.filter((t) =>
    glossaryFilter === '' ||
    t.source.toLowerCase().includes(glossaryFilter.toLowerCase()) ||
    t.target.includes(glossaryFilter)
  );

  const editingTerm = editingTermId
    ? glossaryTerms.find((t) => t.id === editingTermId)
    : undefined;

  const handleAdd = () => {
    if (!source.trim() || !target.trim()) return;
    if (editingTerm) {
      postMessage({ type: 'update-term', id: editingTerm.id, source: source.trim(), target: target.trim() });
      setEditingTermId(null);
    } else {
      postMessage({ type: 'add-term', source: source.trim(), target: target.trim() });
    }
    setSource('');
    setTarget('');
    setShowEditor(false);
  };

  const handleEdit = (term: GlossaryEntry) => {
    setEditingTermId(term.id);
    setSource(term.source);
    setTarget(term.target);
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    postMessage({ type: 'delete-term', id });
  };

  const handleCancel = () => {
    setEditingTermId(null);
    setSource('');
    setTarget('');
    setShowEditor(false);
  };

  return (
    <div className="flex flex-col gap-3.5 animate-in fade-in duration-200">
      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary-foreground/60" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-xs rounded-md border border-border bg-card/20 placeholder-secondary-foreground/50 text-foreground outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
            placeholder="搜索学术术语..."
            value={glossaryFilter}
            onChange={(e) => setGlossaryFilter(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新增
        </button>
      </div>

      {/* Editor Panel */}
      {showEditor && (
        <div className="glass-panel p-4 rounded-lg border border-accent/30 bg-accent/5 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 pb-2 border-b border-border/40">
            <BookMarked className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-foreground">
              {editingTerm ? '编辑学术术语' : '新增学术术语'}
            </span>
          </div>
          
          <div className="flex flex-col gap-2">
            <input
              type="text"
              className="w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/45 text-foreground outline-none focus:border-accent transition-all font-mono"
              placeholder="英文学术术语 (如: Self-Attention)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <input
              type="text"
              className="w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/45 text-foreground outline-none focus:border-accent transition-all"
              placeholder="中文专业翻译 (如: 自注意力机制)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button 
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              取消
            </button>
            <button 
              onClick={handleAdd}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {editingTerm ? '更新' : '确认'}
            </button>
          </div>
        </div>
      )}

      {/* Glossary List */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-secondary-foreground/60 border border-dashed border-border rounded-lg bg-card/5">
            <HelpCircle className="w-8 h-8 mb-2 opacity-35 text-secondary-foreground" />
            <p className="text-xs">
              {glossaryTerms.length === 0 ? '暂无术语，点击添加以优化翻译结果' : '未找到匹配的术语'}
            </p>
          </div>
        ) : (
          filtered.map((term) => (
            <div 
              key={term.id} 
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/10 hover-micro-scale hover:border-accent/20 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 select-text">
                <span className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 truncate max-w-[45%]">
                  {term.source}
                </span>
                <ArrowRight className="w-3 h-3 text-secondary-foreground/40 flex-shrink-0" />
                <span className="font-sans text-xs text-foreground font-semibold truncate max-w-[45%]">
                  {term.target}
                </span>
              </div>
              <div className="flex gap-1 ml-3 flex-shrink-0">
                <button 
                  onClick={() => handleEdit(term)}
                  title="编辑"
                  className="p-1.5 rounded hover:bg-secondary hover:text-accent text-secondary-foreground/60 transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleDelete(term.id)}
                  title="删除"
                  className="p-1.5 rounded hover:bg-secondary hover:text-error text-secondary-foreground/60 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};