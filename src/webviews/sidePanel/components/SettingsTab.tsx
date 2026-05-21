import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { engineStatuses, enginePriority, journalSource, cacheMaxSize, engineConfigs, testResults, EngineConfigFields } from '../state/settings';
import { postMessage } from '../vscode';

export const SettingsTab: FunctionComponent = () => {
  return (
    <div class="tab-panel settings-tab">
      <EngineSettings />
      <div class="section-divider" />
      <JournalSourceSettings />
      <div class="section-divider" />
      <GeneralSettings />
    </div>
  );
};

// ── Engine config field definitions ──

interface EngineField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'toggle' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

const engineFields: Record<string, EngineField[]> = {
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
    { key: 'model', label: '模型', type: 'text', placeholder: 'gpt-4o-mini' },
    { key: 'systemPrompt', label: '系统提示词', type: 'textarea', placeholder: '翻译提示词...' }
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

const engineDisplayNames: Record<string, string> = {
  baidu: '百度翻译',
  deepl: 'DeepL',
  openai: 'AI 翻译 (OpenAI/Gemini)',
  custom: '自定义 HTTP 接口',
  claudeCli: 'Claude CLI'
};

// ── EngineSettings ──

const EngineSettings: FunctionComponent = () => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const handleTest = (engineName: string) => {
    setTesting(engineName);
    postMessage({ type: 'test-engine', engineName });
  };

  const handleSave = (engineName: string, config: Record<string, string>) => {
    postMessage({ type: 'save-engine-config', engineName, config });
  };

  return (
    <section class="panel-section">
      <div class="section-header">
        <span class="section-title">翻译引擎</span>
      </div>
      <p class="settings-hint">配置翻译引擎的 API Key。引擎按优先级顺序降级使用。</p>
      <div class="engine-list">
        {enginePriority.value.map((name, i) => {
          const status = engineStatuses.value.find(e => e.name === name);
          const isExpanded = expanded === name;
          const isTesting = testing === name;
          const testResult = testResults.value[name];

          return (
            <div key={name} class={`engine-card ${isExpanded ? 'expanded' : ''}`}>
              <div class="engine-card-header" onClick={() => setExpanded(isExpanded ? null : name)}>
                <div class="engine-info">
                  <span class="engine-priority-num">{i + 1}</span>
                  <div>
                    <span class="engine-name">{status?.displayName || name}</span>
                    <span class={`engine-status ${status?.configured ? 'configured' : 'unconfigured'}`}>
                      {status?.configured ? '已配置' : '未配置'}
                    </span>
                  </div>
                </div>
                <span class="engine-expand-arrow">{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <EngineConfigForm
                  engineName={name}
                  config={engineConfigs.value[name] || {}}
                  fields={engineFields[name] || []}
                  onSave={(config) => handleSave(name, config)}
                  onTest={() => handleTest(name)}
                  isTesting={isTesting}
                  testResult={testResult}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

// ── EngineConfigForm ──

interface EngineConfigFormProps {
  engineName: string;
  config: EngineConfigFields;
  fields: EngineField[];
  onSave: (config: Record<string, string>) => void;
  onTest: () => void;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null | undefined;
}

const EngineConfigForm: FunctionComponent<EngineConfigFormProps> = ({
  engineName,
  config,
  fields,
  onSave,
  onTest,
  isTesting,
  testResult
}) => {
  const [formState, setFormState] = useState<Record<string, string | boolean>>({});
  const [saved, setSaved] = useState(false);

  // Initialize form state from config
  const formValues: Record<string, string | boolean> = {};
  for (const field of fields) {
    formValues[field.key] = formState[field.key] !== undefined
      ? formState[field.key]
      : (config as Record<string, string | boolean>)[field.key] ?? (field.type === 'toggle' ? false : '');
  }

  const handleChange = (key: string, value: string | boolean) => {
    setFormState(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveClick = () => {
    // Collect changed values
    const values: Record<string, string> = {};
    for (const field of fields) {
      const val = formState[field.key] !== undefined ? formState[field.key] : (config as Record<string, string | boolean>)[field.key];
      if (field.type === 'toggle') {
        values[field.key] = String(Boolean(val));
      } else {
        values[field.key] = String(val ?? '');
      }
    }
    onSave(values);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div class="engine-config-form">
      {fields.map(field => (
        <div key={field.key} class="config-field">
          <label class="config-label">{field.label}</label>
          {field.type === 'toggle' ? (
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={Boolean(formValues[field.key])}
                onChange={e => handleChange(field.key, (e.target as HTMLInputElement).checked)}
              />
              <span class="toggle-slider"></span>
            </label>
          ) : field.type === 'textarea' ? (
            <textarea
              class="config-input config-textarea"
              placeholder={field.placeholder}
              value={String(formValues[field.key] ?? '')}
              onInput={e => handleChange(field.key, (e.target as HTMLTextAreaElement).value)}
              rows={3}
            />
          ) : (
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              class="config-input"
              placeholder={field.placeholder}
              value={String(formValues[field.key] ?? '')}
              onInput={e => handleChange(field.key, (e.target as HTMLInputElement).value)}
            />
          )}
        </div>
      ))}

      <div class="config-actions">
        <button class="btn btn-primary" onClick={handleSaveClick}>
          {saved ? '已保存' : '保存配置'}
        </button>
        <button class="btn btn-secondary" onClick={onTest} disabled={isTesting}>
          {isTesting ? '测试中...' : '测试连接'}
        </button>
      </div>

      {testResult && (
        <div class={`test-result ${testResult.success ? 'success' : 'error'}`}>
          {testResult.message}
        </div>
      )}
    </div>
  );
};

// ── JournalSourceSettings ──

const JournalSourceSettings: FunctionComponent = () => {
  const handleChange = (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    journalSource.value = { type: value };
  };

  return (
    <section class="panel-section">
      <div class="section-header">
        <span class="section-title">期刊信息来源</span>
      </div>
      <select
        class="settings-select"
        value={journalSource.value.type}
        onChange={handleChange}
      >
        <option value="letpub">LetPub (免费)</option>
        <option value="crossref">CrossRef API</option>
      </select>
    </section>
  );
};

// ── GeneralSettings ──

const GeneralSettings: FunctionComponent = () => {
  const handleClearCache = () => postMessage({ type: 'clear-cache' });
  const handleClearHistory = () => postMessage({ type: 'clear-history' });

  return (
    <section class="panel-section">
      <div class="section-header">
        <span class="section-title">通用</span>
      </div>
      <div class="settings-row">
        <span class="settings-label">翻译缓存: {cacheMaxSize.value} 条</span>
      </div>
      <div class="settings-actions">
        <button class="btn btn-secondary" onClick={handleClearCache}>清除翻译缓存</button>
        <button class="btn btn-secondary" onClick={handleClearHistory}>清除翻译历史</button>
      </div>
    </section>
  );
};