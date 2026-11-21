import * as vscode from 'vscode';
import type { TranslationEngine, GlossaryEntry } from '../../types';
import { customFetch } from '../../utils/fetch';
import { getByPath, renderBodyTemplate } from '../../utils/engineHelpers';
import { resolveOpenAiBaseUrl, resolveOpenAiModel, resolveOpenAiTimeout } from './defaults';
import { DEFAULT_TRANSLATION_SYSTEM_PROMPT, buildGlossaryPrompt } from './llmPrompt';
import {
  OpenAiRequestError,
  chatCompletionsCandidates,
  extractApiError,
  extractAssistantContent,
  extractModelIds,
  httpFailureHint,
  modelListCandidates,
  parseJson,
  previewText
} from './openaiCompat';

const SCOPE = 'chunzen.translation.openai';

/** 401/403/404/400 等确定性错误不重试；只有网络抖动和 429/5xx 才值得重试 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

type OpenAiSettings = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs: number;
};

/**
 * OpenAI 兼容接口翻译引擎（DeepSeek / 智谱 / 硅基流动 / Ollama 以及各类
 * 中转站等遵循 chat/completions 格式的服务均可）
 *
 * 请求链路要点：
 * - Base URL 三种填法（根地址 / 带 /v1 / 完整 endpoint）都自动尝试，避免用户猜路径
 * - 错误信息带上实际请求地址 + 状态码 + 处置建议，测试连接能直接定位问题
 * - 非 JSON 响应（网关 HTML、代理错误页）单独报错，不再抛 `Unexpected token '<'`
 */
export class OpenAIEngine implements TranslationEngine {
  name = 'openai';
  displayName = 'OpenAI 兼容接口';
  usesGlossaryPrompt = true;

  isConfigured(): boolean {
    return this.readSettings({}).configured;
  }

  async translate(
    text: string,
    _sourceLang?: string,
    _targetLang?: string,
    glossary?: GlossaryEntry[],
    configOverride?: Record<string, any>
  ): Promise<string> {
    const settings = this.readSettings(configOverride ?? {});
    const systemPrompt = this.resolveSystemPrompt(configOverride ?? {});
    return this.chat(settings, systemPrompt + buildGlossaryPrompt(glossary), text);
  }

  async complete(systemPrompt: string, userText: string, configOverride?: Record<string, any>): Promise<string> {
    return this.chat(this.readSettings(configOverride ?? {}), systemPrompt, userText);
  }

