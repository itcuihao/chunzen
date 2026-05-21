"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStore = void 0;
const zustand_1 = require("zustand");
exports.useStore = (0, zustand_1.create)((set) => ({
    // UI State initial
    activeTab: 'translation',
    setActiveTab: (activeTab) => set({ activeTab }),
    // Translation State initial
    currentTranslation: null,
    setCurrentTranslation: (currentTranslation) => set({ currentTranslation }),
    translationHistory: [],
    setTranslationHistory: (translationHistory) => set({ translationHistory }),
    isTranslating: false,
    setIsTranslating: (isTranslating) => set({ isTranslating }),
    translationError: '',
    setTranslationError: (translationError) => set({ translationError }),
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
    testResults: {},
    setTestResults: (testResults) => set({ testResults }),
    setTestResultForEngine: (engineName, success, message) => set((state) => ({
        testResults: {
            ...state.testResults,
            [engineName]: { success, message }
        }
    }))
}));
//# sourceMappingURL=store.js.map