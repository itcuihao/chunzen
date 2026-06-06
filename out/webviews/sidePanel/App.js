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
    const setCurrentPageText = (0, store_1.useStore)((state) => state.setCurrentPageText);
    const setCurrentPageTranslation = (0, store_1.useStore)((state) => state.setCurrentPageTranslation);
    const setEnginePriority = (0, store_1.useStore)((state) => state.setEnginePriority);
    const setEngineConfigs = (0, store_1.useStore)((state) => state.setEngineConfigs);
    const setJournalSource = (0, store_1.useStore)((state) => state.setJournalSource);
    const setCacheMaxSize = (0, store_1.useStore)((state) => state.setCacheMaxSize);
    const setCacheSize = (0, store_1.useStore)((state) => state.setCacheSize);
    const setLayoutConfig = (0, store_1.useStore)((state) => state.setLayoutConfig);
    const setMineruConfig = (0, store_1.useStore)((state) => state.setMineruConfig);
    const handleInitState = (0, react_1.useCallback)((msg) => {
        if (msg.glossary)
            setGlossaryTerms(msg.glossary);
        if (msg.history)
            setTranslationHistory(msg.history);
        if (msg.engines)
            setEngineStatuses(msg.engines);
        if (msg.priority)
            setEnginePriority(msg.priority);
        if (msg.engineConfigs)
            setEngineConfigs(msg.engineConfigs);
        if (msg.journalSource)
            setJournalSource(msg.journalSource);
        if (msg.cacheMaxSize !== undefined && msg.cacheMaxSize !== null)
            setCacheMaxSize(msg.cacheMaxSize);
        if (msg.cacheSize !== undefined && msg.cacheSize !== null)
            setCacheSize(msg.cacheSize);
        if (msg.layoutConfig)
            setLayoutConfig(msg.layoutConfig);
        if (msg.mineruConfig)
            setMineruConfig(msg.mineruConfig);
    }, [
        setGlossaryTerms,
        setTranslationHistory,
        setEngineStatuses,
        setEnginePriority,
        setEngineConfigs,
        setJournalSource,
        setCacheMaxSize,
        setCacheSize,
        setLayoutConfig,
        setMineruConfig
    ]);
    const layoutConfig = (0, store_1.useStore)((state) => state.layoutConfig);
    (0, react_1.useEffect)(() => {
        const themeSetting = layoutConfig?.theme || 'auto';
        if (themeSetting === 'dark') {
            document.body.classList.remove('theme-light');
            document.body.classList.add('theme-dark');
        }
        else if (themeSetting === 'light') {
            document.body.classList.remove('theme-dark');
            document.body.classList.add('theme-light');
        }
        else {
            document.body.classList.remove('theme-dark', 'theme-light');
        }
    }, [layoutConfig?.theme]);
    const handleMessage = (0, react_1.useCallback)((msg) => {
        switch (msg.type) {
            case 'init-state':
                handleInitState(msg);
                break;
            case 'translate-result':
                if (msg.cacheSize !== undefined && msg.cacheSize !== null) {
                    setCacheSize(msg.cacheSize);
                }
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
            case 'sync-page-text': {
                const transRecord = {};
                if (msg.translations) {
                    for (const item of msg.translations) {
                        transRecord[item.id] = item.translatedText;
                    }
                }
                setCurrentPageText({
                    pageNumber: msg.pageNumber,
                    paragraphs: msg.paragraphs,
                    columnsCount: msg.columnsCount,
                    translations: msg.translations ? transRecord : undefined
                });
                store_1.useStore.setState({ activeParagraphId: null });
                setIsTranslating(false);
                break;
            }
            case 'pdf-hover': {
                console.log('[Side Panel Webview] received pdf-hover with id:', msg.id);
                store_1.useStore.setState({ activeParagraphId: msg.id || null });
                break;
            }
            case 'cache-size-sync': {
                setCacheSize(msg.size);
                break;
            }
            case 'sync-page-translation': {
                const transRecord = {};
                for (const item of msg.translations) {
                    transRecord[item.id] = item.translatedText;
                }
                setCurrentPageTranslation(transRecord);
                setIsTranslating(false);
                break;
            }
            case 'sync-bibliography': {
                const bibRecord = {};
                for (const item of msg.bibliography) {
                    bibRecord[item.key] = { text: item.text, pageNumber: item.pageNumber };
                }
                store_1.useStore.getState().setBibliography(bibRecord);
                break;
            }
            case 'export-progress': {
                store_1.useStore.setState({ exportProgress: msg });
                break;
            }
            case 'set-active-pdf': {
                store_1.useStore.setState({
                    activePdfUri: msg.pdfUri,
                    mineruMarkdown: null,
                    mineruStatus: 'idle',
                    mineruProgress: 0,
                    mineruError: null
                });
                break;
            }
            case 'mineru-status': {
                store_1.useStore.setState({
                    mineruStatus: msg.status,
                    mineruProgress: msg.progress ?? 0,
                    mineruError: msg.status === 'failed' ? (msg.error ?? '解析出错') : null
                });
                break;
            }
            case 'mineru-complete': {
                store_1.useStore.setState({
                    mineruStatus: 'done',
                    mineruMarkdown: msg.markdown,
                    mineruError: null
                });
                break;
            }
            case 'sync-highlights': {
                store_1.useStore.setState({ highlights: msg.highlights });
                break;
            }
            case 'ai-explain-result': {
                store_1.useStore.setState({ aiExplainResult: msg });
                break;
            }
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
        setTranslationHistory,
        setCurrentPageText,
        setCurrentPageTranslation,
        setCacheSize
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