import { FunctionComponent, useEffect, useState } from 'react';
import { useStore, EngineConfigFields, EngineTestResult } from '../store';
import { postMessage } from '../vscode';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  EyeOff,
  GripVertical,
  Info,
  Network,
  Palette,
  Play,
  Settings,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-react';
import type { JournalSourceType } from '../../../types/config';
import { BUILD_INFO } from '../../../build-info';
import { OpenAiProfilesForm } from './OpenAiProfilesForm';
import { useInlineConfirm } from './useInlineConfirm';

export const SettingsTab: FunctionComponent = () => {
  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      <EngineSettings />
      <AppearanceSettings />
      <JournalSourceSettings />
      <AdvancedLayoutModelSettings />
      <GeneralSettings />
      <BuildInfo />
    </div>
  );
};

// ── Engine config field definitions (non-OpenAI engines; OpenAI uses OpenAiProfilesForm) ──

interface EngineField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'toggle';
  placeholder?: string;
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
  custom: [
    { key: 'url', label: '接口 URL', type: 'text', placeholder: 'https://example.com/translate' },
    { key: 'headers', label: '请求头 (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer xxx"}' },
    { key: 'bodyTemplate', label: '请求体模板', type: 'textarea', placeholder: '{"text": "{{text}}", "target_lang": "ZH"}' },
    { key: 'responsePath', label: '响应路径', type: 'text', placeholder: 'data.translation' }
  ]
};

/** 多数用户用不到的引擎：未配置时收进“更多引擎”，已配置则正常显示 */
const COLLAPSED_BY_DEFAULT = ['deepl'];

// ── Reusable Switch Toggle ──

const ToggleSwitch: FunctionComponent<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}> = ({ checked, onChange, title }) => (
  <label className="relative inline-flex items-center cursor-pointer select-none" title={title}>
    <input
      type="checkbox"
      className="sr-only peer"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
  </label>
);

