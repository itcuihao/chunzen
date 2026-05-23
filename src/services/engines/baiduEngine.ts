import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TranslationEngine, GlossaryEntry } from '../../types';

/**
 * 百度翻译引擎
 * 文档：https://fanyi-api.baidu.com/doc/21
 */
export class BaiduEngine implements TranslationEngine {
  name = 'baidu';
  displayName = '百度翻译';

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.baidu');
    const appId = (cfg.get<string>('appId') || '').trim();
    const secretKey = (cfg.get<string>('secretKey') || '').trim();
    return !!(appId && secretKey);
  }

  async translate(text: string, _sourceLang = 'en', _targetLang = 'zh', glossary?: GlossaryEntry[]): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.baidu');
    const appId = cfg.get<string>('appId', '').trim();
    const secretKey = cfg.get<string>('secretKey', '').trim();

    if (!appId || !secretKey) {
      throw new Error('百度翻译未配置');
    }

    const salt = Date.now().toString();
    const sign = crypto
      .createHash('md5')
      .update(appId + text + salt + secretKey)
      .digest('hex');

    const params = new URLSearchParams({
      q: text,
      from: 'en',
      to: 'zh',
      appid: appId,
      salt,
      sign
    });

    const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!resp.ok) {
      throw new Error(`百度翻译请求失败: ${resp.status}`);
    }

    const data = (await resp.json()) as {
      trans_result?: Array<{ dst: string }>;
      error_code?: string;
      error_msg?: string;
    };

    if (data.error_code) {
      throw new Error(`百度翻译错误 ${data.error_code}: ${data.error_msg}`);
    }

    if (!data.trans_result?.length) {
      throw new Error('百度翻译返回空结果');
    }

    return data.trans_result.map(r => r.dst).join('\n');
  }
}
