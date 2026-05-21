import { FunctionComponent } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import { onMessage, postMessage } from './vscode';
import { ExtToPanelMessage, InitStateMessage } from '../../types/messages';
import { currentTranslation, translationError, translationHistory, isTranslating } from './state/translation';
import { journalInfo } from './state/journal';
import { glossaryTerms } from './state/glossary';
import { engineStatuses, enginePriority, engineConfigs, journalSource, cacheMaxSize, testResults } from './state/settings';
import { TabBar } from './components/TabBar';
import { TranslationTab } from './components/TranslationTab';
import { JournalTab } from './components/JournalTab';
import { GlossaryTab } from './components/GlossaryTab';
import { SettingsTab } from './components/SettingsTab';
import { activeTab } from './state/ui';

export const App: FunctionComponent = () => {
  const handleMessage = useCallback((msg: ExtToPanelMessage) => {
    switch (msg.type) {
      case 'init-state':
        handleInitState(msg);
        break;
      case 'translate-result':
        currentTranslation.value = {
          original: msg.original,
          translated: msg.translated,
          engine: msg.engine,
          cached: msg.cached
        };
        isTranslating.value = false;
        translationError.value = '';
        // Add to history
        translationHistory.value = [
          { original: msg.original, translated: msg.translated, engine: msg.engine, timestamp: Date.now() },
          ...translationHistory.value
        ].slice(0, 50);
        break;
      case 'translate-error':
        isTranslating.value = false;
        translationError.value = msg.message;
        currentTranslation.value = null;
        break;
      case 'update-journal':
        journalInfo.value = msg.info;
        break;
      case 'loading':
        isTranslating.value = true;
        translationError.value = '';
        break;
      case 'error':
        isTranslating.value = false;
        translationError.value = msg.message;
        break;
      case 'clear':
        currentTranslation.value = null;
        translationError.value = '';
        isTranslating.value = false;
        break;
      case 'engines-status':
        engineStatuses.value = msg.engines;
        break;
      case 'engine-test-result':
        testResults.value = { ...testResults.value, [msg.engineName]: { success: msg.success, message: msg.message } };
        break;
      case 'glossary-sync':
        glossaryTerms.value = msg.terms;
        break;
      case 'history-sync':
        translationHistory.value = msg.history;
        break;
    }
  }, []);

  useEffect(() => {
    const cleanup = onMessage(handleMessage);
    postMessage({ type: 'request-state' });
    return cleanup;
  }, [handleMessage]);

  return (
    <div class="panel-app">
      <TabBar />
      <div class="tab-content">
        {activeTab.value === 'translation' && <TranslationTab />}
        {activeTab.value === 'journal' && <JournalTab />}
        {activeTab.value === 'glossary' && <GlossaryTab />}
        {activeTab.value === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
};

function handleInitState(msg: InitStateMessage) {
  glossaryTerms.value = msg.glossary;
  translationHistory.value = msg.history;
  engineStatuses.value = msg.engines;
  enginePriority.value = msg.priority;
  engineConfigs.value = msg.engineConfigs;
  journalSource.value = msg.journalSource;
  cacheMaxSize.value = msg.cacheMaxSize;
}