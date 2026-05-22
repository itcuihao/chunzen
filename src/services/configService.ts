import * as vscode from 'vscode';
import { GeneralSettings, LayoutConfig } from '../types/config';

export class ConfigService {
  getTranslationConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation');
    return {
      priority: cfg.get<string[]>('priority', ['baidu', 'deepl', 'openai', 'custom', 'claudeCli']),
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
        baseUrl: cfg.get<string>('openai.baseUrl', 'https://api.openai.com/v1').trim(),
        model: cfg.get<string>('openai.model', 'gpt-4o-mini').trim(),
        systemPrompt: cfg.get<string>('openai.systemPrompt', '').trim()
      },
      custom: {
        url: cfg.get<string>('custom.url', '').trim(),
        headers: cfg.get<Record<string, string>>('custom.headers', {}),
        bodyTemplate: cfg.get<string>('custom.bodyTemplate', '{"text": "{{text}}", "target_lang": "ZH"}'),
        responsePath: cfg.get<string>('custom.responsePath', 'result').trim()
      },
      claudeCli: {
        enabled: cfg.get<boolean>('claudeCli.enabled', false),
        prompt: cfg.get<string>('claudeCli.prompt', '').trim()
      }
    };
  }

  getJournalConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.journal');
    return { enabled: cfg.get<boolean>('enabled', true) };
  }

  getCacheConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.cache');
    return { maxSize: cfg.get<number>('maxSize', 500) };
  }

  getLayoutConfig(): LayoutConfig {
    const cfg = vscode.workspace.getConfiguration('chunzen.layout');
    const timeout = cfg.get<number>('timeoutMs', 3500);
    return {
      useModel: cfg.get<boolean>('useModel', false),
      modelEndpoint: cfg.get<string>('modelEndpoint', '').trim(),
      timeoutMs: Number.isFinite(timeout) ? Math.max(500, Math.min(20000, timeout)) : 3500
    };
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
      custom: { url: tc.custom.url, headers: JSON.stringify(tc.custom.headers), bodyTemplate: tc.custom.bodyTemplate, responsePath: tc.custom.responsePath },
      claudeCli: { enabled: String(tc.claudeCli.enabled), prompt: tc.claudeCli.prompt }
    };
  }

  getEngineStatuses(): Array<{ name: string; displayName: string; configured: boolean }> {
    const cfg = this.getTranslationConfig();
    return [
      { name: 'baidu', displayName: '百度翻译', configured: !!(cfg.baidu.appId && cfg.baidu.secretKey) },
      { name: 'deepl', displayName: 'DeepL', configured: !!cfg.deepl.apiKey },
      { name: 'openai', displayName: 'AI 翻译', configured: !!cfg.openai.apiKey },
      { name: 'custom', displayName: '自定义接口', configured: !!cfg.custom.url },
      { name: 'claudeCli', displayName: 'Claude CLI', configured: cfg.claudeCli.enabled }
    ];
  }

  /**
   * Save engine config to VSCode settings.
   * Uses workspace settings (settings.json) for non-sensitive values,
   * and secrets storage for API keys when available.
   */
  async saveEngineConfig(engineName: string, config: Record<string, string>): Promise<void> {
    const prefix = `chunzen.translation.${engineName}.`;
    const cfg = vscode.workspace.getConfiguration('chunzen.translation');

    for (const [key, value] of Object.entries(config)) {
      const fullKey = `${engineName}.${key}`;
      const trimmedValue = typeof value === 'string' ? value.trim() : value;

      if (key === 'enabled') {
        await cfg.update(fullKey, trimmedValue === 'true', vscode.ConfigurationTarget.Global);
      } else if (key === 'freeApi') {
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

    if (typeof settings.cacheMaxSize === 'number' && Number.isFinite(settings.cacheMaxSize)) {
      const normalized = Math.max(50, Math.min(5000, Math.round(settings.cacheMaxSize)));
      await cacheCfg.update('maxSize', normalized, vscode.ConfigurationTarget.Global);
    }

    if (typeof settings.journalEnabled === 'boolean') {
      await journalCfg.update('enabled', settings.journalEnabled, vscode.ConfigurationTarget.Global);
    }

    if (settings.layout) {
      const useModelEnabled = typeof settings.layout.useModel === 'boolean'
        ? settings.layout.useModel
        : this.getLayoutConfig().useModel;
      const endpointTrimmed = typeof settings.layout.modelEndpoint === 'string'
        ? settings.layout.modelEndpoint.trim()
        : '';
      const normalizedEndpoint = useModelEnabled
        ? (endpointTrimmed || 'http://127.0.0.1:8765/layout')
        : endpointTrimmed;

      if (typeof settings.layout.useModel === 'boolean') {
        await layoutCfg.update('useModel', settings.layout.useModel, vscode.ConfigurationTarget.Global);
      }
      if (typeof settings.layout.modelEndpoint === 'string' || useModelEnabled) {
        await layoutCfg.update('modelEndpoint', normalizedEndpoint, vscode.ConfigurationTarget.Global);
      }
      if (typeof settings.layout.timeoutMs === 'number' && Number.isFinite(settings.layout.timeoutMs)) {
        const timeout = Math.max(500, Math.min(20000, Math.round(settings.layout.timeoutMs)));
        await layoutCfg.update('timeoutMs', timeout, vscode.ConfigurationTarget.Global);
      }
    }
  }
}
