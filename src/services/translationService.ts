import * as vscode from 'vscode';
import { TranslationEngine, TranslationResult } from '../types';
import { BaiduEngine } from './engines/baiduEngine';
import { DeepLEngine } from './engines/deeplEngine';
import { OpenAIEngine, CustomHttpEngine } from './engines/openaiEngine';
import { ClaudeCliEngine } from './engines/claudeCliEngine';
import { CacheService } from './cacheService';

/**
 * 翻译服务 — 多引擎自动降级
 */
export class TranslationService {
  private engines: Map<string, TranslationEngine> = new Map();
  private cache: CacheService;

  constructor(context: vscode.ExtensionContext) {
    this.cache = new CacheService(context);
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
        const result = await engine.translate(trimmed);
        if (result) {
          // 存入缓存（引擎名 + 翻译结果）
          this.cache.set(cacheKey, `${engine.name}\x00${result}`);
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
}
