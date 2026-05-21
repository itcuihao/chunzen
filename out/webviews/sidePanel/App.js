"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const vscode_1 = require("./vscode");
const store_1 = require("./store");
const TabBar_1 = require("./components/TabBar");
const TranslationTab_1 = require("./components/TranslationTab");
const JournalTab_1 = require("./components/JournalTab");
const GlossaryTab_1 = require("./components/GlossaryTab");
const SettingsTab_1 = require("./components/SettingsTab");
const App = () => {
    const activeTab = (0, store_1.useStore)((state) => state.activeTab);
    const setCurrentTranslation = (0, store_1.useStore)((state) => state.setCurrentTranslation);
    const setIsTranslating = (0, store_1.useStore)((state) => state.setIsTranslating);
    const setTranslationError = (0, store_1.useStore)((state) => state.setTranslationError);
    const setTranslationHistory = (0, store_1.useStore)((state) => state.setTranslationHistory);
    const setJournalInfo = (0, store_1.useStore)((state) => state.setJournalInfo);
    const setEngineStatuses = (0, store_1.useStore)((state) => state.setEngineStatuses);
    const setTestResultForEngine = (0, store_1.useStore)((state) => state.setTestResultForEngine);
    const setGlossaryTerms = (0, store_1.useStore)((state) => state.setGlossaryTerms);
    const setEnginePriority = (0, store_1.useStore)((state) => state.setEnginePriority);
    const setEngineConfigs = (0, store_1.useStore)((state) => state.setEngineConfigs);
    const setJournalSource = (0, store_1.useStore)((state) => state.setJournalSource);
    const setCacheMaxSize = (0, store_1.useStore)((state) => state.setCacheMaxSize);
    const handleInitState = (0, react_1.useCallback)((msg) => {
        setGlossaryTerms(msg.glossary);
        setTranslationHistory(msg.history);
        setEngineStatuses(msg.engines);
        setEnginePriority(msg.priority);
        setEngineConfigs(msg.engineConfigs);
        setJournalSource(msg.journalSource);
        setCacheMaxSize(msg.cacheMaxSize);
    }, [
        setGlossaryTerms,
        setTranslationHistory,
        setEngineStatuses,
        setEnginePriority,
        setEngineConfigs,
        setJournalSource,
        setCacheMaxSize
    ]);
    const handleMessage = (0, react_1.useCallback)((msg) => {
        switch (msg.type) {
            case 'init-state':
                handleInitState(msg);
                break;
            case 'translate-result':
                setCurrentTranslation({
                    original: msg.original,
                    translated: msg.translated,
                    engine: msg.engine,
                    cached: msg.cached
                });
                setIsTranslating(false);
                setTranslationError('');
                // Add to history
                store_1.useStore.setState((state) => ({
                    translationHistory: [
                        { original: msg.original, translated: msg.translated, engine: msg.engine, timestamp: Date.now() },
                        ...state.translationHistory
                    ].slice(0, 50)
                }));
                break;
            case 'translate-error':
                setIsTranslating(false);
                setTranslationError(msg.message);
                setCurrentTranslation(null);
                break;
            case 'update-journal':
                setJournalInfo(msg.info);
                break;
            case 'loading':
                setIsTranslating(true);
                setTranslationError('');
                break;
            case 'error':
                setIsTranslating(false);
                setTranslationError(msg.message);
                break;
            case 'clear':
                setCurrentTranslation(null);
                setTranslationError('');
                setIsTranslating(false);
                break;
            case 'engines-status':
                setEngineStatuses(msg.engines);
                break;
            case 'engine-test-result':
                setTestResultForEngine(msg.engineName, msg.success, msg.message);
                break;
            case 'glossary-sync':
                setGlossaryTerms(msg.terms);
                break;
            case 'history-sync':
                setTranslationHistory(msg.history);
                break;
        }
    }, [
        handleInitState,
        setCurrentTranslation,
        setIsTranslating,
        setTranslationError,
        setJournalInfo,
        setEngineStatuses,
        setTestResultForEngine,
        setGlossaryTerms,
        setTranslationHistory
    ]);
    (0, react_1.useEffect)(() => {
        const cleanup = (0, vscode_1.onMessage)(handleMessage);
        (0, vscode_1.postMessage)({ type: 'request-state' });
        return cleanup;
    }, [handleMessage]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "panel-app flex flex-col h-screen overflow-hidden text-foreground bg-background select-none", children: [(0, jsx_runtime_1.jsx)(TabBar_1.TabBar, {}), (0, jsx_runtime_1.jsxs)("div", { className: "tab-content flex-1 overflow-y-auto px-4 py-3", children: [activeTab === 'translation' && (0, jsx_runtime_1.jsx)(TranslationTab_1.TranslationTab, {}), activeTab === 'journal' && (0, jsx_runtime_1.jsx)(JournalTab_1.JournalTab, {}), activeTab === 'glossary' && (0, jsx_runtime_1.jsx)(GlossaryTab_1.GlossaryTab, {}), activeTab === 'settings' && (0, jsx_runtime_1.jsx)(SettingsTab_1.SettingsTab, {})] })] }));
};
exports.App = App;
//# sourceMappingURL=App.js.map