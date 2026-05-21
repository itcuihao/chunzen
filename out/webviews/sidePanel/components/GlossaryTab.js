"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlossaryTab = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
const vscode_1 = require("../vscode");
const lucide_react_1 = require("lucide-react");
const GlossaryTab = () => {
    const [showEditor, setShowEditor] = (0, react_1.useState)(false);
    const [source, setSource] = (0, react_1.useState)('');
    const [target, setTarget] = (0, react_1.useState)('');
    const glossaryTerms = (0, store_1.useStore)((state) => state.glossaryTerms);
    const glossaryFilter = (0, store_1.useStore)((state) => state.glossaryFilter);
    const setGlossaryFilter = (0, store_1.useStore)((state) => state.setGlossaryFilter);
    const editingTermId = (0, store_1.useStore)((state) => state.editingTermId);
    const setEditingTermId = (0, store_1.useStore)((state) => state.setEditingTermId);
    const filtered = glossaryTerms.filter((t) => glossaryFilter === '' ||
        t.source.toLowerCase().includes(glossaryFilter.toLowerCase()) ||
        t.target.includes(glossaryFilter));
    const editingTerm = editingTermId
        ? glossaryTerms.find((t) => t.id === editingTermId)
        : undefined;
    const handleAdd = () => {
        if (!source.trim() || !target.trim())
            return;
        if (editingTerm) {
            (0, vscode_1.postMessage)({ type: 'update-term', id: editingTerm.id, source: source.trim(), target: target.trim() });
            setEditingTermId(null);
        }
        else {
            (0, vscode_1.postMessage)({ type: 'add-term', source: source.trim(), target: target.trim() });
        }
        setSource('');
        setTarget('');
        setShowEditor(false);
    };
    const handleEdit = (term) => {
        setEditingTermId(term.id);
        setSource(term.source);
        setTarget(term.target);
        setShowEditor(true);
    };
    const handleDelete = (id) => {
        (0, vscode_1.postMessage)({ type: 'delete-term', id });
    };
    const handleCancel = () => {
        setEditingTermId(null);
        setSource('');
        setTarget('');
        setShowEditor(false);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-3.5 animate-in fade-in duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "relative flex-1", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "absolute left-3 top-2.5 w-4 h-4 text-secondary-foreground/60" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full pl-9 pr-4 py-2 text-xs rounded-md border border-border bg-card/20 placeholder-secondary-foreground/50 text-foreground outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all", placeholder: "\u641C\u7D22\u5B66\u672F\u672F\u8BED...", value: glossaryFilter, onChange: (e) => setGlossaryFilter(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("button", { onClick: () => setShowEditor(true), className: "flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm transition-colors", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Plus, { className: "w-3.5 h-3.5" }), "\u65B0\u589E"] })] }), showEditor && ((0, jsx_runtime_1.jsxs)("div", { className: "glass-panel p-4 rounded-lg border border-accent/30 bg-accent/5 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 pb-2 border-b border-border/40", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.BookMarked, { className: "w-4 h-4 text-accent" }), (0, jsx_runtime_1.jsx)("span", { className: "text-xs font-bold text-foreground", children: editingTerm ? '编辑学术术语' : '新增学术术语' })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/45 text-foreground outline-none focus:border-accent transition-all font-mono", placeholder: "\u82F1\u6587\u5B66\u672F\u672F\u8BED (\u5982: Self-Attention)", value: source, onChange: (e) => setSource(e.target.value) }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/45 text-foreground outline-none focus:border-accent transition-all", placeholder: "\u4E2D\u6587\u4E13\u4E1A\u7FFB\u8BD1 (\u5982: \u81EA\u6CE8\u610F\u529B\u673A\u5236)", value: target, onChange: (e) => setTarget(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 justify-end", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: handleCancel, className: "flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-3.5 h-3.5" }), "\u53D6\u6D88"] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleAdd, className: "flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary-hover transition-colors", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Check, { className: "w-3.5 h-3.5" }), editingTerm ? '更新' : '确认'] })] })] })), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-col gap-2", children: filtered.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col items-center justify-center py-8 text-center text-secondary-foreground/60 border border-dashed border-border rounded-lg bg-card/5", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.HelpCircle, { className: "w-8 h-8 mb-2 opacity-35 text-secondary-foreground" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs", children: glossaryTerms.length === 0 ? '暂无术语，点击添加以优化翻译结果' : '未找到匹配的术语' })] })) : (filtered.map((term) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3 rounded-lg border border-border bg-card/10 hover-micro-scale hover:border-accent/20 transition-all duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2.5 min-w-0 flex-1 select-text", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-mono text-xs text-secondary-foreground bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 truncate max-w-[45%]", children: term.source }), (0, jsx_runtime_1.jsx)(lucide_react_1.ArrowRight, { className: "w-3 h-3 text-secondary-foreground/40 flex-shrink-0" }), (0, jsx_runtime_1.jsx)("span", { className: "font-sans text-xs text-foreground font-semibold truncate max-w-[45%]", children: term.target })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-1 ml-3 flex-shrink-0", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleEdit(term), title: "\u7F16\u8F91", className: "p-1.5 rounded hover:bg-secondary hover:text-accent text-secondary-foreground/60 transition-all", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Edit2, { className: "w-3.5 h-3.5" }) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleDelete(term.id), title: "\u5220\u9664", className: "p-1.5 rounded hover:bg-secondary hover:text-error text-secondary-foreground/60 transition-all", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-3.5 h-3.5" }) })] })] }, term.id)))) })] }));
};
exports.GlossaryTab = GlossaryTab;
//# sourceMappingURL=GlossaryTab.js.map