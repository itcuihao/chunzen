"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlossaryTab = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
const vscode_1 = require("../vscode");
const lucide_react_1 = require("lucide-react");
function getCategoryBadgeClass(category) {
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
const GlossaryTab = () => {
    const [showEditor, setShowEditor] = (0, react_1.useState)(false);
    const [source, setSource] = (0, react_1.useState)('');
    const [target, setTarget] = (0, react_1.useState)('');
    const [category, setCategory] = (0, react_1.useState)('其他');
    const [selectedCategory, setSelectedCategory] = (0, react_1.useState)('全部');
    const glossaryTerms = (0, store_1.useStore)((state) => state.glossaryTerms) || [];
    const [filterText, setFilterText] = (0, react_1.useState)('');
    const editingTermId = (0, store_1.useStore)((state) => state.editingTermId);
    const setEditingTermId = (0, store_1.useStore)((state) => state.setEditingTermId);
    const filtered = glossaryTerms.filter((t) => {
        if (!t)
            return false;
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
        if (!source.trim() || !target.trim())
            return;
        if (editingTerm) {
            (0, vscode_1.postMessage)({ type: 'update-term', id: editingTerm.id, source: source.trim(), target: target.trim(), category });
            setEditingTermId(null);
        }
        else {
            (0, vscode_1.postMessage)({ type: 'add-term', source: source.trim(), target: target.trim(), category });
        }
        setSource('');
        setTarget('');
        setCategory('其他');
        setShowEditor(false);
    };
    const handleEdit = (term) => {
        setEditingTermId(term.id);
        setSource(term.source);
        setTarget(term.target);
        setCategory(term.category || '其他');
        setShowEditor(true);
    };
    const handleDelete = (id) => {
        (0, vscode_1.postMessage)({ type: 'delete-term', id });
    };
    const handleCancel = () => {
        setEditingTermId(null);
        setSource('');
        setTarget('');
        setCategory('其他');
        setShowEditor(false);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-3.5 animate-in fade-in duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 items-center", children: [(0, jsx_runtime_1.jsxs)("div", { className: "relative flex-1", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full pl-9 pr-4 py-2 text-xs rounded-md border border-border placeholder-secondary-foreground/50 outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all", style: {
                                    backgroundColor: 'var(--bg-section)',
                                    color: 'var(--text-primary)',
                                }, placeholder: "\u641C\u7D22\u5B66\u672F\u672F\u8BED...", value: filterText, onChange: (e) => setFilterText(e.target.value) })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                            (0, vscode_1.postMessage)({ type: 'import-glossary' });
                        }, title: "\u6279\u91CF\u5BFC\u5165\u672F\u8BED\u8868", className: "p-2 rounded-md border border-border bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Upload, { className: "w-3.5 h-3.5" }) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                            (0, vscode_1.postMessage)({ type: 'restore-default-glossary' });
                        }, title: "\u6062\u590D\u9ED8\u8BA4\u5E38\u7528\u672F\u8BED\u5E93", className: "p-2 rounded-md border border-border bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0", children: (0, jsx_runtime_1.jsx)(lucide_react_1.RotateCcw, { className: "w-3.5 h-3.5" }) }), (0, jsx_runtime_1.jsxs)("button", { onClick: () => setShowEditor(true), className: "flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm transition-colors cursor-pointer flex-shrink-0", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Plus, { className: "w-3.5 h-3.5" }), "\u65B0\u589E"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin select-none max-w-full", children: ['全部', '计算机与人工智能', '生物医学', '化学', '物理学', '通用学术', '其他'].map(cat => {
                    const shortName = cat === '计算机与人工智能' ? 'AI/计算机' : cat === '通用学术' ? '通用' : cat;
                    const isActive = selectedCategory === cat;
                    return ((0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedCategory(cat), className: `px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all duration-150 cursor-pointer whitespace-nowrap ${isActive
                            ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-sm'
                            : 'bg-secondary/35 text-secondary-foreground border-border/40 hover:bg-secondary/60 hover:text-foreground'}`, children: shortName }, cat));
                }) }), showEditor && ((0, jsx_runtime_1.jsxs)("div", { className: "glass-panel p-4 rounded-lg border border-accent/30 bg-accent/5 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 pb-2 border-b border-border/40", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.BookMarked, { className: "w-4 h-4 text-accent" }), (0, jsx_runtime_1.jsx)("span", { className: "text-xs font-bold text-foreground", children: editingTerm ? '编辑学术术语' : '新增学术术语' })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/45 text-foreground outline-none focus:border-accent transition-all font-mono", placeholder: "\u82F1\u6587\u5B66\u672F\u672F\u8BED (\u5982: Self-Attention)", value: source, onChange: (e) => setSource(e.target.value) }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/45 text-foreground outline-none focus:border-accent transition-all", placeholder: "\u4E2D\u6587\u4E13\u4E1A\u7FFB\u8BD1 (\u5982: \u81EA\u6CE8\u610F\u529B\u673A\u5236)", value: target, onChange: (e) => setTarget(e.target.value) }), (0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsxs)("select", { className: "w-full px-3 py-2 text-xs rounded border border-border outline-none focus:border-accent transition-all cursor-pointer appearance-none pr-10", style: {
                                            backgroundColor: 'var(--bg-section)',
                                            color: 'var(--text-primary)',
                                            borderColor: 'var(--border)'
                                        }, value: category, onChange: (e) => setCategory(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "\u8BA1\u7B97\u673A\u4E0E\u4EBA\u5DE5\u667A\u80FD", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u8BA1\u7B97\u673A\u4E0E\u4EBA\u5DE5\u667A\u80FD" }), (0, jsx_runtime_1.jsx)("option", { value: "\u751F\u7269\u533B\u5B66", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u751F\u7269\u533B\u5B66" }), (0, jsx_runtime_1.jsx)("option", { value: "\u5316\u5B66", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u5316\u5B66" }), (0, jsx_runtime_1.jsx)("option", { value: "\u7269\u7406\u5B66", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u7269\u7406\u5B66" }), (0, jsx_runtime_1.jsx)("option", { value: "\u901A\u7528\u5B66\u672F", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u901A\u7528\u5B66\u672F" }), (0, jsx_runtime_1.jsx)("option", { value: "\u5176\u4ED6", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u5176\u4ED6" })] }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60 pointer-events-none" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 justify-end", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: handleCancel, className: "flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors cursor-pointer", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-3.5 h-3.5" }), "\u53D6\u6D88"] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleAdd, className: "flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Check, { className: "w-3.5 h-3.5" }), editingTerm ? '更新' : '确认'] })] })] })), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-col gap-2", children: filtered.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col items-center justify-center py-8 text-center text-secondary-foreground/60 border border-dashed border-border rounded-lg bg-card/5", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.HelpCircle, { className: "w-8 h-8 mb-2 opacity-35 text-secondary-foreground" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs", children: glossaryTerms.length === 0 ? '暂无术语，点击添加以优化翻译结果' : '未找到匹配的术语' })] })) : (filtered.map((term) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3 rounded-lg border border-border bg-card/10 hover-micro-scale hover:border-accent/20 transition-all duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 min-w-0 flex-1 select-text flex-wrap gap-y-1.5", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-mono text-xs text-secondary-foreground bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 truncate max-w-[40%]", children: term.source }), (0, jsx_runtime_1.jsx)(lucide_react_1.ArrowRight, { className: "w-3 h-3 text-secondary-foreground/40 flex-shrink-0" }), (0, jsx_runtime_1.jsx)("span", { className: "font-sans text-xs text-foreground font-semibold truncate max-w-[40%]", children: term.target }), (0, jsx_runtime_1.jsx)("span", { className: `text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getCategoryBadgeClass(term.category || '其他')}`, children: term.category === '计算机与人工智能' ? 'AI/计算机' : term.category === '通用学术' ? '通用' : term.category || '其他' })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-1 ml-2 flex-shrink-0", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleEdit(term), title: "\u7F16\u8F91", className: "p-1.5 rounded hover:bg-secondary hover:text-accent text-secondary-foreground/60 transition-all cursor-pointer", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Edit2, { className: "w-3.5 h-3.5" }) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleDelete(term.id), title: "\u5220\u9664", className: "p-1.5 rounded hover:bg-secondary hover:text-error text-secondary-foreground/60 transition-all cursor-pointer", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-3.5 h-3.5" }) })] })] }, term.id)))) })] }));
};
exports.GlossaryTab = GlossaryTab;
//# sourceMappingURL=GlossaryTab.js.map