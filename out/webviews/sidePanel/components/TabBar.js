"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TabBar = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const store_1 = require("../store");
const ExportButton_1 = require("./ExportButton");
const tabs = [
    { id: 'translation', label: '翻译' },
    { id: 'journal', label: '期刊信息' },
    { id: 'glossary', label: '术语表' },
    { id: 'settings', label: '设置' }
];
const TabBar = () => {
    const activeTab = (0, store_1.useStore)((state) => state.activeTab);
    const setActiveTab = (0, store_1.useStore)((state) => state.setActiveTab);
    return ((0, jsx_runtime_1.jsxs)("nav", { className: "flex items-center justify-between border-b border-border bg-background px-3 py-1 flex-shrink-0 z-10 shadow-sm", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex gap-1", children: tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return ((0, jsx_runtime_1.jsxs)("button", { onClick: () => setActiveTab(tab.id), className: `px-3 py-2 text-xs font-semibold rounded-md transition-all duration-200 relative ${isActive
                            ? 'text-primary bg-secondary'
                            : 'text-secondary-foreground hover:text-foreground hover:bg-secondary-hover/50'}`, children: [tab.label, isActive && ((0, jsx_runtime_1.jsx)("span", { className: "absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" }))] }, tab.id));
                }) }), (0, jsx_runtime_1.jsx)(ExportButton_1.ExportButton, {})] }));
};
exports.TabBar = TabBar;
//# sourceMappingURL=TabBar.js.map