  /** 设置页“测试连接 / 拉取模型列表”使用：返回结构化结果，而不是抛异常 */
  async diagnose(baseUrl?: string, apiKey?: string, timeoutMs?: number): Promise<{
    ok: boolean;
    message: string;
    hint?: string;
    requestUrl?: string;
    modelCount?: number;
    models?: string[];
  }> {
    const candidates = modelListCandidates(baseUrl);
    if (candidates.length === 0) {
      return { ok: false, message: 'Base URL 不可用：需填写 http(s) 开头的完整地址' };
    }
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, message: '未填写 API Key，无法验证认证与模型列表' };
    }

    const timeout = resolveOpenAiTimeout(timeoutMs);
    const failures: string[] = [];

    for (const url of candidates) {
      try {
        const resp = await customFetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          signal: AbortSignal.timeout(Math.min(timeout, 20000))
        });
        const bodyText = await resp.text().catch(() => '');
        const payload = parseJson(bodyText);

        if (!resp.ok) {
          const detail = extractApiError(payload) || previewText(bodyText, 160);
          failures.push(`${resp.status} ${url}${detail ? ` — ${detail}` : ''}`);
          // 401/403 说明地址是对的，只是 Key 有问题：直接返回，不再试别的路径
          if (resp.status === 401 || resp.status === 403) {
            return {
              ok: false,
              message: `认证失败 ${resp.status}`,
              hint: httpFailureHint(resp.status),
              requestUrl: url
            };
          }
          continue;
        }

        const models = extractModelIds(payload);
        return {
          ok: true,
          message: models.length > 0
            ? `连接正常，接口返回 ${models.length} 个模型`
            : '连接正常（该服务未提供模型列表，可直接用下方“测试翻译”验证）',
          requestUrl: url,
          modelCount: models.length,
          models
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures.push(`${url} — ${reason}`);
      }
    }

    const lastStatus = /^(\d{3}) /.exec(failures[0] ?? '')?.[1];
    return {
      ok: false,
      message: failures[0] || '连接失败',
      hint: lastStatus ? httpFailureHint(Number(lastStatus)) : '请检查网络、代理设置与 Base URL 是否可访问',
      requestUrl: candidates[0]
    };
  }

  private resolveSystemPrompt(override: Record<string, any>): string {
    const cfg = vscode.workspace.getConfiguration(SCOPE);
    const raw = override.systemPrompt ?? cfg.get<string>('systemPrompt', '');
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed || DEFAULT_TRANSLATION_SYSTEM_PROMPT;
  }

  /**
   * 读取设置。空字符串视为“未填写”，不会覆盖已保存的值——
   * 设置页的表单字段未改动时就是空串，用 `??` 会导致“测试连接”读不到已保存的 Key。
   */
  private readSettings(override: Record<string, any>): OpenAiSettings & { configured: boolean } {
    const cfg = vscode.workspace.getConfiguration(SCOPE);
    const pick = (key: string): unknown => {
      const fromOverride = override[key];
      if (typeof fromOverride === 'string' && fromOverride.trim()) return fromOverride;
      if (fromOverride !== undefined && typeof fromOverride !== 'string') return fromOverride;
      return cfg.get(key);
    };

    const apiKey = String(pick('apiKey') ?? '').trim();
    const baseUrl = resolveOpenAiBaseUrl(pick('baseUrl'));
    const model = resolveOpenAiModel(pick('model'));
    const timeoutMs = resolveOpenAiTimeout(pick('timeoutMs'));

    return { apiKey, baseUrl, model, timeoutMs, configured: !!apiKey && !!baseUrl && !!model };
  }

  /** 单次对话请求：按候选地址依次尝试，只有网络抖动/429/5xx 才重试同一地址 */
  private async chat(settings: OpenAiSettings & { configured: boolean }, systemPrompt: string, userText: string): Promise<string> {
    const { apiKey, baseUrl, model, timeoutMs } = settings;

    if (!apiKey) {
      throw new OpenAiRequestError('未填写 API Key', undefined, undefined, '在设置 → 翻译引擎 → OpenAI 兼容接口 中填入 API Key');
    }
    // API Key 只发往用户亲手填写的地址；地址为空或非法时在发请求之前就失败
    if (!baseUrl) {
      throw new OpenAiRequestError(
        'Base URL 为空或不是 http(s) 地址，API Key 不会被发送',
        undefined,
        undefined,
        '填写服务商控制台给出的接口地址，通常以 /v1 结尾'
      );
    }
    if (!model) {
      throw new OpenAiRequestError(
        '模型名称为空，API Key 不会被发送',
        undefined,
        undefined,
        '填写服务商控制台里的模型 ID，例如 deepseek-chat；也可点“拉取模型列表”挑选'
      );
    }

    // 参数分级：部分服务商（如 DeepSeek 推理模型、某些中转）会拒绝 temperature/max_tokens，
    // 被拒时逐级降级重试，而不是直接让用户看到 400。
    const payloadLevels: Array<Record<string, unknown>> = [
      { temperature: 0.3, max_tokens: 2048, stream: false },
      { max_tokens: 2048, stream: false },
      {}
    ];

    const candidates = chatCompletionsCandidates(baseUrl);
    const failures: string[] = [];
    let unauthorized: OpenAiRequestError | undefined;
    let level = 0;

    for (const url of candidates) {
      let attempt = 0;
      while (attempt <= 1) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));

        try {
          const body = JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText }
            ],
            ...payloadLevels[level]
          });

          const resp = await customFetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body,
            signal: AbortSignal.timeout(timeoutMs)
          });

          const rawText = await resp.text().catch(() => '');
          const payload = parseJson(rawText);

          if (!resp.ok) {
            const detail = extractApiError(payload) || previewText(rawText, 300);
            const err = new OpenAiRequestError(
              `HTTP ${resp.status}${detail ? `：${detail}` : ''}`,
              url,
              resp.status,
              httpFailureHint(resp.status)
            );
            if (resp.status === 401 || resp.status === 403) {
              // 地址可达但认证失败，换路径没有意义
              unauthorized = err;
              break;
            }
            // 400/422 且还有更宽松的参数组合：降级参数后重试同一地址
            const isParamRejection = resp.status === 400 || resp.status === 422;
            if (isParamRejection && level < payloadLevels.length - 1) {
              level += 1; // 降级参数后立即重试，不消耗重试次数
              continue;
            }
            if (isRetryableStatus(resp.status) && attempt < 1) {
              attempt += 1;
              continue;
            }
            failures.push(`${url} → HTTP ${resp.status}${detail ? `：${detail}` : ''}`);
            break;
          }

          if (payload === undefined) {
            throw new OpenAiRequestError(
              `响应不是 JSON：${previewText(rawText, 160) || '(空响应)'}`,
              url,
              resp.status,
              '该地址返回的可能是网页或错误页，请确认 Base URL 指向 OpenAI 兼容接口而不是站点首页'
            );
          }

          const apiError = extractApiError(payload);
          if (apiError) {
            throw new OpenAiRequestError(`接口返回错误：${apiError}`, url, resp.status);
          }

          const content = extractAssistantContent(payload);
          if (!content || !content.trim()) {
            throw new OpenAiRequestError('接口返回 200 但内容为空', url, resp.status, '模型名可能在该服务商不存在，或该模型不支持 chat/completions');
          }
          return content.trim();
        } catch (err) {
          const isAbort = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
          const wrapped = err instanceof OpenAiRequestError
            ? err
            : new OpenAiRequestError(
              isAbort ? `请求超时（${Math.round(timeoutMs / 1000)}s）` : (err instanceof Error ? err.message : String(err)),
              url,
              undefined,
              isAbort ? '可在本引擎设置中把超时时间调大' : '检查网络、代理设置（VS Code 的 http.proxy 或系统代理）'
            );

          if (attempt < 1 && !(err instanceof OpenAiRequestError)) {
            attempt += 1;
            continue;
          }
          failures.push(`${url} → ${wrapped.message}`);
          break;
        }
      }
      if (unauthorized) break;
    }

    if (unauthorized) throw unauthorized;

    const first = failures[0] || '请求失败';
    throw new OpenAiRequestError(
      failures.length > 1 ? `${first}（共尝试 ${failures.length} 个地址）` : first,
      candidates[0],
      undefined,
      httpFailureHint(Number(/HTTP (\d{3})/.exec(first)?.[1] ?? NaN))
    );
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
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`自定义接口请求失败 ${resp.status}${errText ? `: ${previewText(errText, 160)}` : ''}`);
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
