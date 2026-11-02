import * as vscode from 'vscode';
import type { TranslationEngine, GlossaryEntry } from '../../types';
import { customFetch } from '../../utils/fetch';
import { getByPath, renderBodyTemplate } from '../../utils/engineHelpers';
import { resolveOpenAiBaseUrl, resolveOpenAiModel } from './defaults';
import { DEFAULT_TRANSLATION_SYSTEM_PROMPT, buildGlossaryPrompt } from './llmPrompt';

class NonRetryableError extends Error {}

/**
 * OpenAI 兼容接口翻译引擎（DeepSeek 等遵循 chat/completions 格式的服务均可）
 */
export class OpenAIEngine implements TranslationEngine {
  name = 'openai';
  displayName = 'OpenAI 兼容接口';
  usesGlossaryPrompt = true;

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
    const apiKey = (cfg.get<string>('apiKey') || '').trim();
    return !!apiKey
      && !!resolveOpenAiBaseUrl(cfg.get<string>('baseUrl'))
      && !!resolveOpenAiModel(cfg.get<string>('model'));
  }

  async translate(text: string, _sourceLang?: string, _targetLang?: string, glossary?: GlossaryEntry[], configOverride?: Record<string, any>): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
    const systemPrompt = (configOverride?.systemPrompt ?? cfg.get<string>('systemPrompt', '')).trim()
      || DEFAULT_TRANSLATION_SYSTEM_PROMPT;
    return this.complete(systemPrompt + buildGlossaryPrompt(glossary), text, configOverride);
  }

  async complete(systemPrompt: string, userText: string, configOverride?: Record<string, any>): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
    const apiKey = (configOverride?.apiKey ?? cfg.get<string>('apiKey', '')).trim();
    const baseUrl = resolveOpenAiBaseUrl(configOverride?.baseUrl ?? cfg.get<string>('baseUrl'));
    const model = resolveOpenAiModel(configOverride?.model ?? cfg.get<string>('model'));

    if (!apiKey) {
      throw new Error('OpenAI 兼容接口未配置 API Key');
    }
    // API Key 只发往用户亲手填写的地址；地址为空或非法时在发请求之前就失败
    if (!baseUrl) {
      throw new Error('OpenAI 兼容接口未配置 Base URL，API Key 不会被发送。请在设置中填写接口地址');
    }
    if (!model) {
      throw new Error('OpenAI 兼容接口未配置模型名称，API Key 不会被发送。请在设置中填写模型名称');
    }

    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = attempt * 1500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const resp = await customFetch(baseUrl + '/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText }
            ],
            temperature: 0.3,
            max_tokens: 1024
          }),
          signal: AbortSignal.timeout(30000)
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
            console.warn(`[OpenAIEngine] 触发频率限制或服务暂不可用 (${resp.status})，准备重试 (${attempt + 1}/${maxRetries})...`);
            continue;
          }
          throw new NonRetryableError(`OpenAI 兼容接口请求失败 ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message: string };
        };

        if (data.error) {
          throw new NonRetryableError(`OpenAI 兼容接口错误: ${data.error.message}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new NonRetryableError('OpenAI 兼容接口返回空结果');
        }

        return content.trim();
      } catch (err) {
        if (err instanceof NonRetryableError) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt >= maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('OpenAI 兼容接口请求失败');
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

  async translate(text: string, sourceLang?: string, targetLang?: string, glossary?: GlossaryEntry[], configOverride?: Record<string, any>): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.custom');
    const url = (configOverride?.url ?? cfg.get<string>('url', '')).trim();
    
    let headers: Record<string, string> = {};
    const rawHeaders = configOverride?.headers ?? cfg.get<any>('headers', {});
    if (typeof rawHeaders === 'string') {
      try {
        headers = JSON.parse(rawHeaders);
      } catch (e) {
        // ignore
      }
    } else if (rawHeaders && typeof rawHeaders === 'object') {
      headers = rawHeaders;
    }

    const bodyTemplate = configOverride?.bodyTemplate ?? cfg.get<string>(
      'bodyTemplate',
      '{"text": "{{text}}", "target_lang": "ZH"}'
    );
    const responsePath = (configOverride?.responsePath ?? cfg.get<string>('responsePath', 'result')).trim();

    if (!url) {
      throw new Error('自定义接口未配置 URL');
    }

    const body = renderBodyTemplate(bodyTemplate, text);

    const resp = await customFetch(url, {
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
    const result = getByPath(data, responsePath);

    if (typeof result !== 'string') {
      throw new Error(`自定义接口响应路径 "${responsePath}" 未找到字符串结果`);
    }

    return result;
  }
}
