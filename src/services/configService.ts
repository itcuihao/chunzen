import * as vscode from 'vscode';
import { GeneralSettings, JournalSourceType, LayoutConfig, MineruConfig } from '../types/config';
import { getDisabledEngineSet, getEngineNames, getEngines, getTranslationPriority } from './engines/registry';
import { normalizeDisabledEngines, normalizePriority } from './enginePriority';
import { parseOpenAiProfiles, resolveOpenAiProfiles } from './engines/openaiProfiles';
import { CACHE_MAX_SIZE, DEFAULT_LAYOUT_ENDPOINT, LAYOUT_TIMEOUT_MS, OPENAI_TIMEOUT_MS, clampNumber, oneOf } from './settingsNormalize';

const HOVER_STYLES = ['overlay', 'bar'] as const;
const THEMES = ['auto', 'dark', 'light'] as const;
const RENDER_SCALES = ['auto', 'balanced', 'high'] as const;

export class ConfigService {
  getTranslationConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation');
    return {
      priority: getTranslationPriority(),
      baidu: {
        appId: cfg.get<string>('baidu.appId', '').trim(),
        secretKey: cfg.get<string>('baidu.secretKey', '').trim()
      },
      deepl: {
        apiKey: cfg.get<string>('deepl.apiKey', '').trim(),
        freeApi: cfg.get<boolean>('deepl.freeApi', true)
      },
      openai: (() => {
        const apiKey = cfg.get<string>('openai.apiKey', '').trim();
        const baseUrl = cfg.get<string>('openai.baseUrl', '').trim();
        const model = cfg.get<string>('openai.model', '').trim();
        const systemPrompt = cfg.get<string>('openai.systemPrompt', '').trim();
        const timeoutMs = clampNumber(cfg.get<number>('openai.timeoutMs'), OPENAI_TIMEOUT_MS);
        const profiles = resolveOpenAiProfiles(cfg.get('openai.profiles'), {
          apiKey,
          baseUrl,
          model,
          systemPrompt,
          timeoutMs
        });
        const explainProfileId = cfg.get<string>('openai.explainProfileId', '').trim();
        return { apiKey, baseUrl, model, systemPrompt, timeoutMs, profiles, explainProfileId };
      })(),
      custom: {
        url: cfg.get<string>('custom.url', '').trim(),
        headers: cfg.get<Record<string, string>>('custom.headers', {}),
        bodyTemplate: cfg.get<string>('custom.bodyTemplate', '{"text": "{{text}}", "target_lang": "ZH"}'),
        responsePath: cfg.get<string>('custom.responsePath', 'result').trim()
      }
    };
  }

  getJournalConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.journal');
    return {
      enabled: cfg.get<boolean>('enabled', true),
      source: cfg.get<JournalSourceType>('source', 'ablesci')
    };
  }

  getSidePanelConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.sidePanel');
    return {
      autoOpen: cfg.get<boolean>('autoOpen', true)
    };
  }

  getCacheConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.cache');
    return { maxSize: clampNumber(cfg.get<number>('maxSize'), CACHE_MAX_SIZE) };
  }

  getLayoutConfig(): LayoutConfig {
    const cfg = vscode.workspace.getConfiguration('chunzen.layout');
    return {
      useModel: cfg.get<boolean>('useModel', false),
      modelEndpoint: cfg.get<string>('modelEndpoint', '').trim(),
      timeoutMs: clampNumber(cfg.get<number>('timeoutMs'), LAYOUT_TIMEOUT_MS),
      hoverHighlightStyle: oneOf(cfg.get<string>('hoverHighlightStyle'), HOVER_STYLES, 'overlay'),
      theme: oneOf(cfg.get<string>('theme'), THEMES, 'auto'),
      renderScale: oneOf(cfg.get<string>('renderScale'), RENDER_SCALES, 'auto')
    };
  }

  getMineruConfig(): MineruConfig {
    // MinerU 当前整体停用（入口已从 UI 移除），不再暴露用户配置项
    return { enable: false, apiType: 'agent', token: '' };
  }

  /**
   * Get all engine configs as a flat record for sending to webview
   */
  getEngineConfigs(): Record<string, Record<string, string>> {
    const tc = this.getTranslationConfig();
    return {
      baidu: { appId: tc.baidu.appId, secretKey: tc.baidu.secretKey },
      deepl: { apiKey: tc.deepl.apiKey, freeApi: String(tc.deepl.freeApi) },
      openai: {
        apiKey: tc.openai.apiKey,
        baseUrl: tc.openai.baseUrl,
        model: tc.openai.model,
        systemPrompt: tc.openai.systemPrompt,
        timeoutMs: String(tc.openai.timeoutMs),
        profiles: JSON.stringify(tc.openai.profiles),
        explainProfileId: tc.openai.explainProfileId
      },
      custom: { url: tc.custom.url, headers: JSON.stringify(tc.custom.headers), bodyTemplate: tc.custom.bodyTemplate, responsePath: tc.custom.responsePath }
    };
  }

  getEngineStatuses(): Array<{ name: string; displayName: string; configured: boolean; enabled: boolean }> {
    const disabled = getDisabledEngineSet();
    // 状态直接取自引擎注册表，新增引擎无需在此处登记
    return getEngines().map(e => ({
      name: e.name,
      displayName: e.displayName,
      configured: e.isConfigured(),
      enabled: !disabled.has(e.name)
    }));
  }

  async saveEngineEnabled(engineName: string, enabled: boolean): Promise<void> {
    const known = getEngineNames();
    if (!known.includes(engineName)) return;
    const cfg = vscode.workspace.getConfiguration('chunzen.translation');
    const current = normalizeDisabledEngines(cfg.get('disabledEngines'), known);
    const next = enabled
      ? current.filter((n) => n !== engineName)
      : current.includes(engineName)
        ? current
        : [...current, engineName];
    await cfg.update('disabledEngines', next, vscode.ConfigurationTarget.Global);
  }

  /** 保存用户拖拽后的引擎优先级（规范化后写入全局设置） */
  async saveEnginePriority(priority: string[]): Promise<void> {
    const normalized = normalizePriority(priority, getEngineNames());
    await vscode.workspace
      .getConfiguration('chunzen.translation')
      .update('priority', normalized, vscode.ConfigurationTarget.Global);
  }

  /**
   * Save engine config to VSCode settings.
   * All values, including API keys, are written to the user's global settings.json
   * in plain text (SecretStorage is not used).
   */
  async saveEngineConfig(engineName: string, config: Record<string, string>): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation');

    for (const [key, value] of Object.entries(config)) {
      const fullKey = `${engineName}.${key}`;
      const trimmedValue = typeof value === 'string' ? value.trim() : value;

      if (key === 'freeApi') {
        await cfg.update(fullKey, trimmedValue === 'true', vscode.ConfigurationTarget.Global);
      } else if (key === 'profiles' && engineName === 'openai') {
        const profiles = parseOpenAiProfiles(trimmedValue);
        await cfg.update('openai.profiles', profiles, vscode.ConfigurationTarget.Global);
        const primary = profiles.find((p) => p.enabled && p.apiKey && p.baseUrl && p.model)
          ?? profiles.find((p) => p.enabled)
          ?? profiles[0];
        await cfg.update('openai.apiKey', primary?.apiKey ?? '', vscode.ConfigurationTarget.Global);
        await cfg.update('openai.baseUrl', primary?.baseUrl ?? '', vscode.ConfigurationTarget.Global);
        await cfg.update('openai.model', primary?.model ?? '', vscode.ConfigurationTarget.Global);
        if (primary?.systemPrompt !== undefined) {
          await cfg.update('openai.systemPrompt', primary.systemPrompt, vscode.ConfigurationTarget.Global);
        }
        if (primary?.timeoutMs !== undefined) {
          await cfg.update('openai.timeoutMs', clampNumber(primary.timeoutMs, OPENAI_TIMEOUT_MS), vscode.ConfigurationTarget.Global);
        }
      } else if (key === 'timeoutMs') {
        // 数值型设置必须写成 number，否则 package.json 的类型校验会报错
        const parsed = typeof trimmedValue === 'number' ? trimmedValue : Number(trimmedValue);
        await cfg.update(fullKey, clampNumber(parsed, OPENAI_TIMEOUT_MS), vscode.ConfigurationTarget.Global);
      } else if (key === 'headers') {
        try {
          const parsed = JSON.parse(trimmedValue);
          await cfg.update(fullKey, parsed, vscode.ConfigurationTarget.Global);
        } catch {
          // If invalid JSON, store as-is
          await cfg.update(fullKey, trimmedValue, vscode.ConfigurationTarget.Global);
        }
      } else {
        await cfg.update(fullKey, trimmedValue, vscode.ConfigurationTarget.Global);
      }
    }
  }

  async saveGeneralSettings(settings: GeneralSettings): Promise<void> {
    const cacheCfg = vscode.workspace.getConfiguration('chunzen.cache');
    const journalCfg = vscode.workspace.getConfiguration('chunzen.journal');
    const sidePanelCfg = vscode.workspace.getConfiguration('chunzen.sidePanel');
    const layoutCfg = vscode.workspace.getConfiguration('chunzen.layout');

    if (typeof settings.cacheMaxSize === 'number') {
      await cacheCfg.update('maxSize', clampNumber(settings.cacheMaxSize, CACHE_MAX_SIZE), vscode.ConfigurationTarget.Global);
    }

    if (typeof settings.journalEnabled === 'boolean') {
      await journalCfg.update('enabled', settings.journalEnabled, vscode.ConfigurationTarget.Global);
    }

    if (settings.journalSource) {
      await journalCfg.update('source', settings.journalSource.type, vscode.ConfigurationTarget.Global);
    }

    if (typeof settings.sidePanelAutoOpen === 'boolean') {
      await sidePanelCfg.update('autoOpen', settings.sidePanelAutoOpen, vscode.ConfigurationTarget.Global);
    }

    if (settings.layout) {
      const currentLayout = this.getLayoutConfig();
      const useModelEnabled = typeof settings.layout.useModel === 'boolean'
        ? settings.layout.useModel
        : currentLayout.useModel;

      if (typeof settings.layout.useModel === 'boolean') {
        await layoutCfg.update('useModel', settings.layout.useModel, vscode.ConfigurationTarget.Global);
      }

      if (typeof settings.layout.modelEndpoint === 'string') {
        const trimmed = settings.layout.modelEndpoint.trim();
        const normalizedEndpoint = useModelEnabled ? (trimmed || DEFAULT_LAYOUT_ENDPOINT) : trimmed;
        await layoutCfg.update('modelEndpoint', normalizedEndpoint, vscode.ConfigurationTarget.Global);
      } else if (settings.layout.useModel === true && !currentLayout.modelEndpoint) {
        await layoutCfg.update('modelEndpoint', DEFAULT_LAYOUT_ENDPOINT, vscode.ConfigurationTarget.Global);
      }

      if (typeof settings.layout.timeoutMs === 'number') {
        await layoutCfg.update('timeoutMs', clampNumber(settings.layout.timeoutMs, LAYOUT_TIMEOUT_MS), vscode.ConfigurationTarget.Global);
      }
      if (settings.layout.hoverHighlightStyle && HOVER_STYLES.includes(settings.layout.hoverHighlightStyle)) {
        await layoutCfg.update('hoverHighlightStyle', settings.layout.hoverHighlightStyle, vscode.ConfigurationTarget.Global);
      }
      if (settings.layout.theme && THEMES.includes(settings.layout.theme)) {
        await layoutCfg.update('theme', settings.layout.theme, vscode.ConfigurationTarget.Global);
      }
      if (settings.layout.renderScale && RENDER_SCALES.includes(settings.layout.renderScale)) {
        await layoutCfg.update('renderScale', settings.layout.renderScale, vscode.ConfigurationTarget.Global);
      }
    }
  }
}
