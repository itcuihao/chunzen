import { FunctionComponent } from 'preact';
import { currentTranslation, isTranslating, translationError, translationHistory } from '../state/translation';

export const TranslationTab: FunctionComponent = () => {
  const result = currentTranslation.value;
  const loading = isTranslating.value;
  const error = translationError.value;

  return (
    <div class="tab-panel translation-tab">
      <section class="panel-section">
        <div class="section-header">
          <span class="section-title">原文</span>
        </div>
        <div class="section-content">
          {result ? (
            <p class="original-text">{result.original}</p>
          ) : (
            <p class="empty-state">悬停论文句子后显示原文</p>
          )}
        </div>
      </section>

      <div class="section-divider" />

      <section class="panel-section">
        <div class="section-header">
          <span class="section-title">中文翻译</span>
          {result && (
            <span class={`engine-badge ${result.cached ? 'cached' : ''}`}>
              {result.engine}{result.cached ? ' (缓存)' : ''}
            </span>
          )}
        </div>
        <div class="section-content">
          {loading ? (
            <div class="loading-indicator">翻译中...</div>
          ) : error ? (
            <p class="error-text">{error}</p>
          ) : result ? (
            <p class="translation-text">{result.translated}</p>
          ) : (
            <p class="empty-state">翻译结果将在此显示</p>
          )}
        </div>
      </section>

      {translationHistory.value.length > 0 && (
        <>
          <div class="section-divider" />
          <TranslationHistory />
        </>
      )}
    </div>
  );
};

const TranslationHistory: FunctionComponent = () => {
  return (
    <section class="panel-section">
      <div class="section-header">
        <span class="section-title">翻译历史</span>
        <span class="history-count">{translationHistory.value.length}</span>
      </div>
      <div class="history-list">
        {translationHistory.value.slice(0, 20).map((entry, i) => (
          <div key={i} class="history-item">
            <p class="history-original">{entry.original}</p>
            <p class="history-translated">{entry.translated}</p>
            <span class="history-meta">{entry.engine}</span>
          </div>
        ))}
      </div>
    </section>
  );
};