// ── 1. EngineSettings ──

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
  const setEngineStatuses = useStore((state) => state.setEngineStatuses);
  const testing = useStore((state) => state.testingEngine);
  const setTestingEngine = useStore((state) => state.setTestingEngine);
  const clearTestResultForEngine = useStore((state) => state.clearTestResultForEngine);

  const isCollapsed = (name: string) =>
    COLLAPSED_BY_DEFAULT.includes(name) && !engineStatuses.find((e) => e.name === name)?.configured;
  const collapsedNames = enginePriority.filter(isCollapsed);

  const handleDragStart = (index: number) => setDragIndex(index);

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
    if ((direction === 'top' || direction === 'up') && index === 0) return;
    if (direction === 'down' && index === enginePriority.length - 1) return;

    const newPriority = [...enginePriority];
    const [moved] = newPriority.splice(index, 1);
    const targetIndex = direction === 'top' ? 0 : direction === 'up' ? index - 1 : index + 1;
    newPriority.splice(targetIndex, 0, moved);

    setEnginePriority(newPriority);
    postMessage({ type: 'set-engine-priority', priority: newPriority });
  };

  const handleToggleEnabled = (engineName: string, nextEnabled: boolean) => {
    setEngineStatuses(
      engineStatuses.map((item) =>
        item.name === engineName ? { ...item, enabled: nextEnabled } : item
      )
    );
    postMessage({ type: 'set-engine-enabled', engineName, enabled: nextEnabled });
  };

  const handleTest = (engineName: string, config?: Record<string, string>) => {
    const key = config?.profileId ? `${engineName}:${config.profileId}` : engineName;
    clearTestResultForEngine(key);
    setTestingEngine(key);
    postMessage({ type: 'test-engine', engineName, config });
  };

  const handleListModels = (engineName: string, config?: Record<string, string>) => {
    const key = config?.profileId ? `${engineName}:${config.profileId}` : engineName;
    setTestingEngine(key);
    postMessage({ type: 'list-engine-models', engineName, config });
  };

  const handleSave = (engineName: string, config: Record<string, string>) => {
    postMessage({ type: 'save-engine-config', engineName, config });
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Sparkles className="w-4 h-4 text-accent animate-pulse" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
          翻译引擎
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-start gap-1.5 p-2.5 rounded bg-secondary/35 border border-border/30 text-secondary-foreground text-xs leading-relaxed mb-4">
          <Info className="w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" />
          <p>
            配置 API 密钥以启用翻译。春蝉会按照以下顺序<b>依次向下查找已启用且配置完整的引擎</b>；可随时停用某个引擎而不丢失密钥。
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {enginePriority.map((name, i) => {
            if (isCollapsed(name) && !showCollapsed) return null;
            const status = engineStatuses.find((e) => e.name === name);
            const isEnabled = status?.enabled !== false;
            const isConfigured = Boolean(status?.configured);
            const isExpanded = expanded === name;
            const isTesting = testing === name;
            const testResult = testResults[name];
            const isDragging = dragIndex === i;
            const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;

            const badgeLabel = !isEnabled ? '已停用' : isConfigured ? '已启用' : '未配置';
            const badgeClass = !isEnabled
              ? 'bg-secondary/50 border-border text-secondary-foreground/60'
              : isConfigured
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-error/5 border-error/20 text-secondary-foreground/60';

            return (
              <div
                key={name}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`rounded-lg border bg-card/10 overflow-hidden transition-all duration-200 ${
                  isExpanded
                    ? 'border-accent/40 shadow-sm ring-1 ring-accent/10'
                    : 'border-border hover:border-border/80'
                } ${!isEnabled && !isExpanded ? 'opacity-70' : ''} ${
                  isDragging ? 'opacity-40 scale-[0.98]' : ''
                } ${isOver ? 'border-accent/60 ring-1 ring-accent/20' : ''}`}
              >
                {isOver && overIndex !== null && overIndex < (dragIndex ?? 0) && (
                  <div className="h-0.5 bg-accent rounded-full mx-2 -mt-0.5 mb-1 animate-pulse" />
                )}
                <div
                  className="flex items-center justify-between p-3.5 cursor-pointer select-none hover:bg-secondary/15 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : name)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical
                      className="w-3.5 h-3.5 text-secondary-foreground/40 cursor-grab active:cursor-grabbing flex-shrink-0"
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <span className="text-[10px] font-mono font-bold text-secondary-foreground bg-secondary px-2 py-1 rounded-full border border-border flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-foreground truncate">
                        {status?.displayName || name}
                      </span>
                      <span className="text-[9px] text-secondary-foreground/60 mt-0.5 font-medium">
                        优先级第 {i + 1} 位
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
                      <button
                        type="button"
                        title={isEnabled ? '点击临时停用此引擎（保留密钥）' : '点击重新启用此引擎'}
                        onClick={() => handleToggleEnabled(name, !isEnabled)}
                        className={`ml-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors ${badgeClass}`}
                      >
                        {badgeLabel}
                      </button>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-secondary-foreground/60" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-secondary-foreground/60" />
                    )}
                  </div>
                </div>

                {isExpanded &&
                  (name === 'openai' ? (
                    <OpenAiProfilesForm
                      config={engineConfigs[name] || {}}
                      onSave={(config) => handleSave(name, config)}
                      onTest={(config) => handleTest(name, config)}
                      onListModels={(config) => handleListModels(name, config)}
                      isTesting={isTesting}
                    />
                  ) : (
                    <EngineConfigForm
                      engineName={name}
                      config={engineConfigs[name] || {}}
                      fields={engineFields[name] || []}
                      onSave={(config) => handleSave(name, config)}
                      onTest={(config) => handleTest(name, config)}
                      isTesting={isTesting}
                      testResult={testResult}
                    />
                  ))}
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
              : `更多引擎（${collapsedNames
                  .map((n) => engineStatuses.find((e) => e.name === n)?.displayName || n)
                  .join('、')}，已有账号可在此配置）`}
          </button>
        )}
      </div>
    </section>
  );
};

// ── EngineConfigForm (Baidu / DeepL / Custom HTTP) ──

interface EngineConfigFormProps {
  engineName: string;
  config: EngineConfigFields;
  fields: EngineField[];
  onSave: (config: Record<string, string>) => void;
  onTest: (config: Record<string, string>) => void;
  isTesting: boolean;
  testResult: EngineTestResult | null | undefined;
}

