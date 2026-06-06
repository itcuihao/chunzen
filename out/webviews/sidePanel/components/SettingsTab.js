"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsTab = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
const vscode_1 = require("../vscode");
const lucide_react_1 = require("lucide-react");
const build_info_1 = require("../../../build-info");
const SettingsTab = () => {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-4 animate-in fade-in duration-200", children: [(0, jsx_runtime_1.jsx)(EngineSettings, {}), (0, jsx_runtime_1.jsx)(JournalSourceSettings, {}), (0, jsx_runtime_1.jsx)(LayoutSettings, {}), (0, jsx_runtime_1.jsx)(GeneralSettings, {}), (0, jsx_runtime_1.jsx)(BuildInfo, {})] }));
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
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'API Key (支持 DeepSeek / Gemini / OpenAI 等)' },
        { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: '默认 https://api.openai.com/v1' },
        { key: 'model', label: '模型名称', type: 'text', placeholder: '如 gpt-4o-mini 或 deepseek-chat' },
        { key: 'systemPrompt', label: '系统提示词', type: 'textarea', placeholder: '你是一个学术翻译专家...' }
    ],
    custom: [
        { key: 'url', label: '接口 URL', type: 'text', placeholder: 'https://example.com/translate' },
        { key: 'headers', label: '请求头 (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer xxx"}' },
        { key: 'bodyTemplate', label: '请求体模板', type: 'textarea', placeholder: '{"text": "{{text}}", "target_lang": "ZH"}' },
        { key: 'responsePath', label: '响应路径', type: 'text', placeholder: 'data.translation' }
    ]
};
// ── EngineSettings ──
const EngineSettings = () => {
    const [expanded, setExpanded] = (0, react_1.useState)(null);
    const [testing, setTesting] = (0, react_1.useState)(null);
    const [dragIndex, setDragIndex] = (0, react_1.useState)(null);
    const [overIndex, setOverIndex] = (0, react_1.useState)(null);
    const enginePriority = (0, store_1.useStore)((state) => state.enginePriority) || [];
    const engineStatuses = (0, store_1.useStore)((state) => state.engineStatuses) || [];
    const engineConfigs = (0, store_1.useStore)((state) => state.engineConfigs) || {};
    const testResults = (0, store_1.useStore)((state) => state.testResults) || {};
    const setEnginePriority = (0, store_1.useStore)((state) => state.setEnginePriority);
    const handleDragStart = (index) => {
        setDragIndex(index);
    };
    const handleDragOver = (e, index) => {
        e.preventDefault();
        setOverIndex(index);
    };
    const handleDrop = (dropIndex) => {
        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null);
            setOverIndex(null);
            return;
        }
        const newPriority = [...enginePriority];
        const [moved] = newPriority.splice(dragIndex, 1);
        newPriority.splice(dropIndex, 0, moved);
        setEnginePriority(newPriority);
        (0, vscode_1.postMessage)({ type: 'set-engine-priority', priority: newPriority });
        setDragIndex(null);
        setOverIndex(null);
    };
    const handleDragEnd = () => {
        setDragIndex(null);
        setOverIndex(null);
    };
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
                            const isDragging = dragIndex === i;
                            const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
                            return ((0, jsx_runtime_1.jsxs)("div", { draggable: true, onDragStart: () => handleDragStart(i), onDragOver: (e) => handleDragOver(e, i), onDrop: () => handleDrop(i), onDragEnd: handleDragEnd, className: `rounded-lg border bg-card/10 overflow-hidden transition-all duration-200 ${isExpanded ? 'border-accent/40 shadow-sm ring-1 ring-accent/10' : 'border-border hover:border-border/80'} ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${isOver ? 'border-accent/60 ring-1 ring-accent/20' : ''}`, children: [isOver && overIndex !== null && overIndex < (dragIndex ?? 0) && ((0, jsx_runtime_1.jsx)("div", { className: "h-0.5 bg-accent rounded-full mx-2 -mt-0.5 mb-1 animate-pulse" })), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-secondary/15 transition-colors", onClick: () => setExpanded(isExpanded ? null : name), children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.GripVertical, { className: "w-3.5 h-3.5 text-secondary-foreground/40 cursor-grab active:cursor-grabbing flex-shrink-0", onMouseDown: (e) => e.stopPropagation() }), (0, jsx_runtime_1.jsx)("span", { className: "text-[10px] font-mono font-bold text-secondary-foreground bg-secondary px-2 py-1 rounded-full border border-border", children: i + 1 }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs font-bold text-foreground", children: status?.displayName || name }), (0, jsx_runtime_1.jsxs)("span", { className: "text-[9px] text-secondary-foreground/60 mt-0.5 font-medium", children: ["\u4F18\u5148\u7EA7\u7B2C ", i + 1, " \u4F4D"] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("span", { className: `inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${status?.configured
                                                            ? 'bg-success/10 border-success/30 text-success'
                                                            : 'bg-error/5 border-error/20 text-secondary-foreground/60'}`, children: status?.configured ? '已启用' : '未配置' }), isExpanded ? ((0, jsx_runtime_1.jsx)(lucide_react_1.ChevronUp, { className: "w-3.5 h-3.5 text-secondary-foreground/60" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "w-3.5 h-3.5 text-secondary-foreground/60" }))] })] }), isExpanded && ((0, jsx_runtime_1.jsx)(EngineConfigForm, { engineName: name, config: engineConfigs[name] || {}, fields: engineFields[name] || [], onSave: (config) => handleSave(name, config), onTest: () => handleTest(name), isTesting: isTesting, testResult: testResult })), isOver && overIndex !== null && overIndex > (dragIndex ?? 0) && ((0, jsx_runtime_1.jsx)("div", { className: "h-0.5 bg-accent rounded-full mx-2 -mb-0.5 mt-1 animate-pulse" }))] }, name));
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
    return ((0, jsx_runtime_1.jsxs)("div", { className: "p-4 border-t border-border bg-card/5 flex flex-col gap-3.5 animate-in slide-in-from-top-1 duration-150", children: [engineName === 'openai' && ((0, jsx_runtime_1.jsxs)("div", { className: "text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-1 font-sans", children: [(0, jsx_runtime_1.jsx)("div", { className: "font-bold text-accent", children: "\uD83D\uDCA1 \u9002\u914D\u8BF4\u660E\u4E0E\u63A8\u8350\uFF1A" }), (0, jsx_runtime_1.jsx)("p", { children: "\u6B64\u901A\u9053\u5B8C\u5168\u517C\u5BB9\u652F\u6301 OpenAI \u683C\u5F0F\u534F\u8BAE\u7684\u5404\u5927\u5E73\u53F0\u670D\u52A1\u5546\u3002\u82E5\u6CA1\u6709\u5B98\u65B9 API Key\uFF0C\u63A8\u8350\u7533\u8BF7\u4EE5\u4E0B\u56FD\u5185\u76F4\u63A5\u8BBF\u95EE\u7684\u6781\u901F/\u4F4E\u6210\u672C\u6E90\u5E76\u586B\u5165\u4E0B\u65B9\uFF1A" }), (0, jsx_runtime_1.jsxs)("ul", { className: "list-disc pl-4 flex flex-col gap-1 mt-1 font-mono", children: [(0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("span", { className: "font-sans font-semibold text-foreground", children: "DeepSeek (\u63A8\u8350)" }), ": Base URL \u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "https://api.deepseek.com/v1" }), "\uFF0C\u6A21\u578B\u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "deepseek-chat" })] }), (0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("span", { className: "font-sans font-semibold text-foreground", children: "\u7845\u57FA\u6D41\u52A8 (\u9001\u5927\u989D\u514D\u8D39\u8BD5\u7528)" }), ": Base URL \u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "https://api.siliconflow.cn/v1" }), "\uFF0C\u6A21\u578B\u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "deepseek-ai/DeepSeek-V3" })] }), (0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("span", { className: "font-sans font-semibold text-foreground", children: "\u667A\u8C31 GLM (\u9001\u8D85\u5927\u514D\u8D39\u8BD5\u7528)" }), ": Base URL \u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "https://open.bigmodel.cn/api/paas/v4" }), "\uFF0C\u6A21\u578B\u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "glm-4-flash" })] }), (0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("span", { className: "font-sans font-semibold text-foreground", children: "\u672C\u5730\u5927\u6A21\u578B (Ollama)" }), ": Base URL \u586B ", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-foreground select-all bg-secondary/50 px-1 rounded", children: "http://localhost:11434/v1" }), "\uFF0C\u6A21\u578B\u586B\u4F60\u672C\u5730\u62C9\u53D6\u7684\u540D\u79F0"] })] })] })), engineName === 'custom' && ((0, jsx_runtime_1.jsxs)("div", { className: "text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-1 font-sans", children: [(0, jsx_runtime_1.jsx)("div", { className: "font-bold text-accent", children: "\uD83D\uDCA1 \u81EA\u5B9A\u4E49\u63A5\u53E3\u914D\u7F6E\u793A\u4F8B\uFF1A" }), (0, jsx_runtime_1.jsx)("p", { children: "\u7528\u4E8E\u5BF9\u63A5\u4EFB\u4F55\u7B2C\u4E09\u65B9\u6216\u81EA\u5EFA\u7684 POST \u7FFB\u8BD1\u63A5\u53E3\u3002\u4EE5\u4E0B\u662F\u4E00\u4E2A\u5178\u578B\u7684\u914D\u7F6E\u793A\u4F8B\uFF1A" }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-[65px_1fr] gap-x-2 gap-y-1 mt-1.5 font-mono text-[9px] bg-secondary/10 p-2 rounded border border-border/20", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-sans font-bold text-foreground", children: "\u63A5\u53E3 URL:" }), (0, jsx_runtime_1.jsx)("code", { className: "text-foreground select-all bg-secondary/50 px-1 rounded truncate", children: "https://api.mytranslator.com/v1/translate" }), (0, jsx_runtime_1.jsx)("span", { className: "font-sans font-bold text-foreground", children: "\u8BF7\u6C42\u5934:" }), (0, jsx_runtime_1.jsx)("code", { className: "text-foreground select-all bg-secondary/50 px-1 rounded truncate", children: "{\"Authorization\": \"Bearer my_token\"}" }), (0, jsx_runtime_1.jsx)("span", { className: "font-sans font-bold text-foreground", children: "\u8BF7\u6C42\u4F53:" }), (0, jsx_runtime_1.jsx)("code", { className: "text-foreground select-all bg-secondary/50 px-1 rounded truncate", children: "{\"text\": \"{{text}}\", \"to\": \"zh\"}" }), (0, jsx_runtime_1.jsx)("span", { className: "font-sans font-bold text-foreground", children: "\u54CD\u5E94\u8DEF\u5F84:" }), (0, jsx_runtime_1.jsx)("code", { className: "text-foreground select-all bg-secondary/50 px-1 rounded truncate", children: "data.translatedText" })] }), (0, jsx_runtime_1.jsxs)("p", { className: "mt-1 text-[9px] opacity-80", children: ["\u8BF4\u660E\uFF1A", (0, jsx_runtime_1.jsx)("code", { className: "font-semibold text-accent bg-secondary/30 px-1 rounded", children: "{{text}}" }), " \u662F\u7CFB\u7EDF\u5360\u4F4D\u7B26\uFF0C\u53D1\u9001\u8BF7\u6C42\u65F6\u4F1A\u88AB\u81EA\u52A8\u66FF\u6362\u6210\u5F85\u7FFB\u8BD1\u53E5\u5B50\u7684\u5185\u5BB9\u3002"] })] })), fields.map((field) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: field.label }), field.type === 'toggle' ? ((0, jsx_runtime_1.jsxs)("label", { className: "relative inline-flex items-center cursor-pointer select-none", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", className: "sr-only peer", checked: Boolean(formValues[field.key]), onChange: (e) => handleChange(field.key, e.target.checked) }), (0, jsx_runtime_1.jsx)("div", { className: "w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" })] })) : field.type === 'textarea' ? ((0, jsx_runtime_1.jsx)("textarea", { className: "w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono resize-y min-h-[50px] leading-relaxed", placeholder: field.placeholder, value: String(formValues[field.key] ?? ''), onChange: (e) => handleChange(field.key, e.target.value), rows: 3 })) : field.type === 'password' ? ((0, jsx_runtime_1.jsxs)("div", { className: "relative flex items-center", children: [(0, jsx_runtime_1.jsx)("input", { type: showPasswords[field.key] ? 'text' : 'password', className: "w-full pl-3 pr-9 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", placeholder: field.placeholder, value: String(formValues[field.key] ?? ''), onChange: (e) => handleChange(field.key, e.target.value) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => togglePasswordVisibility(field.key), className: "absolute right-2 text-secondary-foreground/50 hover:text-foreground p-1 rounded", children: showPasswords[field.key] ? ((0, jsx_runtime_1.jsx)(lucide_react_1.EyeOff, { className: "w-3.5 h-3.5" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.Eye, { className: "w-3.5 h-3.5" })) })] })) : ((0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", placeholder: field.placeholder, value: String(formValues[field.key] ?? ''), onChange: (e) => handleChange(field.key, e.target.value) }))] }, field.key))), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 justify-end mt-1.5", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: onTest, disabled: isTesting, className: "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Play, { className: "w-3.5 h-3.5 text-accent" }), isTesting ? '正在测试...' : '测试连接'] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleSaveClick, className: `flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'}`, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-3.5 h-3.5" }), saved ? '配置已保存' : '保存配置'] })] }), testResult && ((0, jsx_runtime_1.jsxs)("div", { className: `flex gap-2 items-start p-3 rounded-md border text-xs leading-relaxed animate-in fade-in duration-200 mt-1 ${testResult.success
                    ? 'bg-success/10 border-success/20 text-success'
                    : 'bg-error/10 border-error/20 text-error'}`, children: [testResult.success ? ((0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-success" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.XCircle, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-error" })), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 break-all font-mono", children: testResult.message })] }))] }));
};
// ── JournalSourceSettings ──
const JournalSourceSettings = () => {
    const journalSource = (0, store_1.useStore)((state) => state.journalSource) || { type: 'ablesci' };
    const setJournalSource = (0, store_1.useStore)((state) => state.setJournalSource);
    const handleChange = (e) => {
        const val = e.target.value;
        setJournalSource({ type: val });
        (0, vscode_1.postMessage)({
            type: 'save-general-settings',
            settings: {
                journalSource: { type: val }
            }
        });
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Network, { className: "w-4 h-4 text-purple-400" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u671F\u520A\u6570\u636E\u6E90" })] }), (0, jsx_runtime_1.jsx)("div", { className: "p-3.5", children: (0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsxs)("select", { className: "w-full px-3 py-2 text-xs rounded-md border border-border outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer pr-10", style: {
                                backgroundColor: 'var(--bg-section)',
                                color: 'var(--text-primary)',
                                borderColor: 'var(--border)'
                            }, value: journalSource?.type || 'ablesci', onChange: handleChange, children: [(0, jsx_runtime_1.jsx)("option", { value: "ablesci", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "\u79D1\u7814\u901A\u6570\u636E\u6E90 (\u6700\u65B0\u5F71\u54CD\u56E0\u5B50 & \u65B0\u9510\u5206\u533A)" }), (0, jsx_runtime_1.jsx)("option", { value: "letpub", style: { backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }, children: "LetPub \u6570\u636E\u6E90 (\u5386\u53F2\u5F71\u54CD\u56E0\u5B50 & \u4E2D\u79D1\u9662\u5206\u533A)" })] }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60 pointer-events-none" })] }) })] }));
};
// ── LayoutSettings ──
const LayoutSettings = () => {
    const defaultEndpoint = 'http://127.0.0.1:8765/layout';
    const layoutConfig = (0, store_1.useStore)((state) => state.layoutConfig) || { useModel: false, modelEndpoint: '', timeoutMs: 3500, hoverHighlightStyle: 'overlay', theme: 'auto' };
    const [useModel, setUseModel] = (0, react_1.useState)(layoutConfig?.useModel ?? false);
    const [modelEndpoint, setModelEndpoint] = (0, react_1.useState)(layoutConfig?.modelEndpoint ?? '');
    const [timeoutMs, setTimeoutMs] = (0, react_1.useState)(String(layoutConfig?.timeoutMs ?? 3500));
    const [hoverHighlightStyle, setHoverHighlightStyle] = (0, react_1.useState)(layoutConfig?.hoverHighlightStyle ?? 'overlay');
    const [theme, setTheme] = (0, react_1.useState)(layoutConfig?.theme ?? 'auto');
    const [saved, setSaved] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setUseModel(layoutConfig?.useModel ?? false);
        setModelEndpoint(layoutConfig?.modelEndpoint ?? '');
        setTimeoutMs(String(layoutConfig?.timeoutMs ?? 3500));
        setHoverHighlightStyle(layoutConfig?.hoverHighlightStyle ?? 'overlay');
        setTheme(layoutConfig?.theme ?? 'auto');
    }, [layoutConfig?.useModel, layoutConfig?.modelEndpoint, layoutConfig?.timeoutMs, layoutConfig?.hoverHighlightStyle, layoutConfig?.theme]);
    const handleSave = () => {
        const timeout = Number(timeoutMs);
        const normalizedTimeout = Number.isFinite(timeout)
            ? Math.max(500, Math.min(20000, Math.round(timeout)))
            : 3500;
        const normalizedEndpoint = useModel
            ? (modelEndpoint.trim() || defaultEndpoint)
            : modelEndpoint.trim();
        (0, vscode_1.postMessage)({
            type: 'save-general-settings',
            settings: {
                layout: {
                    useModel,
                    modelEndpoint: normalizedEndpoint,
                    timeoutMs: normalizedTimeout,
                    hoverHighlightStyle,
                    theme
                }
            }
        });
        if (useModel && !modelEndpoint.trim()) {
            setModelEndpoint(defaultEndpoint);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Bot, { className: "w-4 h-4 text-accent" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u7248\u9762\u89E3\u6790" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-3.5 flex flex-col gap-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Info, { className: "w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" }), (0, jsx_runtime_1.jsx)("p", { children: "\u9ED8\u8BA4\u4F7F\u7528\u5185\u7F6E\u89C4\u5219\u5F15\u64CE\u3002\u4FDD\u5B58\u540E\uFF1A\u5F00\u542F\u6A21\u578B\u4F1A\u81EA\u52A8\u542F\u52A8\u672C\u5730\u7248\u9762\u670D\u52A1\uFF0C\u5173\u95ED\u6A21\u578B\u4F1A\u81EA\u52A8\u505C\u6B62\uFF1B\u8BF7\u6C42\u5931\u8D25\u65F6\u81EA\u52A8\u56DE\u9000\u89C4\u5219\u5F15\u64CE\u3002" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs text-foreground font-medium", children: "\u542F\u7528\u7248\u9762\u5206\u6790\u6A21\u578B" }), (0, jsx_runtime_1.jsxs)("label", { className: "relative inline-flex items-center cursor-pointer select-none", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", className: "sr-only peer", checked: useModel, onChange: (e) => setUseModel(e.target.checked) }), (0, jsx_runtime_1.jsx)("div", { className: "w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: "\u6A21\u578B\u7AEF\u70B9 (HTTP)" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", placeholder: "http://127.0.0.1:8765/layout", value: modelEndpoint, onChange: (e) => setModelEndpoint(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: "\u8D85\u65F6\u65F6\u95F4 (ms)" }), (0, jsx_runtime_1.jsx)("input", { type: "number", min: 500, max: 20000, step: 100, className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", value: timeoutMs, onChange: (e) => setTimeoutMs(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: "\u60AC\u505C\u9AD8\u4EAE\u6837\u5F0F" }), (0, jsx_runtime_1.jsxs)("select", { className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono", value: hoverHighlightStyle, onChange: (e) => setHoverHighlightStyle(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "overlay", children: "\u534A\u900F\u660E\u5757 (overlay)" }), (0, jsx_runtime_1.jsx)("option", { value: "bar", children: "\u5DE6\u4FA7\u7AD6\u7EBF (bar)" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: "\u9605\u8BFB\u5668\u80CC\u666F\u4E3B\u9898" }), (0, jsx_runtime_1.jsxs)("select", { className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono", value: theme, onChange: (e) => setTheme(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "auto", children: "\u8DDF\u968F VS Code \u4E3B\u9898 (auto)" }), (0, jsx_runtime_1.jsx)("option", { value: "dark", children: "\u7425\u73C0\u6DF1\u8910 (Cozy Warm Dark)" }), (0, jsx_runtime_1.jsx)("option", { value: "light", children: "\u6625\u8749\u6696\u6728 (Spring Cicada Light)" })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex justify-end", children: (0, jsx_runtime_1.jsxs)("button", { onClick: handleSave, className: `flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'}`, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-3.5 h-3.5" }), saved ? '已保存' : '保存版面设置'] }) })] })] }));
};
// ── GeneralSettings ──
const GeneralSettings = () => {
    const cacheMaxSize = (0, store_1.useStore)((state) => state.cacheMaxSize) ?? 500;
    const cacheSize = (0, store_1.useStore)((state) => state.cacheSize) ?? 0;
    const handleClearCache = () => {
        if (confirm(`确认要清空当前的 ${cacheSize} 条本地翻译缓存吗？`)) {
            (0, vscode_1.postMessage)({ type: 'clear-cache' });
        }
    };
    const handleClearHistory = () => {
        if (confirm('确认要清空所有翻译历史记录吗？')) {
            (0, vscode_1.postMessage)({ type: 'clear-history' });
        }
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Settings, { className: "w-4 h-4 text-secondary-foreground/80" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u7CFB\u7EDF\u7EF4\u62A4\u4E0E\u7F13\u5B58" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-3.5 flex flex-col gap-3.5", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center text-xs", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-secondary-foreground", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Database, { className: "w-4 h-4 opacity-70" }), (0, jsx_runtime_1.jsx)("span", { children: "\u5F53\u524D\u5DF2\u7F13\u5B58\u7FFB\u8BD1:" })] }), (0, jsx_runtime_1.jsxs)("span", { className: "font-mono font-bold bg-secondary/65 px-2 py-0.5 rounded border border-border", children: [cacheSize, " \u6761"] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center text-xs", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-secondary-foreground", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Database, { className: "w-4 h-4 opacity-70" }), (0, jsx_runtime_1.jsx)("span", { children: "\u672C\u5730\u7F13\u5B58\u4E0A\u9650:" })] }), (0, jsx_runtime_1.jsxs)("span", { className: "font-mono font-bold bg-secondary/65 px-2 py-0.5 rounded border border-border", children: [cacheMaxSize, " \u6761"] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2.5 mt-1.5", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: handleClearCache, className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-3.5 h-3.5" }), "\u6E05\u7A7A\u7FFB\u8BD1\u7F13\u5B58"] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleClearHistory, className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-3.5 h-3.5" }), "\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55"] })] })] })] }));
};
// ── BuildInfo ──
const BuildInfo = () => {
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Info, { className: "w-4 h-4 text-secondary-foreground/80" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase", children: "\u7248\u672C\u4FE1\u606F" })] }), (0, jsx_runtime_1.jsx)("div", { className: "p-3.5", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-2 text-xs text-secondary-foreground font-mono", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between", children: [(0, jsx_runtime_1.jsx)("span", { children: "Version" }), (0, jsx_runtime_1.jsx)("span", { className: "text-foreground", children: build_info_1.BUILD_INFO.version })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between", children: [(0, jsx_runtime_1.jsx)("span", { children: "Git" }), (0, jsx_runtime_1.jsx)("span", { className: "text-foreground", children: build_info_1.BUILD_INFO.hash })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between", children: [(0, jsx_runtime_1.jsx)("span", { children: "Build" }), (0, jsx_runtime_1.jsx)("span", { className: "text-foreground", children: build_info_1.BUILD_INFO.date || 'dev' })] })] }) })] }));
};
// ── MineruSettings ──
const MineruSettings = () => {
    const mineruConfig = (0, store_1.useStore)((state) => state.mineruConfig) || { enable: false, apiType: 'agent', token: '' };
    const [enable, setEnable] = (0, react_1.useState)(mineruConfig.enable ?? false);
    const [apiType, setApiType] = (0, react_1.useState)(mineruConfig.apiType ?? 'agent');
    const [token, setToken] = (0, react_1.useState)(mineruConfig.token ?? '');
    const [saved, setSaved] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setEnable(mineruConfig.enable ?? false);
        setApiType(mineruConfig.apiType ?? 'agent');
        setToken(mineruConfig.token ?? '');
    }, [mineruConfig.enable, mineruConfig.apiType, mineruConfig.token]);
    const handleSave = () => {
        (0, vscode_1.postMessage)({
            type: 'save-general-settings',
            settings: {
                mineru: {
                    enable,
                    apiType,
                    token
                }
            }
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };
    return ((0, jsx_runtime_1.jsxs)("section", { className: "glass-panel rounded-lg overflow-hidden border border-border shadow-sm", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-4 h-4 text-accent" }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase font-medium", children: "MinerU AI \u589E\u5F3A\u91CD\u6784" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-3.5 flex flex-col gap-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Info, { className: "w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" }), (0, jsx_runtime_1.jsx)("p", { children: "\u5F00\u542F MinerU AI \u6587\u6863\u91CD\u6784\u540E\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u5728\u540E\u53F0\u5C06 PDF \u8F6C\u6362\u4E3A\u9AD8\u7CBE\u5EA6\u7684 Markdown\uFF0C\u5B8C\u7F8E\u8FD8\u539F\u6570\u5B66\u516C\u5F0F\uFF08LaTeX\uFF09\u4E0E\u8868\u683C\u3002" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs text-foreground font-medium", children: "\u542F\u7528 MinerU AI \u91CD\u6784\u6392\u7248" }), (0, jsx_runtime_1.jsxs)("label", { className: "relative inline-flex items-center cursor-pointer select-none", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", className: "sr-only peer", checked: enable, onChange: (e) => setEnable(e.target.checked) }), (0, jsx_runtime_1.jsx)("div", { className: "w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: "API \u7C7B\u578B" }), (0, jsx_runtime_1.jsxs)("select", { className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono", value: apiType, onChange: (e) => setApiType(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "agent", children: "Agent \u514D Token \u4F53\u9A8C\u7248 (\u2264 20\u9875 / 10MB)" }), (0, jsx_runtime_1.jsx)("option", { value: "standard", children: "Standard \u7CBE\u51C6\u89E3\u6790\u7248 (\u652F\u6301\u6700\u5927 200\u9875 / 200MB)" })] })] }), apiType === 'standard' && ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-1.5 animate-in slide-in-from-top-1 duration-150", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase", children: "API Token" }), (0, jsx_runtime_1.jsx)("input", { type: "password", className: "w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono", placeholder: "\u4ECE mineru.net \u7533\u8BF7\u7684 API Token", value: token, onChange: (e) => setToken(e.target.value) })] })), (0, jsx_runtime_1.jsx)("div", { className: "flex justify-end", children: (0, jsx_runtime_1.jsxs)("button", { onClick: handleSave, className: `flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'}`, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-3.5 h-3.5" }), saved ? '已保存' : '保存设置'] }) })] })] }));
};
//# sourceMappingURL=SettingsTab.js.map