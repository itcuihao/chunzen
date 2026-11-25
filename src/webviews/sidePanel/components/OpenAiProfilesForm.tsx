import { FunctionComponent, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-react';
import { EngineConfigFields, useStore } from '../store';
import { BIGMODEL_INVITE_CODE, BIGMODEL_INVITE_URL } from '../assets/bigmodelQr';
import { SILICONFLOW_INVITE_CODE, SILICONFLOW_INVITE_URL } from '../assets/siliconflowQr';
import { QrCodeSvg } from './QrCodeSvg';
import { useInlineConfirm } from './useInlineConfirm';
import {
  detectPreset,
  isConcretePreset,
  OPENAI_PRESETS,
  type OpenAiPreset
} from '../../../services/engines/openaiCompat';
import {
  isOpenAiProfileConfigured,
  resolveOpenAiProfiles,
  type OpenAiProfile
} from '../../../services/engines/openaiProfiles';

interface OpenAiProfilesFormProps {
  config: EngineConfigFields;
  onSave: (config: Record<string, string>) => void;
  onTest: (config: Record<string, string>) => void;
  onListModels: (config: Record<string, string>) => void;
  isTesting: boolean;
}

function createProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const OpenAiProfilesForm: FunctionComponent<OpenAiProfilesFormProps> = ({
  config,
  onSave,
  onTest,
  onListModels,
  isTesting
}) => {
  const [profiles, setProfiles] = useState<OpenAiProfile[]>(() =>
    resolveOpenAiProfiles(config.profiles, config)
  );
  const [explainProfileId, setExplainProfileId] = useState<string>(
    () => config.explainProfileId ?? ''
  );
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    const initial = resolveOpenAiProfiles(config.profiles, config);
    return initial[0]?.id ?? null;
  });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});
  const [openModelPicker, setOpenModelPicker] = useState<Record<string, boolean>>({});
  const [modelQueries, setModelQueries] = useState<Record<string, string>>({});
  const [openPromo, setOpenPromo] = useState<Record<string, boolean>>({});
  const [showQr, setShowQr] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const { isConfirming, trigger: confirmDelete } = useInlineConfirm(3000);

  const testingEngine = useStore((s) => s.testingEngine);
  const testResults = useStore((s) => s.testResults);
  const engineModels = useStore((s) => s.engineModels);
  const setEngineModels = useStore((s) => s.setEngineModels);

  useEffect(() => {
    if (dirty) return;
    const resolved = resolveOpenAiProfiles(config.profiles, config);
    setProfiles(resolved);
    setExplainProfileId(config.explainProfileId ?? '');
    if (resolved.length > 0 && !expandedId) {
      setExpandedId(resolved[0].id);
    }
  }, [config.profiles, config.apiKey, config.baseUrl, config.model, config.explainProfileId]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const addProfileFromPreset = (preset: OpenAiPreset) => {
    const newProfile: OpenAiProfile = {
      id: createProfileId(),
      name: preset.label,
      baseUrl: preset.baseUrl,
      apiKey: '',
      model: preset.model,
      enabled: true
    };
    setProfiles((prev) => [...prev, newProfile]);
    setExpandedId(newProfile.id);
    markDirty();
  };

  const updateProfile = (id: string, patch: Partial<OpenAiProfile>) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if ('baseUrl' in patch || 'apiKey' in patch) {
      setEngineModels(`openai:${id}`, { ok: false, models: [], message: '' });
      setOpenModelPicker((prev) => ({ ...prev, [id]: false }));
    }
    markDirty();
  };

  const removeProfile = (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    if (explainProfileId === id) setExplainProfileId('');
    if (expandedId === id) setExpandedId(null);
    markDirty();
  };

  const moveProfile = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= profiles.length) return;
    setProfiles((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markDirty();
  };

  const handleSave = () => {
    onSave({
      profiles: JSON.stringify(profiles),
      explainProfileId
    });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const firstActiveId = profiles.find(isOpenAiProfileConfigured)?.id;

  return (
    <div className="p-4 border-t border-border bg-card/5 flex flex-col gap-3.5 animate-in slide-in-from-top-1 duration-150">
      {/* Quick-add preset bar */}
      <div className="text-[10px] text-secondary-foreground/80 bg-secondary/20 p-2.5 rounded border border-border/40 leading-relaxed flex flex-col gap-2 font-sans">
        <div className="font-bold text-accent">
          + 添加 OpenAI 兼容平台（支持多个并存，按列表顺序优先使用）
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OPENAI_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => addProfileFromPreset(preset)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[9.5px] rounded border border-border bg-card/60 text-secondary-foreground hover:bg-secondary-hover/50 hover:text-foreground transition-all"
            >
              <Plus className="w-2.5 h-2.5 text-accent" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {profiles.length === 0 && (
        <div className="text-[10.5px] text-secondary-foreground/70 bg-secondary/10 border border-dashed border-border rounded-md p-4 text-center leading-relaxed">
          暂无平台配置。点击上方按钮添加「自定义 / 中转站」或官方平台，可同时保留多个配置并调整优先级。
        </div>
      )}

      {/* Profile cards list */}
      <div className="flex flex-col gap-2">
        {profiles.map((profile, idx) => {
          const isExpanded = expandedId === profile.id;
          const configured = isOpenAiProfileConfigured(profile);
          const isPrimary = profile.id === firstActiveId;
          const preset = detectPreset(profile.baseUrl);
          const resultKey = `openai:${profile.id}`;
          const isCardTesting = isTesting || testingEngine === resultKey;
          const confirmingDelete = isConfirming(`del:${profile.id}`);
          const promo =
            !profile.apiKey.trim() && preset?.id === 'siliconflow'
              ? {
                  title: '还没有 API Key？领硅基流动免费额度',
                  desc: '新用户注册实名认证送 14~20 元算力额度，支持 Qwen、DeepSeek 等全系列模型。',
                  inviteUrl: SILICONFLOW_INVITE_URL,
                  inviteCode: SILICONFLOW_INVITE_CODE,
                  qrType: 'siliconflow' as const,
                  qrTip: '手机微信或浏览器扫码注册即领免费额度'
                }
              : !profile.apiKey.trim() && preset?.id === 'glm'
                ? {
                    title: '还没有 API Key？领智谱 2000万 Tokens',
                    desc: '通过专属链接注册智谱 BigModel 即可获赠 2000万 Tokens 新手礼包。',
                    inviteUrl: BIGMODEL_INVITE_URL,
                    inviteCode: BIGMODEL_INVITE_CODE,
                    qrType: 'bigmodel' as const,
                    qrTip: '手机微信或浏览器扫码注册即享 2000万 Tokens'
                  }
                : null;
          const profileTestResult = testResults[resultKey];
          const profileModels = engineModels[resultKey];
          const hasModels = Boolean(profileModels && profileModels.models.length > 0);
          const query = (modelQueries[profile.id] ?? '').trim().toLowerCase();
          const filteredModels = hasModels
            ? profileModels!.models.filter((m) => !query || m.toLowerCase().includes(query))
            : [];

          return (
            <div
              key={profile.id}
              className={`rounded-md border transition-colors ${
                profile.enabled
                  ? 'border-border bg-background/60'
                  : 'border-border/50 bg-secondary/10 opacity-70'
              }`}
            >
              {/* Card Header */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-secondary/20 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[9.5px] font-mono text-secondary-foreground/70 px-1.5 py-0.5 rounded bg-secondary/40 flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      configured ? 'bg-success' : 'bg-secondary-foreground/30'
                    }`}
                    title={configured ? '已就绪' : '未填全或已禁用'}
                  />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {profile.name || '未命名配置'}
                  </span>
                  {isPrimary && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium flex-shrink-0">
                      优先
                    </span>
                  )}
                  {profile.model && (
                    <span className="text-[9.5px] font-mono text-secondary-foreground/70 truncate">
                      {profile.model}
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-1 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => moveProfile(idx, -1)}
                    disabled={idx === 0}
                    title="上移（提高优先级）"
                    className="p-1 rounded text-secondary-foreground/70 hover:text-foreground hover:bg-secondary/40 disabled:opacity-25 disabled:pointer-events-none"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveProfile(idx, 1)}
                    disabled={idx === profiles.length - 1}
                    title="下移（降低优先级）"
                    className="p-1 rounded text-secondary-foreground/70 hover:text-foreground hover:bg-secondary/40 disabled:opacity-25 disabled:pointer-events-none"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProfile(profile.id, { enabled: !profile.enabled })}
                    title={profile.enabled ? '点击禁用此配置' : '点击启用此配置'}
                    className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                      profile.enabled
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-border bg-secondary/30 text-secondary-foreground/60'
                    }`}
                  >
                    {profile.enabled ? '启用' : '停用'}
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(`del:${profile.id}`, () => removeProfile(profile.id))}
                    title={confirmingDelete ? '再次点击确认删除' : '删除此配置'}
                    className={`rounded transition-colors flex items-center gap-0.5 ${
                      confirmingDelete
                        ? 'px-1.5 py-0.5 text-[9px] font-semibold bg-error text-white'
                        : 'p-1 text-secondary-foreground/60 hover:text-error hover:bg-error/10'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                    {confirmingDelete && <span>确认?</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                    className="p-1 text-secondary-foreground/60 hover:text-foreground"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>

              {/* Card Body */}
              {isExpanded && (
                <div className="p-3 pt-2.5 border-t border-border/50 flex flex-col gap-3">
                  {/* Profile Name */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
                      配置名称
                    </label>
                    <input
                      type="text"
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent"
                      placeholder="例如：我的中转站 / DeepSeek 备用"
                      value={profile.name}
                      onChange={(e) => updateProfile(profile.id, { name: e.target.value })}
                    />
                  </div>

                  {/* Base URL */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
                      Base URL
                    </label>
                    <input
                      type="text"
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                      placeholder="必填，如 https://api.deepseek.com 或中转站 /v1 地址"
                      value={profile.baseUrl}
                      onChange={(e) => updateProfile(profile.id, { baseUrl: e.target.value })}
                      spellCheck={false}
                    />
                    {preset && isConcretePreset(preset) && (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <a
                          href={preset.keyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-accent hover:opacity-80"
                        >
                          <span>在 {preset.label} 控制台获取 API Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <span className="text-[9px] text-secondary-foreground/70">{preset.note}</span>
                      </div>
                    )}
                  </div>

                  {/* API Key */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase">
                      API Key
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showPasswords[profile.id] ? 'text' : 'password'}
                        className="w-full pl-2.5 pr-8 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                        placeholder="sk-..."
                        value={profile.apiKey}
                        onChange={(e) => updateProfile(profile.id, { apiKey: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords((prev) => ({ ...prev, [profile.id]: !prev[profile.id] }))
                        }
                        className="absolute right-1.5 text-secondary-foreground/50 hover:text-foreground p-1 rounded"
                      >
                        {showPasswords[profile.id] ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {promo && (
                      <div className="mt-1 rounded border border-border/50 bg-secondary/20 px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPromo((prev) => ({ ...prev, [profile.id]: !prev[profile.id] }))
                          }
                          className="w-full flex items-center justify-between text-[9.5px] font-semibold text-accent hover:opacity-85"
                        >
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>{promo.title}</span>
                          </span>
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              openPromo[profile.id] ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {openPromo[profile.id] && (
                          <div className="mt-1.5 pt-1.5 border-t border-border/40 flex flex-col gap-1.5 text-[9px] text-secondary-foreground/80">
                            <p>{promo.desc}</p>
                            <div className="flex items-center flex-wrap gap-1.5">
                              <a
                                href={promo.inviteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 font-semibold rounded bg-accent text-accent-foreground hover:opacity-90"
                              >
                                <span>前往注册领额度</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowQr((prev) => ({ ...prev, [profile.id]: !prev[profile.id] }))
                                }
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background text-foreground hover:bg-secondary"
                              >
                                <QrCode className="w-2.5 h-2.5 text-accent" />
                                <span>{showQr[profile.id] ? '收起二维码' : '扫码注册'}</span>
                              </button>
                              {promo.inviteCode && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(promo.inviteCode);
                                    setCopiedId(profile.id);
                                    setTimeout(() => setCopiedId(null), 2000);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/60 bg-secondary/40 font-mono text-foreground hover:border-accent"
                                  title="点击复制邀请码"
                                >
                                  <span>邀请码: {promo.inviteCode}</span>
                                  {copiedId === profile.id ? (
                                    <Check className="w-2.5 h-2.5 text-success" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5 text-accent" />
                                  )}
                                </button>
                              )}
                            </div>
                            {showQr[profile.id] && (
                              <div className="mt-1 p-2 rounded border border-border bg-background flex flex-col items-center gap-1">
                                <div className="w-28 h-28 bg-white rounded border border-border p-1.5 flex items-center justify-center">
                                  <QrCodeSvg type={promo.qrType} className="w-full h-full" />
                                </div>
                                <span className="text-[8.5px] text-secondary-foreground">
                                  {promo.qrTip}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Model + Pull Models Button right next to it */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase flex items-center gap-1.5">
                      <span>模型名称 (Model)</span>
                      {profile.model && (
                        <span className="text-[9px] font-normal text-success">当前：{profile.model}</span>
                      )}
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded border border-border bg-background placeholder-secondary-foreground/40 text-foreground outline-none focus:border-accent font-mono"
                        placeholder="填好 Key 后可点右侧拉取，或手填模型 ID"
                        value={profile.model}
                        onChange={(e) => updateProfile(profile.id, { model: e.target.value })}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        disabled={isCardTesting}
                        onClick={() => {
                          setOpenModelPicker((prev) => ({ ...prev, [profile.id]: true }));
                          onListModels({
                            profileId: profile.id,
                            baseUrl: profile.baseUrl,
                            apiKey: profile.apiKey,
                            timeoutMs: profile.timeoutMs ? String(profile.timeoutMs) : ''
                          });
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-foreground disabled:opacity-50 transition-colors flex-shrink-0"
                        title="根据上方 Base URL 与 API Key 拉取可用模型"
                      >
                        <RefreshCw className={`w-3 h-3 text-accent ${isCardTesting ? 'animate-spin' : ''}`} />
                        <span>拉取模型</span>
                      </button>
                    </div>

                    {(!profileModels || !profileModels.message) && (
                      <span className="text-[9px] text-secondary-foreground/65">
                        填好 Base URL 与 API Key 后点「拉取模型」，可直接点选真实模型 ID，避免手抄大小写或前缀出错。
                      </span>
                    )}

                    {/* Model Picker */}
                    {openModelPicker[profile.id] && profileModels && profileModels.message && (
                      <div className="flex flex-col gap-1.5 mt-0.5">
                        {!hasModels ? (
                          <div className="text-[9.5px] text-secondary-foreground/80 bg-secondary/20 border border-border/40 rounded p-2 leading-relaxed break-all font-mono">
                            {profileModels.message}
                            {profileModels.hint && (
                              <div className="mt-1 text-error/90 font-sans">{profileModels.hint}</div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-background/80">
                            <div className="relative flex items-center">
                              <Search className="w-3 h-3 text-secondary-foreground/50 absolute left-2 pointer-events-none" />
                              <input
                                type="text"
                                className="w-full pl-6 pr-2 py-1 text-[10px] rounded border border-border/70 bg-secondary/20 text-foreground outline-none focus:border-accent font-mono"
                                placeholder={`筛选模型（共 ${profileModels.models.length} 个）...`}
                                value={modelQueries[profile.id] ?? ''}
                                onChange={(e) =>
                                  setModelQueries((prev) => ({
                                    ...prev,
                                    [profile.id]: e.target.value
                                  }))
                                }
                              />
                            </div>
                            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1">
                              {filteredModels.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => updateProfile(profile.id, { model: id })}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                                    profile.model === id
                                      ? 'border-accent bg-accent/15 text-accent font-semibold'
                                      : 'border-border bg-secondary/40 text-secondary-foreground hover:text-foreground'
                                  }`}
                                >
                                  {id}
                                </button>
                              ))}
                              {filteredModels.length === 0 && (
                                <span className="text-[9.5px] text-secondary-foreground/60 py-1">
                                  无匹配模型
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Advanced options (collapsed by default) */}
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowAdvanced((prev) => ({ ...prev, [profile.id]: !prev[profile.id] }))
                      }
                      className="flex items-center gap-1 text-[10px] text-secondary-foreground/70 hover:text-foreground transition-colors"
                    >
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${showAdvanced[profile.id] ? 'rotate-180' : ''}`}
                      />
                      <span>高级选项（超时时间 / 系统提示词）</span>
                    </button>

                    {showAdvanced[profile.id] && (
                      <div className="mt-2 flex flex-col gap-2.5 pl-2 border-l border-border/60">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9.5px] font-semibold text-secondary-foreground/80">
                            请求超时 (毫秒)
                          </label>
                          <input
                            type="text"
                            className="w-full px-2.5 py-1 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono"
                            placeholder="60000"
                            value={profile.timeoutMs ? String(profile.timeoutMs) : ''}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              const num = raw ? Number(raw) : undefined;
                              updateProfile(profile.id, {
                                timeoutMs: num && Number.isFinite(num) ? num : undefined
                              });
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9.5px] font-semibold text-secondary-foreground/80">
                            系统提示词（留空使用默认学术翻译提示词）
                          </label>
                          <textarea
                            rows={2}
                            className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent font-mono resize-y"
                            placeholder="你是一个学术论文翻译专家..."
                            value={profile.systemPrompt ?? ''}
                            onChange={(e) =>
                              updateProfile(profile.id, { systemPrompt: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-profile Test button & result */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isCardTesting}
                      onClick={() =>
                        onTest({
                          profileId: profile.id,
                          baseUrl: profile.baseUrl,
                          apiKey: profile.apiKey,
                          model: profile.model,
                          timeoutMs: profile.timeoutMs ? String(profile.timeoutMs) : '',
                          systemPrompt: profile.systemPrompt ?? ''
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover transition-colors disabled:opacity-60"
                    >
                      <Play className={`w-3 h-3 text-accent ${isCardTesting ? 'animate-pulse' : ''}`} />
                      <span>{isCardTesting ? '正在测试...' : '测试此配置'}</span>
                    </button>
                  </div>

                  {profileTestResult && (
                    <div
                      className={`flex gap-2 items-start p-2.5 rounded border text-[11px] leading-relaxed ${
                        profileTestResult.success
                          ? 'bg-success/10 border-success/20 text-success'
                          : 'bg-error/10 border-error/20 text-error'
                      }`}
                    >
                      {profileTestResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-success" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-error" />
                      )}
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <div className="break-all font-mono">{profileTestResult.message}</div>
                        {profileTestResult.hint && (
                          <div className="text-[10px] font-sans opacity-90">
                            {profileTestResult.hint}
                          </div>
                        )}
                        {profileTestResult.availableModels &&
                          profileTestResult.availableModels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                              {profileTestResult.availableModels.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => updateProfile(profile.id, { model: id })}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-border bg-background text-foreground hover:border-accent"
                                >
                                  {id}
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Explain dedicated model selector */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
        <label className="text-[10px] font-semibold text-secondary-foreground/80 tracking-wider uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-accent" />
          <span>AI 学术释义专用模型</span>
        </label>
        <select
          value={explainProfileId}
          onChange={(e) => {
            setExplainProfileId(e.target.value);
            markDirty();
          }}
          className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background text-foreground outline-none focus:border-accent"
        >
          <option value="">跟随翻译优先级（默认使用第 1 顺位已启用配置）</option>
          {profiles.map((p, idx) => (
            <option key={p.id} value={p.id}>
              #{idx + 1} {p.name || '未命名配置'}
              {p.model ? ` (${p.model})` : ''}
              {p.enabled ? '' : ' [已停用]'}
            </option>
          ))}
        </select>
        <span className="text-[9.5px] text-secondary-foreground/65">
          划词点击「AI解释」时优先使用此配置；留空则自动使用上方排在最前面的可用模型。
        </span>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-2 mt-1">
        {dirty && !saved && (
          <span className="text-[10px] text-accent">有未保存的改动</span>
        )}
        <button
          type="button"
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded text-white transition-all ${
            saved ? 'bg-success hover:bg-success' : 'bg-primary hover:bg-primary-hover shadow-sm'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{saved ? '配置已保存' : '保存配置'}</span>
        </button>
      </div>
    </div>
  );
};
