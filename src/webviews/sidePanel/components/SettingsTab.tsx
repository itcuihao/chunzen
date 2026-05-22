import { FunctionComponent, useState } from 'react';
import { useStore, EngineStatus, EngineConfigFields } from '../store';
import { postMessage } from '../vscode';
import { Database, Sparkles, Trash2, Settings, ChevronDown, ChevronUp, Network, Play, CheckCircle2, XCircle, Info, Lock, Eye, EyeOff } from 'lucide-react';
import { BUILD_INFO } from '../../../build-info';

export const SettingsTab: FunctionComponent = () => {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      <EngineSettings />
      <JournalSourceSettings />
      <GeneralSettings />
      <BuildInfo />
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
    { key: 'model', label: '模型名称', type: 'text', placeholder: 'gpt-4o-mini' },
    { key: 'systemPrompt', label: '系统提示词', type: 'textarea', placeholder: '你是一个学术翻译专家...' }
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

// ── EngineSettings ──

const EngineSettings: FunctionComponent = () => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const enginePriority = useStore((state) => state.enginePriority);
  const engineStatuses = useStore((state) => state.engineStatuses);
  const engineConfigs = useStore((state) => state.engineConfigs);
  const testResults = useStore((state) => state.testResults);

  const handleTest = (engineName: string) => {
    setTesting(engineName);
    postMessage({ type: 'test-engine', engineName });
    // Reset testing status after 5 seconds automatically in case response lags
    setTimeout(() => setTesting(null), 5000);
  };

  const handleSave = (engineName: string, config: Record<string, string>) => {
    postMessage({ type: 'save-engine-config', engineName, config });
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Sparkles className="w-4 h-4 text-accent animate-pulse" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">翻译引擎</span>
      </div>
      <div className="p-3.5">
        <div className="flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed mb-4">
          <Info className="w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" />
          <p>
            配置您的 API 密钥以启用翻译。春蝉会按照以下优先级顺序<b>依次向下查找可用引擎</b>。
          </p>
        </div>
        
        <div className="flex flex-col gap-2.5">
          {enginePriority.map((name, i) => {
            const status = engineStatuses.find((e) => e.name === name);
            const isExpanded = expanded === name;
            const isTesting = testing === name;
            const testResult = testResults[name];

            return (
              <div 
                key={name} 
                className={`rounded-lg border bg-card/10 overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'border-accent/40 shadow-sm ring-1 ring-accent/10' : 'border-border hover:border-border/80'
                }`}
              >
                <div 
                  className="flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-secondary/15 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : name)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold text-secondary-foreground bg-secondary px-2 py-1 rounded-full border border-border">
                      {i + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-foreground">
                        {status?.displayName || name}
                      </span>
                      <span className="text-[9px] text-secondary-foreground/60 mt-0.5 font-medium">
                        优先级第 {i + 1} 位
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      status?.configured 
                        ? 'bg-success/10 border-success/30 text-success' 
                        : 'bg-error/5 border-error/20 text-secondary-foreground/60'
                    }`}>
                      {status?.configured ? '已启用' : '未配置'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-secondary-foreground/60" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-secondary-foreground/60" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <EngineConfigForm
                    engineName={name}
                    config={engineConfigs[name] || {}}
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
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Initialize form state
  const formValues: Record<string, string | boolean> = {};
  for (const field of fields) {
    formValues[field.key] = formState[field.key] !== undefined
      ? formState[field.key]
      : (config as Record<string, string | boolean>)[field.key] ?? (field.type === 'toggle' ? false : '');
  }

  const handleChange = (key: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveClick = () => {
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
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-4 border-t border-border bg-card/5 flex flex-col gap-3.5 animate-in slide-in-from-top-1 duration-150">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            {field.label}
          </label>
          
          {field.type === 'toggle' ? (
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={Boolean(formValues[field.key])}
                onChange={(e) => handleChange(field.key, e.target.checked)}
              />
              <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          ) : field.type === 'textarea' ? (
            <textarea
              className="w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono resize-y min-h-[50px] leading-relaxed"
              placeholder={field.placeholder}
              value={String(formValues[field.key] ?? '')}
              onChange={(e) => handleChange(field.key, e.target.value)}
              rows={3}
            />
          ) : field.type === 'password' ? (
            <div className="relative flex items-center">
              <input
                type={showPasswords[field.key] ? 'text' : 'password'}
                className="w-full pl-3 pr-9 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                placeholder={field.placeholder}
                value={String(formValues[field.key] ?? '')}
                onChange={(e) => handleChange(field.key, e.target.value)}
              />
              <button 
                type="button"
                onClick={() => togglePasswordVisibility(field.key)}
                className="absolute right-2 text-secondary-foreground/50 hover:text-foreground p-1 rounded"
              >
                {showPasswords[field.key] ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <input
              type="text"
              className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
              placeholder={field.placeholder}
              value={String(formValues[field.key] ?? '')}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          )}
        </div>
      ))}

      <div className="flex gap-2 justify-end mt-1.5">
        <button 
          onClick={onTest} 
          disabled={isTesting}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors"
        >
          <Play className="w-3.5 h-3.5 text-accent" />
          {isTesting ? '正在测试...' : '测试连接'}
        </button>
        <button 
          onClick={handleSaveClick}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${
            saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {saved ? '配置已保存' : '保存配置'}
        </button>
      </div>

      {testResult && (
        <div className={`flex gap-2 items-start p-3 rounded-md border text-xs leading-relaxed animate-in fade-in duration-200 mt-1 ${
          testResult.success 
            ? 'bg-success/10 border-success/20 text-success' 
            : 'bg-error/10 border-error/20 text-error'
        }`}>
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-success" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-error" />
          )}
          <div className="flex-1 break-all font-mono">
            {testResult.message}
          </div>
        </div>
      )}
    </div>
  );
};

// ── JournalSourceSettings ──

const JournalSourceSettings: FunctionComponent = () => {
  const journalSource = useStore((state) => state.journalSource);
  const setJournalSource = useStore((state) => state.setJournalSource);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setJournalSource({ type: e.target.value });
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Network className="w-4 h-4 text-purple-400" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">期刊数据源</span>
      </div>
      <div className="p-3.5">
        <div className="relative">
          <select
            className="w-full px-3 py-2 text-xs rounded-md border border-border bg-card/25 text-foreground outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer pr-10"
            value={journalSource.type}
            onChange={handleChange}
          >
            <option value="letpub">LetPub 数据源 (免费公开数据)</option>
            <option value="crossref">CrossRef API 数据源 (基础文献数据)</option>
          </select>
          <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-secondary-foreground/60 pointer-events-none" />
        </div>
      </div>
    </section>
  );
};

// ── GeneralSettings ──

const GeneralSettings: FunctionComponent = () => {
  const cacheMaxSize = useStore((state) => state.cacheMaxSize);

  const handleClearCache = () => postMessage({ type: 'clear-cache' });
  const handleClearHistory = () => postMessage({ type: 'clear-history' });

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Settings className="w-4 h-4 text-secondary-foreground/80" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">系统维护与缓存</span>
      </div>
      <div className="p-3.5 flex flex-col gap-4">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-secondary-foreground">
            <Database className="w-4 h-4 opacity-70" />
            <span>本地翻译缓存上限:</span>
          </div>
          <span className="font-mono font-bold bg-secondary/65 px-2 py-0.5 rounded border border-border">
            {cacheMaxSize} 条
          </span>
        </div>
        
        <div className="flex gap-2.5 mt-1">
          <button 
            onClick={handleClearCache}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空翻译缓存
          </button>
          <button 
            onClick={handleClearHistory}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground transition-all duration-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空历史记录
          </button>
        </div>
      </div>
    </section>
  );
};

// ── BuildInfo ──

const BuildInfo: FunctionComponent = () => {
  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Info className="w-4 h-4 text-secondary-foreground/80" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">版本信息</span>
      </div>
      <div className="p-3.5">
        <div className="flex flex-col gap-2 text-xs text-secondary-foreground font-mono">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-foreground">{BUILD_INFO.version}</span>
          </div>
          <div className="flex justify-between">
            <span>Git</span>
            <span className="text-foreground">{BUILD_INFO.hash}</span>
          </div>
          <div className="flex justify-between">
            <span>Build</span>
            <span className="text-foreground">{BUILD_INFO.date || 'dev'}</span>
          </div>
        </div>
      </div>
    </section>
  );
};