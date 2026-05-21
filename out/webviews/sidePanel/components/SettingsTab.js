"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsTab = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
const vscode_1 = require("../vscode");
const lucide_react_1 = require("lucide-react");
const SettingsTab = () => {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-4 animate-in fade-in duration-200", children: [(0, jsx_runtime_1.jsx)(EngineSettings, {}), (0, jsx_runtime_1.jsx)(JournalSourceSettings, {}), (0, jsx_runtime_1.jsx)(GeneralSettings, {})] }));
};
exports.SettingsTab = SettingsTab;
const engineFields = {
    baidu: [
        { key: 'appId', label: 'App ID', type: 'text', placeholder: '百度翻译开放平台 App ID' },
        { key: 'secretKey', label: '密钥 (Secret Key)', type: 'password', placeholder: '百度翻译 Secret Key' }
    ],
    deepl: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'DeepL 认证密钥' },
        { key: 'freeApi', label: '使用免费版 API', type: 'toggle' }
    ],
    openai: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'OpenAI / Gemini API Key' },
        { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1' },
        { key: 'model', label: '模型名称', type: 'text', placeholder: 'gpt-4o-mini' },
        { key: 'systemPrompt', label: '系统提示词', type: 'textarea', placeholder: '你是一个学术翻译专家...' }
    ],
    custom: [
        { key: 'url', label: '接口 URL', type: 'text', placeholder: 'https://example.com/translate' },
        { key: 'headers', label: '请求头 (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer xxx"}' },
        { key: 'bodyTemplate', label: '请求体模板', type: 'textarea', placeholder: '{"text": "{{text}}", "target_lang": "ZH"}' },
        { key: 'responsePath', label: '响应路径', type: 'text', placeholder: 'data.translation' }
    ],
    claudeCli: [
        { key: 'enabled', label: '启用 Claude CLI', type: 'toggle' },
        { key: 'prompt', label: '翻译提示词', type: 'textarea', placeholder: '将以下学术英文翻译为中文，只输出译文：' }
    ]
};
// ── EngineSettings ──
const EngineSettings = () => {
    const [expanded, setExpanded] = (0, react_1.useState)(null);
    const [testing, setTesting] = (0, react_1.useState)(null);
    const enginePriority = (0, store_1.useStore)((state) => state.enginePriority);
    const engineStatuses = (0, store_1.useStore)((state) => state.engineStatuses);
    const engineConfigs = (0, store_1.useStore)((state) => state.engineConfigs);
    const testResults = (0, store_1.useStore)((state) => state.testResults);
    const handleTest = (engineName) => {
        setTesting(engineName);
        (0, vscode_1.postMessage)({ type: 'test-engine', engineName });
        // Reset testing status after 5 seconds automatically in case response lags
        setTimeout(() => setTesting(null), 5000);
    };
    const handleSave = (engineName, config) => {
        (0, vscode_1.postMessage)({ type: 'save-engine-config', engineName, config });
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-4 h-4 text-accent animate-pulse" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u7FFB\u8BD1\u5F15\u64CE" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-3.5", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed mb-4", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Info, { className: "w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" }), (0, jsx_runtime_1.jsxs)("p", { children: ["\u914D\u7F6E\u60A8\u7684 API \u5BC6\u94A5\u4EE5\u542F\u7528\u7FFB\u8BD1\u3002\u6625\u8749\u4F1A\u6309\u7167\u4EE5\u4E0B\u4F18\u5148\u7EA7\u987A\u5E8F", (0, jsx_runtime_1.jsx)("b", { children: "\u4F9D\u6B21\u5411\u4E0B\u67E5\u627E\u53EF\u7528\u5F15\u64CE" }), "\u3002"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-col gap-2.5", children: enginePriority.map((name, i) => {
                            const status = engineStatuses.find((e) => e.name === name);
                            const isExpanded = expanded === name;
                            const isTesting = testing === name;
                            const testResult = testResults[name];
                            return ((0, jsx_runtime_1.jsxs)("div", { className: `rounded-lg border bg-card/10 overflow-hidden transition-all duration-200 ${isExpanded ? 'border-accent/40 shadow-sm ring-1 ring-accent/10' : 'border-border hover:border-border/80'}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-secondary/15 transition-colors", onClick: () => setExpanded(isExpanded ? null : name), children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-[10px] font-mono font-bold text-secondary-foreground bg-secondary px-2 py-1 rounded-full border border-border", children: i + 1 }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs font-bold text-foreground", children: status?.displayName || name }), (0, jsx_runtime_1.jsxs)("span", { className: "text-[9px] text-secondary-foreground/60 mt-0.5 font-medium", children: ["\u4F18\u5148\u7EA7\u7B2C ", i + 1, " \u4F4D"] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("span", { className: `inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${status?.configured
                                                            ? 'bg-success/10 border-success/30 text-success'
                                                            : 'bg-error/5 border-error/20 text-secondary-foreground/60'}`, children: status?.configured ? '已启用' : '未配置' }), isExpanded ? ((0, jsx_runtime_1.jsx)(lucide_react_1.ChevronUp, { className: "w-3.5 h-3.5 text-secondary-foreground/60" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "w-3.5 h-3.5 text-secondary-foreground/60" }))] })] }), isExpanded && ((0, jsx_runtime_1.jsx)(EngineConfigForm, { engineName: name, config: engineConfigs[name] || {}, fields: engineFields[name] || [], onSave: (config) => handleSave(name, config), onTest: () => handleTest(name), isTesting: isTesting, testResult: testResult }))] }, name));
                        }) })] })] }));
};
const EngineConfigForm = ({ engineName, config, fields, onSave, onTest, isTesting, testResult }) => {
    const [formState, setFormState] = (0, react_1.useState)({});
    const [saved, setSaved] = (0, react_1.useState)(false);
    const [showPasswords, setShowPasswords] = (0, react_1.useState)({});
    // Initialize form state
    const formValues = {};
    for (const field of fields) {
        formValues[field.key] = formState[field.key] !== undefined
            ? formState[field.key]
            : config[field.key] ?? (field.type === 'toggle' ? false : '');
    }
    const handleChange = (key, value) => {
        setFormState((prev) => ({ ...prev, [key]: value }));
    };
    const togglePasswordVisibility = (key) => {
        setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
    };
    const handleSaveClick = () => {
        const values = {};
        for (const field of fields) {
            const val = formState[field.key] !== undefined ? formState[field.key] : config[field.key];
            if (field.type === 'toggle') {
                values[field.key] = String(Boolean(val));
            }
            else {
                values[field.key] = String(val ?? '');
            }
        }
        onSave(values);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "p-4 border-t border-border bg-card/5 flex flex-col gap-3.5 animate-in slide-in-from-top-1 duration-150", children: [fields.map((field) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: field.label }), field.type === 'toggle' ? ((0, jsx_runtime_1.jsxs)("label", { className: "relative inline-flex items-center cursor-pointer select-none", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", className: "sr-only peer", checked: Boolean(formValues[field.key]), onChange: (e) => handleChange(field.key, e.target.checked) }), (0, jsx_runtime_1.jsx)("div", { className: "w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" })] })) : field.type === 'textarea' ? ((0, jsx_runtime_1.jsx)("textarea", { className: "w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono resize-y min-h-[50px] leading-relaxed", placeholder: field.placeholder, value: String(formValues[field.key] ?? ''), onChange: (e) => handleChange(field.key, e.target.value), rows: 3 })) : field.type === 'password' ? ((0, jsx_runtime_1.jsxs)("div", { className: "relative flex items-center", children: [(0, jsx_runtime_1.jsx)("input", { type: showPasswords[field.key] ? 'text' : 'password', className: "w-full pl-3 pr-9 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", placeholder: field.placeholder, value: String(formValues[field.key] ?? ''), onChange: (e) => handleChange(field.key, e.target.value) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => togglePasswordVisibility(field.key), className: "absolute right-2 text-secondary-foreground/50 hover:text-foreground p-1 rounded", children: showPasswords[field.key] ? ((0, jsx_runtime_1.jsx)(lucide_react_1.EyeOff, { className: "w-3.5 h-3.5" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.Eye, { className: "w-3.5 h-3.5" })) })] })) : ((0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", placeholder: field.placeholder, value: String(formValues[field.key] ?? ''), onChange: (e) => handleChange(field.key, e.target.value) }))] }, field.key))), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 justify-end mt-1.5", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: onTest, disabled: isTesting, className: "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Play, { className: "w-3.5 h-3.5 text-accent" }), isTesting ? '正在测试...' : '测试连接'] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleSaveClick, className: `flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'}`, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-3.5 h-3.5" }), saved ? '配置已保存' : '保存配置'] })] }), testResult && ((0, jsx_runtime_1.jsxs)("div", { className: `flex gap-2 items-start p-3 rounded-md border text-xs leading-relaxed animate-in fade-in duration-200 mt-1 ${testResult.success
                    ? 'bg-success/10 border-success/20 text-success'
                    : 'bg-error/10 border-error/20 text-error'}`, children: [testResult.success ? ((0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-success" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.XCircle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-error" })), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 break-all font-mono", children: testResult.message })] }))] }));
};
// ── JournalSourceSettings ──
const JournalSourceSettings = () => {
    const journalSource = (0, store_1.useStore)((state) => state.journalSource);
    const setJournalSource = (0, store_1.useStore)((state) => state.setJournalSource);
    const handleChange = (e) => {
        setJournalSource({ type: e.target.value });
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Network, { className: "w-4 h-4 text-purple-400" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u671F\u520A\u6570\u636E\u6E90" })] }), (0, jsx_runtime_1.jsx)("div", { className: "p-3.5", children: (0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsxs)("select", { className: "w-full px-3 py-2 text-xs rounded-md border border-border bg-card/25 text-foreground outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer pr-10", value: journalSource.type, onChange: handleChange, children: [(0, jsx_runtime_1.jsx)("option", { value: "letpub", children: "LetPub \u6570\u636E\u6E90 (\u514D\u8D39\u516C\u5F00\u6570\u636E)" }), (0, jsx_runtime_1.jsx)("option", { value: "crossref", children: "CrossRef API \u6570\u636E\u6E90 (\u57FA\u7840\u6587\u732E\u6570\u636E)" })] }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "absolute right-3 top-2.5 w-4 h-4 text-secondary-foreground/60 pointer-events-none" })] }) })] }));
};
// ── GeneralSettings ──
const GeneralSettings = () => {
    const cacheMaxSize = (0, store_1.useStore)((state) => state.cacheMaxSize);
    const handleClearCache = () => (0, vscode_1.postMessage)({ type: 'clear-cache' });
    const handleClearHistory = () => (0, vscode_1.postMessage)({ type: 'clear-history' });
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Settings, { className: "w-4 h-4 text-secondary-foreground/80" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u7CFB\u7EDF\u7EF4\u62A4\u4E0E\u7F13\u5B58" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-3.5 flex flex-col gap-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center text-xs", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-secondary-foreground", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Database, { className: "w-4 h-4 opacity-70" }), (0, jsx_runtime_1.jsx)("span", { children: "\u672C\u5730\u7FFB\u8BD1\u7F13\u5B58\u4E0A\u9650:" })] }), (0, jsx_runtime_1.jsxs)("span", { className: "font-mono font-bold bg-secondary/65 px-2 py-0.5 rounded border border-border", children: [cacheMaxSize, " \u6761"] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2.5 mt-1", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: handleClearCache, className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-3.5 h-3.5" }), "\u6E05\u7A7A\u7FFB\u8BD1\u7F13\u5B58"] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleClearHistory, className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-3.5 h-3.5" }), "\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55"] })] })] })] }));
};
//# sourceMappingURL=SettingsTab.js.map