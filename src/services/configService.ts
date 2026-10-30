import * as vscode from 'vscode';
import { GeneralSettings, JournalSourceType, LayoutConfig, MineruConfig } from '../types/config';
import { getEngineNames, getEngines, getTranslationPriority } from './engines/registry';
import { normalizePriority } from './enginePriority';
import { CACHE_MAX_SIZE, DEFAULT_LAYOUT_ENDPOINT, LAYOUT_TIMEOUT_MS, clampNumber, oneOf } from './settingsNormalize';

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
      openai: {
        apiKey: cfg.get<string>('openai.apiKey', '').trim(),
        baseUrl: cfg.get<string>('openai.baseUrl', '').trim(),
        model: cfg.get<string>('openai.model', '').trim(),
        systemPrompt: cfg.get<string>('openai.systemPrompt', '').trim()
      },
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
      openai: { apiKey: tc.openai.apiKey, baseUrl: tc.openai.baseUrl, model: tc.openai.model, systemPrompt: tc.openai.systemPrompt },
      custom: { url: tc.custom.url, headers: JSON.stringify(tc.custom.headers), bodyTemplate: tc.custom.bodyTemplate, responsePath: tc.custom.responsePath }
    };
  }

  getEngineStatuses(): Array<{ name: string; displayName: string; configured: boolean }> {
    // 状态直接取自引擎注册表，新增引擎无需在此处登记
    return getEngines().map(e => ({
      name: e.name,
      displayName: e.displayName,
      configured: e.isConfigured()
    }));
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

    if (settings.layout) {
      const useModelEnabled = typeof settings.layout.useModel === 'boolean'
        ? settings.layout.useModel
        : this.getLayoutConfig().useModel;
      const endpointTrimmed = typeof settings.layout.modelEndpoint === 'string'
        ? settings.layout.modelEndpoint.trim()
        : '';
      const normalizedEndpoint = useModelEnabled
        ? (endpointTrimmed || DEFAULT_LAYOUT_ENDPOINT)
        : endpointTrimmed;

      if (typeof settings.layout.useModel === 'boolean') {
        await layoutCfg.update('useModel', settings.layout.useModel, vscode.ConfigurationTarget.Global);
      }
      if (typeof settings.layout.modelEndpoint === 'string' || useModelEnabled) {
        await layoutCfg.update('modelEndpoint', normalizedEndpoint, vscode.ConfigurationTarget.Global);
      }
      if (typeof settings.layout.timeoutMs === 'number') {
        await layoutCfg.update('timeoutMs', clampNumber(settings.layout.timeoutMs, LAYOUT_TIMEOUT_MS), vscode.ConfigurationTarget.Global);
      }
      if (HOVER_STYLES.includes(settings.layout.hoverHighlightStyle)) {
        await layoutCfg.update('hoverHighlightStyle', settings.layout.hoverHighlightStyle, vscode.ConfigurationTarget.Global);
      }
      if (THEMES.includes(settings.layout.theme)) {
        await layoutCfg.update('theme', settings.layout.theme, vscode.ConfigurationTarget.Global);
      }
      if (RENDER_SCALES.includes(settings.layout.renderScale)) {
        await layoutCfg.update('renderScale', settings.layout.renderScale, vscode.ConfigurationTarget.Global);
      }
    }
  }
}
