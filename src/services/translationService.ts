import * as vscode from 'vscode';
import { TranslationEngine, TranslationResult, GlossaryEntry } from '../types';
import { CacheService } from './cacheService';
import { GlossaryService } from './glossaryService';
import { getEngines, getTranslationPriority } from './engines/registry';
import { applyGlossary } from './glossaryPostProcess';
import { encodeCacheEntry, decodeCacheEntry } from './translationCacheEntry';

/**
 * 翻译服务 — 多引擎自动降级与术语表动态集成
 */
export class TranslationService {
  private engines: Map<string, TranslationEngine> = new Map();
  private cache: CacheService;

  constructor(context: vscode.ExtensionContext, private glossaryService: GlossaryService) {
    this.cache = new CacheService(context);
    for (const engine of getEngines()) {
      this.engines.set(engine.name, engine);
    }
  }

  async translate(text: string): Promise<TranslationResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { text: '', engine: '', cached: false };
    }

    const cached = this.getCachedEntry(trimmed);
    if (cached) {
      return { text: cached.text, engine: cached.engine, cached: true };
    }

    // 只选择本段中出现的术语
    const matchingTerms = this.glossaryService.getMatchingTerms(trimmed);
    const errors: string[] = [];

    for (const engineName of getTranslationPriority()) {
      const engine = this.engines.get(engineName);
      if (!engine || !engine.isConfigured()) continue;

      try {
        const result = await this.runEngine(engine, trimmed, matchingTerms);
        if (result) {
          this.cache.set(trimmed, encodeCacheEntry(engine.name, result));
          return { text: result, engine: engine.displayName, cached: false };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${engine.displayName}] ${msg}`);
        console.warn(`翻译引擎 ${engine.name} 失败:`, msg);
      }
    }

    throw new Error(
      errors.length > 0
        ? `所有翻译引擎均失败:\n${errors.join('\n')}`
        : '没有可用的翻译引擎，请在设置中配置至少一个翻译 API Key'
    );
  }

  async translateWithEngine(engineName: string, text: string, configOverride?: Record<string, any>): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }

    const engine = this.engines.get(engineName);
    if (!engine) {
      throw new Error(`未找到指定的翻译引擎: ${engineName}`);
    }

    if (!configOverride && !engine.isConfigured()) {
      throw new Error(`翻译引擎 ${engine.displayName} 未配置`);
    }

    const matchingTerms = this.glossaryService.getMatchingTerms(trimmed);
    return this.runEngine(engine, trimmed, matchingTerms, configOverride);
  }

  /**
   * 用第一个已配置且支持对话的引擎（按优先级）完成自定义 prompt 的请求。
   * 没有任何大模型引擎可用时返回 undefined，由调用方决定降级策略。
   */
  async completeWithLlm(systemPrompt: string, userText: string): Promise<string | undefined> {
    for (const engineName of getTranslationPriority()) {
      const engine = this.engines.get(engineName);
      if (engine?.complete && engine.isConfigured()) {
        return engine.complete(systemPrompt, userText);
      }
    }
    return undefined;
  }

  getCachedTranslation(text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    return this.getCachedEntry(trimmed)?.text;
  }

  clearCache(): void {
    this.cache.clear();
    vscode.window.showInformationMessage('春蝉：翻译缓存已清除');
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getConfiguredEngines(): string[] {
    return [...this.engines.values()]
      .filter(e => e.isConfigured())
      .map(e => e.displayName);
  }

  private getCachedEntry(trimmedText: string) {
    const raw = this.cache.get(trimmedText);
    return raw === undefined ? undefined : decodeCacheEntry(raw);
  }

  /**
   * 调用引擎翻译；不支持在 prompt 中携带术语表的引擎（百度/DeepL/自定义），
   * 在本地对结果做术语后处理。
   */
  private async runEngine(
    engine: TranslationEngine,
    text: string,
    glossary: GlossaryEntry[],
    configOverride?: Record<string, any>
  ): Promise<string> {
    const raw = await engine.translate(text, undefined, undefined, glossary, configOverride);
    return engine.usesGlossaryPrompt ? raw : applyGlossary(raw, glossary);
  }
}
