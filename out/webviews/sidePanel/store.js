"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStore = void 0;
const zustand_1 = require("zustand");
exports.useStore = (0, zustand_1.create)((set) => ({
    // UI State initial
    activeTab: 'translation',
    setActiveTab: (activeTab) => set({ activeTab }),
    activeParagraphId: null,
    setActiveParagraphId: (activeParagraphId) => set({ activeParagraphId }),
    // Translation State initial
    currentTranslation: null,
    setCurrentTranslation: (currentTranslation) => set({ currentTranslation }),
    translationHistory: [],
    setTranslationHistory: (translationHistory) => set({ translationHistory }),
    isTranslating: false,
    setIsTranslating: (isTranslating) => set({ isTranslating }),
    translationError: '',
    setTranslationError: (translationError) => set({ translationError }),
    currentPageText: null,
    setCurrentPageText: (currentPageText) => set({ currentPageText }),
    setCurrentPageTranslation: (translations) => set((state) => ({
        currentPageText: state.currentPageText
            ? { ...state.currentPageText, translations }
            : null
    })),
    // Journal State initial
    journalInfo: null,
    setJournalInfo: (journalInfo) => set({ journalInfo }),
    // Glossary State initial
    glossaryTerms: [],
    setGlossaryTerms: (glossaryTerms) => set({ glossaryTerms }),
    glossaryFilter: '',
    setGlossaryFilter: (glossaryFilter) => set({ glossaryFilter }),
    editingTermId: null,
    setEditingTermId: (editingTermId) => set({ editingTermId }),
    // Settings State initial
    engineStatuses: [],
    setEngineStatuses: (engineStatuses) => set({ engineStatuses }),
    enginePriority: [],
    setEnginePriority: (enginePriority) => set({ enginePriority }),
    engineConfigs: {},
    setEngineConfigs: (engineConfigs) => set({ engineConfigs }),
    journalSource: { type: 'letpub' },
    setJournalSource: (journalSource) => set({ journalSource }),
    cacheMaxSize: 500,
    setCacheMaxSize: (cacheMaxSize) => set({ cacheMaxSize }),
    cacheSize: 0,
    setCacheSize: (cacheSize) => set({ cacheSize }),
    layoutConfig: {
        useModel: false,
        modelEndpoint: '',
        timeoutMs: 3500,
        hoverHighlightStyle: 'overlay',
        theme: 'auto'
    },
    setLayoutConfig: (layoutConfig) => set({ layoutConfig }),
    testResults: {},
    setTestResults: (testResults) => set({ testResults }),
    setTestResultForEngine: (engineName, success, message) => set((state) => ({
        testResults: {
            ...state.testResults,
            [engineName]: { success, message }
        }
    })),
    layoutMode: 'original',
    setLayoutMode: (layoutMode) => set({ layoutMode }),
    exportProgress: null,
    setExportProgress: (exportProgress) => set({ exportProgress }),
    bibliography: {},
    setBibliography: (bibliography) => set({ bibliography }),
    activePdfUri: null,
    setActivePdfUri: (activePdfUri) => set({ activePdfUri }),
    highlights: [],
    setHighlights: (highlights) => set({ highlights }),
    aiExplainResult: null,
    setAiExplainResult: (aiExplainResult) => set({ aiExplainResult }),
    mineruConfig: {
        enable: false,
        apiType: 'agent',
        token: ''
    },
    setMineruConfig: (mineruConfig) => set({ mineruConfig }),
    mineruMarkdown: null,
    setMineruMarkdown: (mineruMarkdown) => set({ mineruMarkdown }),
    mineruStatus: 'idle',
    setMineruStatus: (mineruStatus) => set({ mineruStatus }),
    mineruProgress: 0,
    setMineruProgress: (mineruProgress) => set({ mineruProgress }),
    mineruError: null,
    setMineruError: (mineruError) => set({ mineruError })
}));
//# sourceMappingURL=store.js.map