import { FunctionComponent } from 'react';
import { useEffect, useCallback } from 'react';
import { onMessage, postMessage } from './vscode';
import { ExtToPanelMessage, InitStateMessage } from '../../types/messages';
import { useStore } from './store';
import { TabBar } from './components/TabBar';
import { TranslationTab } from './components/TranslationTab';
import { JournalTab } from './components/JournalTab';
import { GlossaryTab } from './components/GlossaryTab';
import { SettingsTab } from './components/SettingsTab';

export const App: FunctionComponent = () => {
  const activeTab = useStore((state) => state.activeTab);
  
  const setCurrentTranslation = useStore((state) => state.setCurrentTranslation);
  const setIsTranslating = useStore((state) => state.setIsTranslating);
  const setTranslationError = useStore((state) => state.setTranslationError);
  const setTranslationHistory = useStore((state) => state.setTranslationHistory);
  const setJournalInfo = useStore((state) => state.setJournalInfo);
  const setEngineStatuses = useStore((state) => state.setEngineStatuses);
  const setTestResultForEngine = useStore((state) => state.setTestResultForEngine);
  const setGlossaryTerms = useStore((state) => state.setGlossaryTerms);
  
  const setEnginePriority = useStore((state) => state.setEnginePriority);
  const setEngineConfigs = useStore((state) => state.setEngineConfigs);
  const setJournalSource = useStore((state) => state.setJournalSource);
  const setCacheMaxSize = useStore((state) => state.setCacheMaxSize);

  const handleInitState = useCallback((msg: InitStateMessage) => {
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

  const handleMessage = useCallback((msg: ExtToPanelMessage) => {
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
        useStore.setState((state) => ({
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

  useEffect(() => {
    const cleanup = onMessage(handleMessage);
    postMessage({ type: 'request-state' });
    return cleanup;
  }, [handleMessage]);

  return (
    <div className="panel-app flex flex-col h-screen overflow-hidden text-foreground bg-background select-none">
      <TabBar />
      <div className="tab-content flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'translation' && <TranslationTab />}
        {activeTab === 'journal' && <JournalTab />}
        {activeTab === 'glossary' && <GlossaryTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
};