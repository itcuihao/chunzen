import * as vscode from 'vscode';

export class ConfigService {
  getTranslationConfig() {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation');
    return {
      priority: cfg.get<string[]>('priority', ['baidu', 'deepl', 'openai', 'custom', 'claudeCli']),
      baidu: {
        appId: cfg.get<string>('baidu.appId', ''),
        secretKey: cfg.get<string>('baidu.secretKey', '')
      },
      deepl: {
        apiKey: cfg.get<string>('deepl.apiKey', ''),
        freeApi: cfg.get<boolean>('deepl.freeApi', true)
      },
      openai: {
        apiKey: cfg.get<string>('openai.apiKey', ''),
        baseUrl: cfg.get<string>('openai.baseUrl', 'https://api.openai.com/v1'),
        model: cfg.get<string>('openai.model', 'gpt-4o-mini'),
        systemPrompt: cfg.get<string>('openai.systemPrompt', '')
      },
      custom: {
        url: cfg.get<string>('custom.url', ''),
        headers: cfg.get<Record<string, string>>('custom.headers', {}),
        bodyTemplate: cfg.get<string>('custom.bodyTemplate', '{"text": "{{text}}", "target_lang": "ZH"}'),
        responsePath: cfg.get<string>('custom.responsePath', 'result')
      },
      claudeCli: {
        enabled: cfg.get<boolean>('claudeCli.enabled', false),
        prompt: cfg.get<string>('claudeCli.prompt', '')
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

      if (key === 'enabled') {
        await cfg.update(fullKey, value === 'true', vscode.ConfigurationTarget.Global);
      } else if (key === 'freeApi') {
        await cfg.update(fullKey, value === 'true', vscode.ConfigurationTarget.Global);
      } else if (key === 'headers') {
        try {
          const parsed = JSON.parse(value);
          await cfg.update(fullKey, parsed, vscode.ConfigurationTarget.Global);
        } catch {
          // If invalid JSON, store as-is
          await cfg.update(fullKey, value, vscode.ConfigurationTarget.Global);
        }
      } else {
        await cfg.update(fullKey, value, vscode.ConfigurationTarget.Global);
      }
    }
  }
}