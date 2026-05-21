"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportButton = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
const vscode_1 = require("../vscode");
const lucide_react_1 = require("lucide-react");
const ExportButton = () => {
    const [open, setOpen] = (0, react_1.useState)(false);
    const dropdownRef = (0, react_1.useRef)(null);
    const translationHistory = (0, store_1.useStore)((state) => state.translationHistory);
    const handleExport = (format) => {
        (0, vscode_1.postMessage)({ type: 'export-translations', format });
        setOpen(false);
    };
    // Close dropdown when clicking outside
    (0, react_1.useEffect)(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    if (translationHistory.length === 0)
        return null;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "relative inline-block text-left", ref: dropdownRef, children: [(0, jsx_runtime_1.jsxs)("button", { onClick: () => setOpen(!open), className: "flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.FileDown, { className: "w-3.5 h-3.5" }), "\u5BFC\u51FA"] }), open && ((0, jsx_runtime_1.jsx)("div", { className: "absolute right-0 mt-1.5 w-32 origin-top-right rounded-md border border-border bg-editor-bg shadow-xl focus:outline-none z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100", children: (0, jsx_runtime_1.jsxs)("div", { className: "py-1", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleExport('markdown'), className: "block w-full px-4 py-2 text-left text-xs text-foreground hover:bg-secondary-hover transition-colors", children: "Markdown \u683C\u5F0F" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleExport('bilingual'), className: "block w-full px-4 py-2 text-left text-xs text-foreground hover:bg-secondary-hover transition-colors", children: "\u53CC\u8BED\u5BF9\u7167" })] }) }))] }));
};
exports.ExportButton = ExportButton;
//# sourceMappingURL=ExportButton.js.map