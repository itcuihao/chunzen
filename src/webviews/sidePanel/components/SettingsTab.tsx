import { FunctionComponent, useEffect, useState } from 'react';
import { useStore, EngineConfigFields, EngineTestResult } from '../store';
import { postMessage } from '../vscode';
import { Database, Sparkles, Trash2, Settings, ChevronDown, ChevronUp, Network, Play, CheckCircle2, XCircle, Info, Eye, EyeOff, Bot, GripVertical, ArrowUp, ArrowDown, ArrowUpToLine, QrCode, ExternalLink, Copy, Check } from 'lucide-react';
import type { JournalSourceType } from '../../../types/config';
import { findPreset, detectPreset, OPENAI_PRESETS, type OpenAiPreset } from '../../../services/engines/openaiCompat';
import { BUILD_INFO } from '../../../build-info';
import { BIGMODEL_INVITE_URL, BIGMODEL_INVITE_CODE } from '../assets/bigmodelQr';
import { SILICONFLOW_INVITE_URL, SILICONFLOW_INVITE_CODE } from '../assets/siliconflowQr';
import { QrCodeSvg } from './QrCodeSvg';

export const SettingsTab: FunctionComponent = () => {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      <EngineSettings />
      <JournalSourceSettings />
      <LayoutSettings />
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
    { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: '必填，如 https://api.deepseek.com' },
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: '服务商控制台里的 API Key' },
    { key: 'model', label: '模型名称', type: 'text', placeholder: '必填，如 deepseek-chat' },
    { key: 'timeoutMs', label: '请求超时 (毫秒)', type: 'text', placeholder: '60000' },
    { key: 'systemPrompt', label: '系统提示词', type: 'textarea', placeholder: '你是一个学术翻译专家...' }
  ],
  custom: [
    { key: 'url', label: '接口 URL', type: 'text', placeholder: 'https://example.com/translate' },
    { key: 'headers', label: '请求头 (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer xxx"}' },
    { key: 'bodyTemplate', label: '请求体模板', type: 'textarea', placeholder: '{"text": "{{text}}", "target_lang": "ZH"}' },
    { key: 'responsePath', label: '响应路径', type: 'text', placeholder: 'data.translation' }
  ]
};

/** 多数用户用不到的引擎：未配置时收进“更多引擎”，已配置则正常显示 */
const COLLAPSED_BY_DEFAULT = ['deepl'];

// ── EngineSettings ──

