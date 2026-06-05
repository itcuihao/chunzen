import { FunctionComponent, useEffect, useState } from 'react';
import { useStore, EngineStatus, EngineConfigFields } from '../store';
import { postMessage } from '../vscode';
import { Database, Sparkles, Trash2, Settings, ChevronDown, ChevronUp, Network, Play, CheckCircle2, XCircle, Info, Lock, Eye, EyeOff, Bot, GripVertical } from 'lucide-react';
import { BUILD_INFO } from '../../../build-info';

export const SettingsTab: FunctionComponent = () => {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      <EngineSettings />
      <JournalSourceSettings />
      <LayoutSettings />
      <MineruSettings />
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
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'API Key (支持 DeepSeek / Gemini / OpenAI 等)' },
    { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: '默认 https://api.openai.com/v1' },
    { key: 'model', label: '模型名称', type: 'text', placeholder: '如 gpt-4o-mini 或 deepseek-chat' },
    { key: 'systemPrompt', label: '系统提示词', type: 'textarea', placeholder: '你是一个学术翻译专家...' }
  ],
  custom: [
    { key: 'url', label: '接口 URL', type: 'text', placeholder: 'https://example.com/translate' },
    { key: 'headers', label: '请求头 (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer xxx"}' },
    { key: 'bodyTemplate', label: '请求体模板', type: 'textarea', placeholder: '{"text": "{{text}}", "target_lang": "ZH"}' },
    { key: 'responsePath', label: '响应路径', type: 'text', placeholder: 'data.translation' }
  ]
};

// ── EngineSettings ──

const EngineSettings: FunctionComponent = () => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const enginePriority = useStore((state) => state.enginePriority) || [];
  const engineStatuses = useStore((state) => state.engineStatuses) || [];
  const engineConfigs = useStore((state) => state.engineConfigs) || {};
  const testResults = useStore((state) => state.testResults) || {};
  const setEnginePriority = useStore((state) => state.setEnginePriority);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const newPriority = [...enginePriority];
    const [moved] = newPriority.splice(dragIndex, 1);
    newPriority.splice(dropIndex, 0, moved);
    setEnginePriority(newPriority);
    postMessage({ type: 'set-engine-priority', priority: newPriority });
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

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
            const isDragging = dragIndex === i;
            const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;

            return (
              <div
                key={name}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`rounded-lg border bg-card/10 overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'border-accent/40 shadow-sm ring-1 ring-accent/10' : 'border-border hover:border-border/80'
                } ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${isOver ? 'border-accent/60 ring-1 ring-accent/20' : ''}`}
              >
                {isOver && overIndex !== null && overIndex < (dragIndex ?? 0) && (
                  <div className="h-0.5 bg-accent rounded-full mx-2 -mt-0.5 mb-1 animate-pulse" />
                )}
                <div
                  className="flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-secondary/15 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : name)}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical
                      className="w-3.5 h-3.5 text-secondary-foreground/40 cursor-grab active:cursor-grabbing flex-shrink-0"
                      onMouseDown={(e) => e.stopPropagation()}
                    />
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
                {isOver && overIndex !== null && overIndex > (dragIndex ?? 0) && (
                  <div className="h-0.5 bg-accent rounded-full mx-2 -mb-0.5 mt-1 animate-pulse" />
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
      {engineName === 'openai' && (
        <div className="text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-1 font-sans">
          <div className="font-bold text-accent">💡 适配说明与推荐：</div>
          <p>此通道完全兼容支持 OpenAI 格式协议的各大平台服务商。若没有官方 API Key，推荐申请以下国内直接访问的极速/低成本源并填入下方：</p>
          <ul className="list-disc pl-4 flex flex-col gap-1 mt-1 font-mono">
            <li>
              <span className="font-sans font-semibold text-foreground">DeepSeek (推荐)</span>: Base URL 填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">https://api.deepseek.com/v1</code>，模型填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">deepseek-chat</code>
            </li>
            <li>
              <span className="font-sans font-semibold text-foreground">硅基流动 (送大额免费试用)</span>: Base URL 填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">https://api.siliconflow.cn/v1</code>，模型填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">deepseek-ai/DeepSeek-V3</code>
            </li>
            <li>
              <span className="font-sans font-semibold text-foreground">智谱 GLM (送超大免费试用)</span>: Base URL 填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">https://open.bigmodel.cn/api/paas/v4</code>，模型填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">glm-4-flash</code>
            </li>
            <li>
              <span className="font-sans font-semibold text-foreground">本地大模型 (Ollama)</span>: Base URL 填 <code className="font-semibold text-foreground select-all bg-secondary/50 px-1 rounded">http://localhost:11434/v1</code>，模型填你本地拉取的名称
            </li>
          </ul>
        </div>
      )}
      {engineName === 'custom' && (
        <div className="text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-1 font-sans">
          <div className="font-bold text-accent">💡 自定义接口配置示例：</div>
          <p>用于对接任何第三方或自建的 POST 翻译接口。以下是一个典型的配置示例：</p>
          <div className="grid grid-cols-[65px_1fr] gap-x-2 gap-y-1 mt-1.5 font-mono text-[9px] bg-secondary/10 p-2 rounded border border-border/20">
            <span className="font-sans font-bold text-foreground">接口 URL:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">https://api.mytranslator.com/v1/translate</code>
            
            <span className="font-sans font-bold text-foreground">请求头:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">{"{\"Authorization\": \"Bearer my_token\"}"}</code>
            
            <span className="font-sans font-bold text-foreground">请求体:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">{"{\"text\": \"{{text}}\", \"to\": \"zh\"}"}</code>
            
            <span className="font-sans font-bold text-foreground">响应路径:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">data.translatedText</code>
          </div>
          <p className="mt-1 text-[9px] opacity-80">
            说明：<code className="font-semibold text-accent bg-secondary/30 px-1 rounded">{"{{text}}"}</code> 是系统占位符，发送请求时会被自动替换成待翻译句子的内容。
          </p>
        </div>
      )}
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
  const journalSource = useStore((state) => state.journalSource) || { type: 'ablesci' };
  const setJournalSource = useStore((state) => state.setJournalSource);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'ablesci' | 'letpub' | 'crossref' | 'custom';
    setJournalSource({ type: val });
    postMessage({
      type: 'save-general-settings',
      settings: {
        journalSource: { type: val }
      }
    });
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
            className="w-full px-3 py-2 text-xs rounded-md border border-border outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer pr-10"
            style={{
              backgroundColor: 'var(--bg-section)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border)'
            }}
            value={journalSource?.type || 'ablesci'}
            onChange={handleChange}
          >
            <option value="ablesci" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>科研通数据源 (最新影响因子 & 新锐分区)</option>
            <option value="letpub" style={{ backgroundColor: 'var(--bg-section)', color: 'var(--text-primary)' }}>LetPub 数据源 (历史影响因子 & 中科院分区)</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60 pointer-events-none" />
        </div>
      </div>
    </section>
  );
};

