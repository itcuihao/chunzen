import * as vscode from 'vscode';
import { TranslationEngine, TranslationResult, GlossaryEntry } from '../types';
import { BaiduEngine } from './engines/baiduEngine';
import { DeepLEngine } from './engines/deeplEngine';
import { OpenAIEngine, CustomHttpEngine } from './engines/openaiEngine';
import { ClaudeCliEngine } from './engines/claudeCliEngine';
import { CacheService } from './cacheService';
import { GlossaryService } from './glossaryService';

/**
 * 翻译服务 — 多引擎自动降级与术语表动态集成
 */
export class TranslationService {
  private engines: Map<string, TranslationEngine> = new Map();
  private cache: CacheService;
  private glossaryService: GlossaryService;

  constructor(context: vscode.ExtensionContext) {
    this.cache = new CacheService(context);
    this.glossaryService = new GlossaryService(context);
    this.engines.set('baidu', new BaiduEngine());
    this.engines.set('deepl', new DeepLEngine());
    this.engines.set('openai', new OpenAIEngine());
    this.engines.set('custom', new CustomHttpEngine());
    this.engines.set('claudeCli', new ClaudeCliEngine());
  }

  async translate(text: string): Promise<TranslationResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { text: '', engine: '', cached: false };
    }

    // 检查缓存
    const cacheKey = trimmed;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const [engine, translation] = cached.split('\x00');
      return { text: translation, engine, cached: true };
    }

    // 扫描匹配的术语（优化：只选择本段中出现的词汇）
    const matchingTerms = this.glossaryService.getMatchingTerms(trimmed);

    // 按优先级尝试各引擎
    const priority = vscode.workspace
      .getConfiguration('chunzen.translation')
      .get<string[]>('priority', ['baidu', 'deepl', 'openai', 'custom', 'claudeCli']);

    const errors: string[] = [];

    for (const engineName of priority) {
      const engine = this.engines.get(engineName);
      if (!engine) continue;
      if (!engine.isConfigured()) continue;

      try {
        const result = await engine.translate(trimmed, undefined, undefined, matchingTerms);
        if (result) {
          // 如果是非大模型（如百度、DeepL、自定义接口），在本地进行后处理词汇替换
          let processedResult = result;
          if (engineName === 'baidu' || engineName === 'deepl' || engineName === 'custom') {
            processedResult = this.postProcessGlossary(processedResult, matchingTerms);
          }

          // 存入缓存（引擎名 + 翻译结果）
          this.cache.set(cacheKey, `${engine.name}\x00${processedResult}`);
          return { text: processedResult, engine: engine.displayName, cached: false };
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

  async translateWithEngine(engineName: string, text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }

    const engine = this.engines.get(engineName);
    if (!engine) {
      throw new Error(`未找到指定的翻译引擎: ${engineName}`);
    }

    if (!engine.isConfigured()) {
      throw new Error(`翻译引擎 ${engine.displayName} 未配置`);
    }

    const matchingTerms = this.glossaryService.getMatchingTerms(trimmed);
    const result = await engine.translate(trimmed, undefined, undefined, matchingTerms);

    if (engineName === 'baidu' || engineName === 'deepl' || engineName === 'custom') {
      return this.postProcessGlossary(result, matchingTerms);
    }
    return result;
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

  /**
   * 对非大模型翻译结果进行后处理纠偏替换
   */
  private postProcessGlossary(translatedText: string, glossary: GlossaryEntry[]): string {
    let result = translatedText;
    for (const term of glossary) {
      const sources = term.source.split('|').map(s => s.trim());
      for (const s of sources) {
        if (!s) continue;
        const isEnglish = /^[a-zA-Z\s\-_]+$/.test(s);
        const escS = s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const reg = isEnglish ? new RegExp(`\\b${escS}\\b`, 'gi') : new RegExp(escS, 'g');
        result = result.replace(reg, term.target);
      }
    }
    return result;
  }
}