const EngineSettings: FunctionComponent = () => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [showCollapsed, setShowCollapsed] = useState(false);

  const enginePriority = useStore((state) => state.enginePriority) || [];
  const engineStatuses = useStore((state) => state.engineStatuses) || [];
  const engineConfigs = useStore((state) => state.engineConfigs) || {};
  const testResults = useStore((state) => state.testResults) || {};
  const setEnginePriority = useStore((state) => state.setEnginePriority);
  // 测试状态放在 store 里：结果由扩展端回传后才清除，不用定时器猜
  const testing = useStore((state) => state.testingEngine);
  const setTestingEngine = useStore((state) => state.setTestingEngine);
  const clearTestResultForEngine = useStore((state) => state.clearTestResultForEngine);

  // 默认折叠、但用户已配置时自动展示的引擎（例如拥有会员的 DeepL）
  const isCollapsed = (name: string) =>
    COLLAPSED_BY_DEFAULT.includes(name) && !engineStatuses.find((e) => e.name === name)?.configured;
  const collapsedNames = enginePriority.filter(isCollapsed);

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

  const handleMove = (index: number, direction: 'up' | 'down' | 'top') => {
    if (direction === 'top' && index === 0) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === enginePriority.length - 1) return;

    const newPriority = [...enginePriority];
    const [moved] = newPriority.splice(index, 1);
    const targetIndex = direction === 'top' ? 0 : direction === 'up' ? index - 1 : index + 1;
    newPriority.splice(targetIndex, 0, moved);

    setEnginePriority(newPriority);
    postMessage({ type: 'set-engine-priority', priority: newPriority });
  };

  const handleTest = (engineName: string, config?: Record<string, string>) => {
    clearTestResultForEngine(engineName);
    setTestingEngine(engineName);
    postMessage({ type: 'test-engine', engineName, config });
  };

  const handleListModels = (engineName: string, config?: Record<string, string>) => {
    setTestingEngine(engineName);
    postMessage({ type: 'list-engine-models', engineName, config });
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
            if (isCollapsed(name) && !showCollapsed) return null;
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
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {i > 0 && (
                        <button
                          type="button"
                          title="置顶该引擎"
                          onClick={() => handleMove(i, 'top')}
                          className="p-1 rounded text-secondary-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors"
                        >
                          <ArrowUpToLine className="w-3 h-3" />
                        </button>
                      )}
                      {i > 0 && (
                        <button
                          type="button"
                          title="上移一位"
                          onClick={() => handleMove(i, 'up')}
                          className="p-1 rounded text-secondary-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                      )}
                      {i < enginePriority.length - 1 && (
                        <button
                          type="button"
                          title="下移一位"
                          onClick={() => handleMove(i, 'down')}
                          className="p-1 rounded text-secondary-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      )}
                    </div>
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
                    onTest={(config) => handleTest(name, config)}
                    onListModels={(config) => handleListModels(name, config)}
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
        {collapsedNames.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCollapsed(!showCollapsed)}
            className="mt-3 flex items-center gap-1 text-[11px] text-secondary-foreground hover:text-foreground transition-colors"
          >
            {showCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showCollapsed
              ? '收起更多引擎'
              : `更多引擎（${collapsedNames.map((n) => engineStatuses.find((e) => e.name === n)?.displayName || n).join('、')}，已有账号可在此配置）`}
          </button>
        )}
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
  onTest: (config: Record<string, string>) => void;
  onListModels: (config: Record<string, string>) => void;
  isTesting: boolean;
  testResult: EngineTestResult | null | undefined;
}

/** 表单里没有初值定义的字段，用空串/默认值兜底 */
const EMPTY_FIELD_VALUE = (field: EngineField): string | boolean =>
  field.type === 'toggle' ? false : '';

const EngineConfigForm: FunctionComponent<EngineConfigFormProps> = ({
  engineName,
  config,
  fields,
  onSave,
  onTest,
  onListModels,
  isTesting,
  testResult
}) => {
  const [formState, setFormState] = useState<Record<string, string | boolean>>({});
  const [saved, setSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [showQr, setShowQr] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showModelList, setShowModelList] = useState(false);
  const [presetId, setPresetId] = useState<string | null>(null);

  const modelsForEngine = useStore((state) => state.engineModels[engineName]);

  /** 当前值：已改动的表单值 → 已保存的配置 → 字段默认值 */
  const valueOf = (key: string): string | boolean => {
    if (formState[key] !== undefined) return formState[key];
    const fromConfig = (config as Record<string, string | boolean>)[key];
    if (fromConfig !== undefined && fromConfig !== '') return fromConfig;
    const field = fields.find((f) => f.key === key);
    return field ? EMPTY_FIELD_VALUE(field) : '';
  };

  const handleChange = (key: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /** 组装要提交给扩展端的完整字段集合 */
  const collectValues = (): Record<string, string> => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const val = valueOf(field.key);
      values[field.key] = field.type === 'toggle' ? String(Boolean(val)) : String(val ?? '');
    }
    return values;
  };

  const handleSaveClick = () => {
    onSave(collectValues());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const activePreset = findPreset(presetId) ?? detectPreset(valueOf('baseUrl'));

  const applyPreset = (preset: OpenAiPreset) => {
    setPresetId(preset.id);
    handleChange('baseUrl', preset.baseUrl);
    handleChange('model', preset.model);
  };

  const promo = activePreset?.id === 'siliconflow' ? {
    title: '还没有 API Key？注册硅基流动领免费额度',
    desc: (
      <span>
        新用户注册实名认证即送 <strong className="text-foreground">14~20 元算力额度</strong>，可免费翻译百万字，支持 Qwen、DeepSeek 等全系列开源模型。
      </span>
    ),
    buttonText: '前往注册领免费额度',
    inviteUrl: SILICONFLOW_INVITE_URL,
    inviteCode: SILICONFLOW_INVITE_CODE,
    qrType: 'siliconflow' as const,
    qrTip: '使用手机微信或浏览器扫码，注册即领免费额度'
  } : activePreset?.id === 'glm' ? {
    title: '还没有 API Key？注册智谱 BigModel 领 2000万 Tokens',
    desc: (
      <span>
        智谱新一代旗舰模型已上线，在推理、代码、智能体能力达到开源 SOTA 水平。通过专属链接注册即可获得 <strong className="text-accent">2000万 Tokens 大礼包</strong>！
      </span>
    ),
    buttonText: '前往注册领 2000万 Tokens',
    inviteUrl: BIGMODEL_INVITE_URL,
    inviteCode: BIGMODEL_INVITE_CODE,
    qrType: 'bigmodel' as const,
    qrTip: '使用手机微信或浏览器扫码，注册即享 2000万 Tokens'
  } : null;

  const getButtonClass = (id: string) => {
    return activePreset?.id === id
      ? 'px-2.5 py-1 text-[9.5px] rounded border border-accent bg-accent text-accent-foreground font-semibold shadow-sm transition-all'
      : 'px-2.5 py-1 text-[9.5px] rounded border border-border bg-card/60 text-secondary-foreground hover:bg-secondary-hover/50 hover:text-foreground transition-all';
  };

  const chosenModel = String(valueOf('model') ?? '');

  return (
    <div className="p-4 border-t border-border bg-card/5 flex flex-col gap-3.5 animate-in slide-in-from-top-1 duration-150">
      {engineName === 'openai' && (
        <div className="text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-2 font-sans">
          <div className="font-bold text-accent">
            第 1 步 · 选择服务商（自动填入 Base URL 与模型名）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {OPENAI_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={getButtonClass(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {activePreset && (
            <div className="flex flex-col gap-1">
              <a
                href={activePreset.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-accent hover:opacity-80"
              >
                <span>第 2 步 · 在 {activePreset.label} 控制台创建 API Key</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <span className="text-[9px] text-secondary-foreground/70">{activePreset.note}</span>
            </div>
          )}
          {!activePreset && (
            <span className="text-[9px] text-secondary-foreground/70">
              也可以直接填写任意 OpenAI 兼容中转服务的地址；根地址、带 /v1 的地址、完整
              /chat/completions 地址都能识别。
            </span>
          )}
        </div>
      )}

      {engineName === 'custom' && (
        <div className="text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-1 font-sans">
          <div className="font-bold text-accent">自定义接口配置示例：</div>
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
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase flex items-center gap-1.5">
            <span>{field.label}</span>
            {field.key === 'model' && engineName === 'openai' && chosenModel && (
              <span className="text-[9px] font-normal text-success">当前：{chosenModel}</span>
            )}
          </label>

          {field.type === 'toggle' ? (
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={Boolean(valueOf(field.key))}
                onChange={(e) => handleChange(field.key, e.target.checked)}
              />
              <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          ) : field.type === 'textarea' ? (
            <textarea
              className="w-full px-3 py-2 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono resize-y min-h-[50px] leading-relaxed"
              placeholder={field.placeholder}
              value={String(valueOf(field.key) ?? '')}
              onChange={(e) => handleChange(field.key, e.target.value)}
              rows={3}
            />
          ) : field.type === 'password' ? (
            <div className="relative flex items-center">
              <input
                type={showPasswords[field.key] ? 'text' : 'password'}
                className="w-full pl-3 pr-9 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                placeholder={field.placeholder}
                value={String(valueOf(field.key) ?? '')}
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
              value={String(valueOf(field.key) ?? '')}
              onChange={(e) => handleChange(field.key, e.target.value)}
              spellCheck={false}
            />
          )}
        </div>
      ))}

      {engineName === 'openai' && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              setShowModelList((prev) => !prev);
              if (!modelsForEngine || modelsForEngine.models.length === 0) onListModels(collectValues());
            }}
            disabled={isTesting}
            className="flex items-center gap-1.5 text-[10px] text-secondary-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showModelList ? 'rotate-180' : ''}`} />
            {modelsForEngine && modelsForEngine.models.length > 0
              ? `从接口返回的 ${modelsForEngine.models.length} 个模型中挑选`
              : '拉取该服务商的可用模型列表'}
          </button>
          {showModelList && modelsForEngine && (
            <div className="flex flex-col gap-1.5">
              {modelsForEngine.models.length === 0 ? (
                <div className="text-[9.5px] text-secondary-foreground/70 bg-secondary/20 border border-border/40 rounded p-2 leading-relaxed break-all font-mono">
                  {modelsForEngine.message}
                  {modelsForEngine.hint && <div className="mt-1 text-error/90 font-sans">{modelsForEngine.hint}</div>}
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1 p-1.5 rounded border border-border bg-background/60">
                  {modelsForEngine.models.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleChange('model', id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                        chosenModel === id
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-secondary/40 text-secondary-foreground hover:text-foreground'
                      }`}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end mt-1.5">
        <button
          onClick={() => onTest(collectValues())}
          disabled={isTesting}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors disabled:opacity-60"
        >
          <Play className={`w-3.5 h-3.5 text-accent ${isTesting ? 'animate-pulse' : ''}`} />
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
          <div className="flex-1 flex flex-col gap-1">
            <div className="break-all font-mono">{testResult.message}</div>
            {testResult.hint && (
              <div className="text-[10px] font-sans opacity-90">{testResult.hint}</div>
            )}
            {(testResult.requestUrl || testResult.elapsedMs !== undefined) && (
              <div className="text-[9px] font-mono opacity-60 break-all">
                {testResult.requestUrl ? `请求：${testResult.requestUrl}` : ''}
                {testResult.requestUrl && testResult.elapsedMs !== undefined ? ' · ' : ''}
                {testResult.elapsedMs !== undefined ? `耗时 ${testResult.elapsedMs} ms` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {engineName === 'openai' && promo && (
        <div className="mt-2 pt-2 border-t border-border/30 flex flex-col gap-1.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 font-bold text-accent text-[9.5px]">
              <Sparkles className="w-3 h-3 text-accent shrink-0" />
              <span>{promo.title}</span>
            </div>
            {promo.qrType && (
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-border/60 bg-secondary/40 text-foreground hover:bg-secondary transition-colors"
                title="手机微信扫码注册"
              >
                <QrCode className="w-3 h-3 text-accent" />
                <span>{showQr ? '收起二维码' : '扫码注册'}</span>
              </button>
            )}
          </div>

          <p className="text-[9px] text-secondary-foreground/80 leading-relaxed">
            {promo.desc}
          </p>

          <div className="flex items-center flex-wrap gap-2 pt-0.5">
            <a
              href={promo.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-semibold rounded bg-accent text-accent-foreground hover:opacity-90 transition-opacity shadow-sm"
            >
              <span>{promo.buttonText}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>

            {promo.inviteCode && (
              <div className="flex items-center gap-1 text-[9px] bg-secondary/50 border border-border/40 px-1.5 py-0.5 rounded font-mono">
                <span className="text-secondary-foreground/70 font-sans">邀请码:</span>
                <code className="font-bold text-foreground select-all text-[8.5px] max-w-[140px] truncate" title={promo.inviteCode}>
                  {promo.inviteCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(promo.inviteCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="ml-0.5 text-accent hover:underline flex items-center gap-0.5 font-sans"
                  title="复制邀请码"
                >
                  {copiedCode ? <Check className="w-2.5 h-2.5 text-success" /> : <Copy className="w-2.5 h-2.5" />}
                  <span>{copiedCode ? '已复制' : '复制'}</span>
                </button>
              </div>
            )}
          </div>

          {showQr && promo.qrType && (
            <div className="mt-1.5 p-2.5 bg-background/95 rounded border border-border flex flex-col items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150 shadow-sm">
              <div className="w-32 h-32 bg-white rounded border border-border p-1.5 shadow-sm flex items-center justify-center">
                <QrCodeSvg type={promo.qrType} className="w-full h-full" />
              </div>
              <div className="text-[8.5px] text-secondary-foreground text-center">
                {promo.qrTip}
              </div>
              <a
                href={promo.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[8.5px] text-accent underline flex items-center gap-0.5 hover:opacity-80"
              >
                <span>若无法扫码，点击此处直接在网页打开注册</span>
                <ExternalLink className="w-2 h-2" />
              </a>
            </div>
          )}
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
    const val = e.target.value as JournalSourceType;
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
  const defaultEndpoint = 'http://127.0.0.1:8765/layout'; // 须与 services/settingsNormalize.ts DEFAULT_LAYOUT_ENDPOINT 一致（webview 不能引用扩展端模块）
  const layoutConfig = useStore((state) => state.layoutConfig) || { useModel: false, modelEndpoint: '', timeoutMs: 3500, hoverHighlightStyle: 'overlay' as const, theme: 'auto' as const, renderScale: 'auto' as const };
  const [useModel, setUseModel] = useState(layoutConfig?.useModel ?? false);
  const [modelEndpoint, setModelEndpoint] = useState(layoutConfig?.modelEndpoint ?? '');
  const [timeoutMs, setTimeoutMs] = useState(String(layoutConfig?.timeoutMs ?? 3500));
  const [hoverHighlightStyle, setHoverHighlightStyle] = useState<'overlay' | 'bar'>(layoutConfig?.hoverHighlightStyle ?? 'overlay');
  const [theme, setTheme] = useState<'auto' | 'dark' | 'light'>(layoutConfig?.theme ?? 'auto');
  const [renderScale, setRenderScale] = useState<'auto' | 'balanced' | 'high'>(layoutConfig?.renderScale ?? 'auto');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUseModel(layoutConfig?.useModel ?? false);
    setModelEndpoint(layoutConfig?.modelEndpoint ?? '');
    setTimeoutMs(String(layoutConfig?.timeoutMs ?? 3500));
    setHoverHighlightStyle(layoutConfig?.hoverHighlightStyle ?? 'overlay');
    setTheme(layoutConfig?.theme ?? 'auto');
    setRenderScale(layoutConfig?.renderScale ?? 'auto');
  }, [layoutConfig?.useModel, layoutConfig?.modelEndpoint, layoutConfig?.timeoutMs, layoutConfig?.hoverHighlightStyle, layoutConfig?.theme, layoutConfig?.renderScale]);

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
          theme,
          renderScale: renderScale
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

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            PDF 渲染清晰度
          </label>
          <select
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono"
            value={renderScale}
            onChange={(e) => setRenderScale(e.target.value as 'auto' | 'balanced' | 'high')}
          >
            <option value="auto">自动 (auto，推荐)</option>
            <option value="balanced">均衡 (balanced，1.5x 超采样)</option>
            <option value="high">高清 (high，2x 超采样，更耗内存)</option>
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