// ── LayoutSettings ──

const LayoutSettings: FunctionComponent = () => {
  const defaultEndpoint = 'http://127.0.0.1:8765/layout';
  const layoutConfig = useStore((state) => state.layoutConfig) || { useModel: false, modelEndpoint: '', timeoutMs: 3500, hoverHighlightStyle: 'overlay' as const, theme: 'auto' as const };
  const [useModel, setUseModel] = useState(layoutConfig?.useModel ?? false);
  const [modelEndpoint, setModelEndpoint] = useState(layoutConfig?.modelEndpoint ?? '');
  const [timeoutMs, setTimeoutMs] = useState(String(layoutConfig?.timeoutMs ?? 3500));
  const [hoverHighlightStyle, setHoverHighlightStyle] = useState<'overlay' | 'bar'>(layoutConfig?.hoverHighlightStyle ?? 'overlay');
  const [theme, setTheme] = useState<'auto' | 'dark' | 'light'>(layoutConfig?.theme ?? 'auto');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUseModel(layoutConfig?.useModel ?? false);
    setModelEndpoint(layoutConfig?.modelEndpoint ?? '');
    setTimeoutMs(String(layoutConfig?.timeoutMs ?? 3500));
    setHoverHighlightStyle(layoutConfig?.hoverHighlightStyle ?? 'overlay');
    setTheme(layoutConfig?.theme ?? 'auto');
  }, [layoutConfig?.useModel, layoutConfig?.modelEndpoint, layoutConfig?.timeoutMs, layoutConfig?.hoverHighlightStyle, layoutConfig?.theme]);

  const handleSave = () => {
    const timeout = Number(timeoutMs);
    const normalizedTimeout = Number.isFinite(timeout)
      ? Math.max(500, Math.min(20000, Math.round(timeout)))
      : 3500;
    const normalizedEndpoint = useModel
      ? (modelEndpoint.trim() || defaultEndpoint)
      : modelEndpoint.trim();

    postMessage({
      type: 'save-general-settings',
      settings: {
        layout: {
          useModel,
          modelEndpoint: normalizedEndpoint,
          timeoutMs: normalizedTimeout,
          hoverHighlightStyle,
          theme
        }
      }
    });
    if (useModel && !modelEndpoint.trim()) {
      setModelEndpoint(defaultEndpoint);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Bot className="w-4 h-4 text-accent" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">版面解析</span>
      </div>
      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" />
          <p>
            默认使用内置规则引擎。保存后：开启模型会自动启动本地版面服务，关闭模型会自动停止；请求失败时自动回退规则引擎。
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground font-medium">启用版面分析模型</span>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={useModel}
              onChange={(e) => setUseModel(e.target.checked)}
            />
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            模型端点 (HTTP)
          </label>
          <input
            type="text"
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
            placeholder="http://127.0.0.1:8765/layout"
            value={modelEndpoint}
            onChange={(e) => setModelEndpoint(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            超时时间 (ms)
          </label>
          <input
            type="number"
            min={500}
            max={20000}
            step={100}
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            悬停高亮样式
          </label>
          <select
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono"
            value={hoverHighlightStyle}
            onChange={(e) => setHoverHighlightStyle(e.target.value as 'overlay' | 'bar')}
          >
            <option value="overlay">半透明块 (overlay)</option>
            <option value="bar">左侧竖线 (bar)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            阅读器背景主题
          </label>
          <select
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono"
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'auto' | 'dark' | 'light')}
          >
            <option value="auto">跟随 VS Code 主题 (auto)</option>
            <option value="dark">琥珀深褐 (Cozy Warm Dark)</option>
            <option value="light">春蝉暖木 (Spring Cicada Light)</option>
          </select>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${
              saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {saved ? '已保存' : '保存版面设置'}
          </button>
        </div>
      </div>
    </section>
  );
};

// ── GeneralSettings ──

const GeneralSettings: FunctionComponent = () => {
  const cacheMaxSize = useStore((state) => state.cacheMaxSize) ?? 500;
  const cacheSize = useStore((state) => state.cacheSize) ?? 0;

  const handleClearCache = () => {
    if (confirm(`确认要清空当前的 ${cacheSize} 条本地翻译缓存吗？`)) {
      postMessage({ type: 'clear-cache' });
    }
  };
  const handleClearHistory = () => {
    if (confirm('确认要清空所有翻译历史记录吗？')) {
      postMessage({ type: 'clear-history' });
    }
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Settings className="w-4 h-4 text-secondary-foreground/80" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">系统维护与缓存</span>
      </div>
      <div className="p-3.5 flex flex-col gap-3.5">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-secondary-foreground">
            <Database className="w-4 h-4 opacity-70" />
            <span>当前已缓存翻译:</span>
          </div>
          <span className="font-mono font-bold bg-secondary/65 px-2 py-0.5 rounded border border-border">
            {cacheSize} 条
          </span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-secondary-foreground">
            <Database className="w-4 h-4 opacity-70" />
            <span>本地缓存上限:</span>
          </div>
          <span className="font-mono font-bold bg-secondary/65 px-2 py-0.5 rounded border border-border">
            {cacheMaxSize} 条
          </span>
        </div>
        
        <div className="flex gap-2.5 mt-1.5">
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

// ── MineruSettings ──

const MineruSettings: FunctionComponent = () => {
  const mineruConfig = useStore((state) => state.mineruConfig) || { enable: false, apiType: 'agent', token: '' };
  const [enable, setEnable] = useState(mineruConfig.enable ?? false);
  const [apiType, setApiType] = useState<'agent' | 'standard'>(mineruConfig.apiType ?? 'agent');
  const [token, setToken] = useState(mineruConfig.token ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnable(mineruConfig.enable ?? false);
    setApiType(mineruConfig.apiType ?? 'agent');
    setToken(mineruConfig.token ?? '');
  }, [mineruConfig.enable, mineruConfig.apiType, mineruConfig.token]);

  const handleSave = () => {
    postMessage({
      type: 'save-general-settings',
      settings: {
        mineru: {
          enable,
          apiType,
          token
        }
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase font-medium">MinerU AI 增强重构</span>
      </div>
      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" />
          <p>
            开启 MinerU AI 文档重构后，系统会自动在后台将 PDF 转换为高精度的 Markdown，完美还原数学公式（LaTeX）与表格。
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground font-medium">启用 MinerU AI 重构排版</span>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enable}
              onChange={(e) => setEnable(e.target.checked)}
            />
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            API 类型
          </label>
          <select
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono"
            value={apiType}
            onChange={(e) => setApiType(e.target.value as 'agent' | 'standard')}
          >
            <option value="agent">Agent 免 Token 体验版 (≤ 20页 / 10MB)</option>
            <option value="standard">Standard 精准解析版 (支持最大 200页 / 200MB)</option>
          </select>
        </div>

        {apiType === 'standard' && (
          <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-1 duration-150">
            <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
              API Token
            </label>
            <input
              type="password"
              className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
              placeholder="从 mineru.net 申请的 API Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${
              saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {saved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>
    </section>
  );
};
