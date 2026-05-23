import * as vscode from 'vscode';
import { TranslationEngine, GlossaryEntry } from '../../types';

/**
 * Anthropic Messages API 翻译引擎
 * 支持自定义 endpoint 和 model，适用于任何兼容 Anthropic API 的服务
 */
export class AnthropicEngine implements TranslationEngine {
  name = 'anthropic';
  displayName = 'Anthropic API';

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
    return !!(cfg.get<string>('apiKey') && cfg.get<string>('baseUrl'));
  }

  async translate(text: string, sourceLang?: string, targetLang?: string, glossary?: GlossaryEntry[]): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
    const apiKey = cfg.get<string>('apiKey', '');
    const baseUrl = cfg.get<string>('baseUrl', '').replace(/\/$/, '');
    const model = cfg.get<string>('model', 'mimo-v2.5-pro');
    const systemPrompt = cfg.get<string>(
      'systemPrompt',
      '你是一个学术论文翻译专家。请将以下英文学术句子翻译成中文，保持专业术语准确，语言简洁流畅。只输出翻译结果，不要解释。'
    );

    if (!apiKey || !baseUrl) {
      throw new Error('Anthropic API 未配置');
    }

    let glossaryPrompt = '';
    if (glossary && glossary.length > 0) {
      glossaryPrompt = '\n\n在翻译时，请严格遵守以下学术专有名词/术语对照表：\n' +
        glossary.map(g => `- ${g.source} -> ${g.target}`).join('\n');
    }

    const url = `${baseUrl}/v1/messages`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: systemPrompt + glossaryPrompt,
        messages: [
          { role: 'user', content: text }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Anthropic API 请求失败 ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`Anthropic API 错误: ${data.error.message}`);
    }

    // Anthropic Messages API 返回多个 content block（text + thinking），只取 text
    const textBlock = data.content?.find(c => c.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Anthropic API 返回空结果');
    }

    return textBlock.text.trim();
  }
}