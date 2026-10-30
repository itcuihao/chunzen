import * as vscode from 'vscode';
import { TranslationEngine, GlossaryEntry } from '../../types';
import { customFetch } from '../../utils/fetch';
import { DEFAULT_TRANSLATION_SYSTEM_PROMPT, buildGlossaryPrompt } from './llmPrompt';

/**
 * Anthropic Messages API 翻译引擎
 * 支持自定义 endpoint 和 model，适用于任何兼容 Anthropic API 的服务
 */
export class AnthropicEngine implements TranslationEngine {
  name = 'anthropic';
  displayName = 'Anthropic API';
  usesGlossaryPrompt = true;

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
    return !!((cfg.get<string>('apiKey') || '').trim() && (cfg.get<string>('baseUrl') || '').trim());
  }

  async translate(text: string, _sourceLang?: string, _targetLang?: string, glossary?: GlossaryEntry[], configOverride?: Record<string, any>): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
    const systemPrompt = (configOverride?.systemPrompt ?? cfg.get<string>('systemPrompt', '')).trim()
      || DEFAULT_TRANSLATION_SYSTEM_PROMPT;
    return this.complete(systemPrompt + buildGlossaryPrompt(glossary), text, configOverride);
  }

  async complete(systemPrompt: string, userText: string, configOverride?: Record<string, any>): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
    const apiKey = (configOverride?.apiKey ?? cfg.get<string>('apiKey', '')).trim();
    const baseUrl = (configOverride?.baseUrl ?? cfg.get<string>('baseUrl', '')).trim().replace(/\/$/, '');
    const model = (configOverride?.model ?? cfg.get<string>('model', 'mimo-v2.5-pro')).trim();

    if (!apiKey || !baseUrl) {
      throw new Error('Anthropic API 未配置');
    }

    const resp = await customFetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userText }]
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

    // 响应可能含多个 content block（text + thinking），只取 text
    const textBlock = data.content?.find(c => c.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Anthropic API 返回空结果');
    }

    return textBlock.text.trim();
  }
}
