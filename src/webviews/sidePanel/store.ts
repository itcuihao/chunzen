import { create } from 'zustand';
import { TranslationHistoryEntry, JournalInfo, GlossaryEntry } from '../../types/models';
export type TabId = 'translation' | 'journal' | 'glossary' | 'settings';

export type EngineStatus = {
  name: string;
  displayName: string;
  configured: boolean;
};

export interface EngineConfigFields {
  apiKey?: string;
  appId?: string;
  secretKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  freeApi?: boolean;
  enabled?: boolean;
  prompt?: string;
  url?: string;
  headers?: string;
  bodyTemplate?: string;
  responsePath?: string;
}

interface PanelState {
  // UI State
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  activeSentenceId: string | null;
  setActiveSentenceId: (id: string | null) => void;

  // Translation State
  currentTranslation: {
    original: string;
    translated: string;
    engine: string;
    cached: boolean;
  } | null;
  setCurrentTranslation: (val: PanelState['currentTranslation']) => void;
  translationHistory: TranslationHistoryEntry[];
  setTranslationHistory: (history: TranslationHistoryEntry[]) => void;
  isTranslating: boolean;
  setIsTranslating: (isTranslating: boolean) => void;
  translationError: string;
  setTranslationError: (err: string) => void;
  currentPageText: {
    pageNumber: number;
    paragraphs: Array<{ id: string; text: string; section?: 'header' | 'left' | 'right' | 'footer' | 'full' }>;
    columnsCount: number;
    translations?: Record<string, string>;
  } | null;
  setCurrentPageText: (val: {
    pageNumber: number;
    paragraphs: Array<{ id: string; text: string; section?: 'header' | 'left' | 'right' | 'footer' | 'full' }>;
    columnsCount: number;
    translations?: Record<string, string>;
  } | null) => void;
  setCurrentPageTranslation: (translations: Record<string, string>) => void;

  // Journal State
  journalInfo: JournalInfo | null;
  setJournalInfo: (info: JournalInfo | null) => void;

  // Glossary State
  glossaryTerms: GlossaryEntry[];
  setGlossaryTerms: (terms: GlossaryEntry[]) => void;
  glossaryFilter: string;
  setGlossaryFilter: (filter: string) => void;
  editingTermId: string | null;
  setEditingTermId: (id: string | null) => void;

  // Settings State
  engineStatuses: EngineStatus[];
  setEngineStatuses: (statuses: EngineStatus[]) => void;
  enginePriority: string[];
  setEnginePriority: (priority: string[]) => void;
  engineConfigs: Record<string, EngineConfigFields>;
  setEngineConfigs: (configs: Record<string, EngineConfigFields>) => void;
  journalSource: { type: string };
  setJournalSource: (source: { type: string }) => void;
  cacheMaxSize: number;
  setCacheMaxSize: (size: number) => void;
  testResults: Record<string, { success: boolean; message: string } | null>;
  setTestResults: (results: PanelState['testResults']) => void;
  setTestResultForEngine: (engineName: string, success: boolean, message: string) => void;
}

export const useStore = create<PanelState>((set) => ({
  // UI State initial
  activeTab: 'translation',
  setActiveTab: (activeTab) => set({ activeTab }),
  activeSentenceId: null,
  setActiveSentenceId: (activeSentenceId) => set({ activeSentenceId }),

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
  setCurrentPageTranslation: (translations) =>
    set((state) => ({
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
  testResults: {},
  setTestResults: (testResults) => set({ testResults }),
  setTestResultForEngine: (engineName, success, message) => 
    set((state) => ({
      testResults: {
        ...state.testResults,
        [engineName]: { success, message }
      }
    }))
}));
