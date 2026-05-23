import * as vscode from 'vscode';
import { TranslationEngine, GlossaryEntry } from '../../types';

/**
 * OpenAI / Gemini / 自定义兼容接口翻译引擎
 */
export class OpenAIEngine implements TranslationEngine {
  name = 'openai';
  displayName = 'AI 翻译';

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
    const apiKey = (cfg.get<string>('apiKey') || '').trim();
    return !!apiKey;
  }

  async translate(text: string, sourceLang?: string, targetLang?: string, glossary?: GlossaryEntry[]): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
    const apiKey = cfg.get<string>('apiKey', '').trim();
    const baseUrl = cfg.get<string>('baseUrl', 'https://api.openai.com/v1').trim();
    const model = cfg.get<string>('model', 'gpt-4o-mini').trim();
    const systemPrompt = cfg.get<string>(
      'systemPrompt',
      '你是一个学术论文翻译专家。请将以下英文学术句子翻译成中文，保持专业术语准确，语言简洁流畅。只输出翻译结果，不要解释。'
    );

    if (!apiKey) {
      throw new Error('OpenAI/AI 引擎未配置 API Key');
    }

    let glossaryPrompt = '';
    if (glossary && glossary.length > 0) {
      glossaryPrompt = '\n\n在翻译时，请严格遵守以下学术专有名词/术语对照表：\n' +
        glossary.map(g => `- ${g.source} -> ${g.target}`).join('\n');
    }

    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt + glossaryPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 1024
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`AI 翻译请求失败 ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`AI 翻译错误: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI 翻译返回空结果');
    }

    return content.trim();
  }
}

/**
 * 自定义 HTTP 接口翻译引擎
 */
export class CustomHttpEngine implements TranslationEngine {
  name = 'custom';
  displayName = '自定义接口';

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.custom');
    const url = (cfg.get<string>('url') || '').trim();
    return !!url;
  }

  async translate(text: string, sourceLang?: string, targetLang?: string, glossary?: GlossaryEntry[]): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.custom');
    const url = cfg.get<string>('url', '').trim();
    const headers = cfg.get<Record<string, string>>('headers', {});
    const bodyTemplate = cfg.get<string>(
      'bodyTemplate',
      '{"text": "{{text}}", "target_lang": "ZH"}'
    );
    const responsePath = cfg.get<string>('responsePath', 'result').trim();

    if (!url) {
      throw new Error('自定义接口未配置 URL');
    }

    const body = bodyTemplate.replace('{{text}}', JSON.stringify(text).slice(1, -1));

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body,
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      throw new Error(`自定义接口请求失败: ${resp.status}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;

    // 按路径提取结果，如 "data.translation"
    const result = responsePath.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, data);

    if (typeof result !== 'string') {
      throw new Error(`自定义接口响应路径 "${responsePath}" 未找到字符串结果`);
    }

    return result;
  }
}
