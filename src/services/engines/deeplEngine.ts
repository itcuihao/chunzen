import * as vscode from 'vscode';
import { TranslationEngine } from '../../types';

/**
 * DeepL 翻译引擎
 * 文档：https://www.deepl.com/docs-api
 */
export class DeepLEngine implements TranslationEngine {
  name = 'deepl';
  displayName = 'DeepL';

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.deepl');
    const apiKey = (cfg.get<string>('apiKey') || '').trim();
    return !!apiKey;
  }

  async translate(text: string): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.deepl');
    const apiKey = cfg.get<string>('apiKey', '').trim();
    const freeApi = cfg.get<boolean>('freeApi', true);

    if (!apiKey) {
      throw new Error('DeepL 未配置 API Key');
    }

    const baseUrl = freeApi
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        source_lang: 'EN',
        target_lang: 'ZH'
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`DeepL 请求失败 ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as {
      translations?: Array<{ text: string }>;
    };

    if (!data.translations?.length) {
      throw new Error('DeepL 返回空结果');
    }

    return data.translations[0].text;
  }
}