const EMPTY_FIELD_VALUE = (field: EngineField): string | boolean =>
  field.type === 'toggle' ? false : '';

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

  const dirty = Object.keys(formState).length > 0;

  const valueOf = (key: string): string | boolean => {
    if (formState[key] !== undefined) return formState[key];
    const fromConfig = (config as Record<string, string | boolean>)[key];
    if (fromConfig !== undefined && fromConfig !== '') {
      const field = fields.find((f) => f.key === key);
      if (field?.type === 'toggle') return String(fromConfig) === 'true';
      return fromConfig;
    }
    const field = fields.find((f) => f.key === key);
    return field ? EMPTY_FIELD_VALUE(field) : '';
  };

  const handleChange = (key: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

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
    setFormState({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-4 border-t border-border bg-card/5 flex flex-col gap-3.5 animate-in slide-in-from-top-1 duration-150">
      {engineName === 'custom' && (
        <div className="text-[10px] text-secondary-foreground/75 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-1 font-sans">
          <div className="font-bold text-accent">自定义接口配置示例：</div>
          <p>用于对接任何第三方或自建的 POST 翻译接口。以下是一个典型的配置示例：</p>
          <div className="grid grid-cols-[65px_1fr] gap-x-2 gap-y-1 mt-1.5 font-mono text-[9px] bg-secondary/10 p-2 rounded border border-border/20">
            <span className="font-sans font-bold text-foreground">接口 URL:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">
              https://api.mytranslator.com/v1/translate
            </code>
            <span className="font-sans font-bold text-foreground">请求头:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">
              {'{"Authorization": "Bearer my_token"}'}
            </code>
            <span className="font-sans font-bold text-foreground">请求体:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">
              {'{"text": "{{text}}", "to": "zh"}'}
            </code>
            <span className="font-sans font-bold text-foreground">响应路径:</span>
            <code className="text-foreground select-all bg-secondary/50 px-1 rounded truncate">
              data.translatedText
            </code>
          </div>
          <p className="mt-1 text-[9px] opacity-80">
            说明：<code className="font-semibold text-accent bg-secondary/30 px-1 rounded">{'{{text}}'}</code>{' '}
            是系统占位符，发送请求时会被自动替换成待翻译句子的内容。
          </p>
        </div>
      )}

      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            {field.label}
          </label>

          {field.type === 'toggle' ? (
            <ToggleSwitch
              checked={Boolean(valueOf(field.key))}
              onChange={(checked) => handleChange(field.key, checked)}
            />
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
                onClick={() =>
                  setShowPasswords((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                }
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

      <div className="flex items-center gap-2 justify-end mt-1.5">
        {dirty && !saved && (
          <span className="text-[10px] text-accent mr-auto">有未保存的改动</span>
        )}
        <button
          type="button"
          onClick={() => onTest(collectValues())}
          disabled={isTesting}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors disabled:opacity-60"
        >
          <Play className={`w-3.5 h-3.5 text-accent ${isTesting ? 'animate-pulse' : ''}`} />
          {isTesting ? '正在测试...' : '测试连接'}
        </button>
        <button
          type="button"
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
        <div
          className={`flex gap-2 items-start p-3 rounded-md border text-xs leading-relaxed animate-in fade-in duration-200 mt-1 ${
            testResult.success
              ? 'bg-success/10 border-success/20 text-success'
              : 'bg-error/10 border-error/20 text-error'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-success" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-error" />
          )}
          <div className="flex-1 flex flex-col gap-1 min-w-0">
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
    </div>
  );
};

// ── 2. AppearanceSettings (即时生效，无需手动点保存) ──

const AppearanceSettings: FunctionComponent = () => {
  const layoutConfig = useStore((state) => state.layoutConfig);
  const setLayoutConfig = useStore((state) => state.setLayoutConfig);
  const sidePanelAutoOpen = useStore((state) => state.sidePanelAutoOpen);
  const setSidePanelAutoOpen = useStore((state) => state.setSidePanelAutoOpen);

  const handleAutoOpenChange = (checked: boolean) => {
    setSidePanelAutoOpen(checked);
    postMessage({
      type: 'save-general-settings',
      settings: { sidePanelAutoOpen: checked }
    });
  };

  const updateLayoutField = <K extends 'theme' | 'renderScale' | 'hoverHighlightStyle'>(
    key: K,
    val: NonNullable<typeof layoutConfig>[K]
  ) => {
    setLayoutConfig({ ...layoutConfig, [key]: val });
    postMessage({
      type: 'save-general-settings',
      settings: { layout: { [key]: val } }
    });
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-accent" />
          <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
            阅读与外观
          </span>
        </div>
        <span className="text-[9.5px] text-secondary-foreground/55">修改即时生效</span>
      </div>

      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-foreground font-medium">打开 PDF 自动展开右侧面板</span>
            <span className="text-[9.5px] text-secondary-foreground/65">
              关闭后可通过左侧 PDF 工具栏右上角图标按需呼出
            </span>
          </div>
          <ToggleSwitch checked={sidePanelAutoOpen} onChange={handleAutoOpenChange} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            阅读器背景主题
          </label>
          <select
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent"
            value={layoutConfig?.theme ?? 'auto'}
            onChange={(e) => updateLayoutField('theme', e.target.value as 'auto' | 'dark' | 'light')}
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
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent"
            value={layoutConfig?.renderScale ?? 'auto'}
            onChange={(e) =>
              updateLayoutField('renderScale', e.target.value as 'auto' | 'balanced' | 'high')
            }
          >
            <option value="auto">自动 (auto，推荐)</option>
            <option value="balanced">均衡 (balanced，1.5x 超采样)</option>
            <option value="high">高清 (high，2x 超采样，更耗内存)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
            悬停高亮样式
          </label>
          <select
            className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent"
            value={layoutConfig?.hoverHighlightStyle ?? 'overlay'}
            onChange={(e) =>
              updateLayoutField('hoverHighlightStyle', e.target.value as 'overlay' | 'bar')
            }
          >
            <option value="overlay">半透明块 (overlay)</option>
            <option value="bar">左侧竖线 (bar)</option>
          </select>
        </div>
      </div>
    </section>
  );
};

// ── 3. JournalSourceSettings (含自动查询开关，即时生效) ──

const JournalSourceSettings: FunctionComponent = () => {
  const journalEnabled = useStore((state) => state.journalEnabled);
  const setJournalEnabled = useStore((state) => state.setJournalEnabled);
  const journalSource = useStore((state) => state.journalSource) || { type: 'ablesci' };
  const setJournalSource = useStore((state) => state.setJournalSource);

  const handleToggleEnabled = (checked: boolean) => {
    setJournalEnabled(checked);
    postMessage({
      type: 'save-general-settings',
      settings: { journalEnabled: checked }
    });
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as JournalSourceType;
    setJournalSource({ type: val });
    postMessage({
      type: 'save-general-settings',
      settings: { journalSource: { type: val } }
    });
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-purple-400" />
          <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
            期刊查询与数据源
          </span>
        </div>
        <span className="text-[9.5px] text-secondary-foreground/55">修改即时生效</span>
      </div>
      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-foreground font-medium">自动查询论文期刊分区与影响因子</span>
            <span className="text-[9.5px] text-secondary-foreground/65">
              打开含 DOI / ISSN 的论文时自动识别并展示期刊指标
            </span>
          </div>
          <ToggleSwitch checked={journalEnabled} onChange={handleToggleEnabled} />
        </div>

        {journalEnabled && (
          <div className="flex flex-col gap-1.5 pt-1 border-t border-border/40">
            <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
              优先数据源
            </label>
            <div className="relative">
              <select
                className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground outline-none focus:border-accent/60 appearance-none cursor-pointer pr-9"
                value={journalSource?.type || 'ablesci'}
                onChange={handleSourceChange}
              >
                <option value="ablesci">科研通数据源 (最新影响因子 & 新锐分区)</option>
                <option value="letpub">LetPub 数据源 (历史影响因子 & 中科院分区)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-foreground/60 pointer-events-none" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

// ── 4. AdvancedLayoutModelSettings (关闭时折叠端点配置) ──

const AdvancedLayoutModelSettings: FunctionComponent = () => {
  const defaultEndpoint = 'http://127.0.0.1:8765/layout';
  const layoutConfig = useStore((state) => state.layoutConfig);
  const setLayoutConfig = useStore((state) => state.setLayoutConfig);

  const useModel = layoutConfig?.useModel ?? false;
  const [modelEndpoint, setModelEndpoint] = useState(layoutConfig?.modelEndpoint ?? '');
  const [timeoutMs, setTimeoutMs] = useState(String(layoutConfig?.timeoutMs ?? 3500));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setModelEndpoint(layoutConfig?.modelEndpoint ?? '');
    setTimeoutMs(String(layoutConfig?.timeoutMs ?? 3500));
  }, [layoutConfig?.modelEndpoint, layoutConfig?.timeoutMs]);

  const handleToggleModel = (checked: boolean) => {
    const nextEndpoint = checked ? (modelEndpoint.trim() || defaultEndpoint) : modelEndpoint.trim();
    if (checked && !modelEndpoint.trim()) {
      setModelEndpoint(defaultEndpoint);
    }
    setLayoutConfig({ ...layoutConfig, useModel: checked, modelEndpoint: nextEndpoint });
    postMessage({
      type: 'save-general-settings',
      settings: {
        layout: {
          useModel: checked,
          ...(checked ? { modelEndpoint: nextEndpoint } : {})
        }
      }
    });
  };

  const handleSaveEndpoint = () => {
    const parsed = Number(timeoutMs);
    const normalizedTimeout = Number.isFinite(parsed)
      ? Math.max(500, Math.min(20000, Math.round(parsed)))
      : 3500;
    const normalizedEndpoint = useModel
      ? (modelEndpoint.trim() || defaultEndpoint)
      : modelEndpoint.trim();

    setModelEndpoint(normalizedEndpoint);
    setTimeoutMs(String(normalizedTimeout));
    postMessage({
      type: 'save-general-settings',
      settings: {
        layout: {
          useModel,
          modelEndpoint: normalizedEndpoint,
          timeoutMs: normalizedTimeout
        }
      }
    });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Bot className="w-4 h-4 text-accent" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
          高级版面解析模型
        </span>
      </div>
      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-foreground font-medium">启用外部版面分析模型</span>
            <span className="text-[9.5px] text-secondary-foreground/65">
              默认关闭并使用内置规则引擎；开启后请求失败也会自动回退规则引擎
            </span>
          </div>
          <ToggleSwitch checked={useModel} onChange={handleToggleModel} />
        </div>

        {useModel && (
          <div className="flex flex-col gap-3 pt-2.5 border-t border-border/50 animate-in slide-in-from-top-1 duration-150">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
                模型端点 (HTTP)
              </label>
              <input
                type="text"
                className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                placeholder={defaultEndpoint}
                value={modelEndpoint}
                onChange={(e) => {
                  setModelEndpoint(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
                请求超时时间 (500 ~ 20000 ms)
              </label>
              <input
                type="number"
                min={500}
                max={20000}
                step={100}
                className="w-full px-3 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                value={timeoutMs}
                onChange={(e) => {
                  setTimeoutMs(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {dirty && !saved && (
                <span className="text-[10px] text-accent">有未保存的改动</span>
              )}
              <button
                type="button"
                onClick={handleSaveEndpoint}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${
                  saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {saved ? '端点已保存' : '保存端点配置'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

// ── 5. GeneralSettings (缓存上限可调 + 内联二次点击确认) ──

const GeneralSettings: FunctionComponent = () => {
  const cacheMaxSize = useStore((state) => state.cacheMaxSize) ?? 500;
  const setCacheMaxSize = useStore((state) => state.setCacheMaxSize);
  const cacheSize = useStore((state) => state.cacheSize) ?? 0;
  const [maxInput, setMaxInput] = useState(String(cacheMaxSize));
  const { isConfirming, trigger } = useInlineConfirm(3000);

  useEffect(() => {
    setMaxInput(String(cacheMaxSize));
  }, [cacheMaxSize]);

  const commitCacheMaxSize = (raw: string) => {
    const parsed = Number(raw);
    const clamped = Number.isFinite(parsed)
      ? Math.max(50, Math.min(5000, Math.round(parsed)))
      : cacheMaxSize;
    setMaxInput(String(clamped));
    if (clamped !== cacheMaxSize) {
      setCacheMaxSize(clamped);
      postMessage({
        type: 'save-general-settings',
        settings: { cacheMaxSize: clamped }
      });
    }
  };

  const confirmingCache = isConfirming('clear-cache');
  const confirmingHistory = isConfirming('clear-history');

  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Settings className="w-4 h-4 text-secondary-foreground/80" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
          系统维护与缓存
        </span>
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

        <div className="flex justify-between items-center gap-3 text-xs">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-secondary-foreground">
              <Database className="w-4 h-4 opacity-70" />
              <span>本地缓存条数上限:</span>
            </div>
            <span className="text-[9.5px] text-secondary-foreground/60 ml-6">
              范围 50 ~ 5000 条（回车或失焦自动保存）
            </span>
          </div>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            onBlur={(e) => commitCacheMaxSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-24 px-2.5 py-1 text-right text-xs font-mono font-bold rounded border border-border bg-background text-foreground outline-none focus:border-accent"
          />
        </div>

        <div className="flex gap-2.5 mt-1">
          <button
            type="button"
            onClick={() => trigger('clear-cache', () => postMessage({ type: 'clear-cache' }))}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border transition-all duration-150 ${
              confirmingCache
                ? 'border-error bg-error text-white shadow-sm'
                : 'border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{confirmingCache ? `确认清空 (${cacheSize}条)?` : '清空翻译缓存'}</span>
          </button>
          <button
            type="button"
            onClick={() => trigger('clear-history', () => postMessage({ type: 'clear-history' }))}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border transition-all duration-150 ${
              confirmingHistory
                ? 'border-error bg-error text-white shadow-sm'
                : 'border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{confirmingHistory ? '确认清空历史?' : '清空历史记录'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};

// ── 6. BuildInfo ──

const BuildInfo: FunctionComponent = () => {
  return (
    <section className="glass-panel rounded-lg overflow-hidden border border-border shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
        <Info className="w-4 h-4 text-secondary-foreground/80" />
        <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
          版本信息
        </span>
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
