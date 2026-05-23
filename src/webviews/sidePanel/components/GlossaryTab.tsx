import { FunctionComponent, useState } from 'react';
import { useStore } from '../store';
import { postMessage } from '../vscode';
import { GlossaryEntry } from '../../../types/models';
import { Plus, Search, ArrowRight, Edit2, Trash2, X, Check, BookMarked, HelpCircle, Upload, RotateCcw, ChevronDown } from 'lucide-react';

function getCategoryBadgeClass(category: string): string {
  const cat = category || '其他';
  switch (cat) {
    case '计算机与人工智能':
      return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
    case '生物医学':
      return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
    case '化学':
      return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
    case '物理学':
      return 'bg-purple-500/10 text-purple-500 border border-purple-500/20';
    case '通用学术':
      return 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20';
    default:
      return 'bg-slate-500/10 text-slate-500 border border-slate-500/20';
  }
}

export const GlossaryTab: FunctionComponent = () => {
  const [showEditor, setShowEditor] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState('其他');
  const [selectedCategory, setSelectedCategory] = useState('全部');

  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];
  const [filterText, setFilterText] = useState('');
  const editingTermId = useStore((state) => state.editingTermId);
  const setEditingTermId = useStore((state) => state.setEditingTermId);

  const filtered = glossaryTerms.filter((t) => {
    if (!t) return false;
    const filter = filterText.trim().toLowerCase();
    const sourceStr = (t.source || '').toLowerCase();
    const targetStr = (t.target || '').toLowerCase();
    const categoryStr = t.category || '其他';

    const matchesSearch = filter === '' ||
      sourceStr.includes(filter) ||
      targetStr.includes(filter);

    const matchesCategory = selectedCategory === '全部' ||
      categoryStr === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const editingTerm = editingTermId
    ? glossaryTerms.find((t) => t.id === editingTermId)
    : undefined;

  const handleAdd = () => {
    if (!source.trim() || !target.trim()) return;
    if (editingTerm) {
      postMessage({ type: 'update-term', id: editingTerm.id, source: source.trim(), target: target.trim(), category });
      setEditingTermId(null);
    } else {
      postMessage({ type: 'add-term', source: source.trim(), target: target.trim(), category });
    }
    setSource('');
    setTarget('');
    setCategory('其他');
    setShowEditor(false);
  };

  const handleEdit = (term: GlossaryEntry) => {
    setEditingTermId(term.id);
    setSource(term.source);
    setTarget(term.target);
    setCategory(term.category || '其他');
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    postMessage({ type: 'delete-term', id });
  };

  const handleCancel = () => {
    setEditingTermId(null);
    setSource('');
    setTarget('');
    setCategory('其他');
    setShowEditor(false);
  };

  return (
    <div className="flex flex-col gap-3.5 animate-in fade-in duration-200">
      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-xs rounded-md border border-border placeholder-secondary-foreground/50 outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
            style={{
              backgroundColor: 'var(--bg-section)',
              color: 'var(--text-primary)',
            }}
            placeholder="搜索学术术语..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
        <button 
          onClick={() => {
            postMessage({ type: 'import-glossary' });
          }}
          title="批量导入术语表"
          className="p-2 rounded-md border border-border bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => {
            postMessage({ type: 'restore-default-glossary' });
          }}
          title="恢复默认常用术语库"
          className="p-2 rounded-md border border-border bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm transition-colors cursor-pointer flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          新增
        </button>
      </div>

      {/* Category Filter Chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin select-none max-w-full">
        {['全部', '计算机与人工智能', '生物医学', '化学', '物理学', '通用学术', '其他'].map(cat => {
          const shortName = cat === '计算机与人工智能' ? 'AI/计算机' : cat === '通用学术' ? '通用' : cat;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all duration-150 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-sm'
                  : 'bg-secondary/35 text-secondary-foreground border-border/40 hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              {shortName}
            </button>
          );
        })}
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
            <div className="relative">
              <select
                className="w-full px-3 py-2 text-xs rounded border border-border outline-none focus:border-accent transition-all cursor-pointer appearance-none pr-10"
                style={{
                  backgroundColor: 'var(--bg-section)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border)'
                }}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="计算机与人工智能" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>计算机与人工智能</option>
                <option value="生物医学" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>生物医学</option>
                <option value="化学" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>化学</option>
                <option value="物理学" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>物理学</option>
                <option value="通用学术" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>通用学术</option>
                <option value="其他" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>其他</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button 
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              取消
            </button>
            <button 
              onClick={handleAdd}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer"
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
              <div className="flex items-center gap-2 min-w-0 flex-1 select-text flex-wrap gap-y-1.5">
                <span className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 truncate max-w-[40%]">
                  {term.source}
                </span>
                <ArrowRight className="w-3 h-3 text-secondary-foreground/40 flex-shrink-0" />
                <span className="font-sans text-xs text-foreground font-semibold truncate max-w-[40%]">
                  {term.target}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getCategoryBadgeClass(term.category || '其他')}`}>
                  {term.category === '计算机与人工智能' ? 'AI/计算机' : term.category === '通用学术' ? '通用' : term.category || '其他'}
                </span>
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button 
                  onClick={() => handleEdit(term)}
                  title="编辑"
                  className="p-1.5 rounded hover:bg-secondary hover:text-accent text-secondary-foreground/60 transition-all cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleDelete(term.id)}
                  title="删除"
                  className="p-1.5 rounded hover:bg-secondary hover:text-error text-secondary-foreground/60 transition-all cursor-pointer"
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