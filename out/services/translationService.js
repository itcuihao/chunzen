"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationService = void 0;
const vscode = __importStar(require("vscode"));
const baiduEngine_1 = require("./engines/baiduEngine");
const deeplEngine_1 = require("./engines/deeplEngine");
const openaiEngine_1 = require("./engines/openaiEngine");
const claudeCliEngine_1 = require("./engines/claudeCliEngine");
const cacheService_1 = require("./cacheService");
/**
 * 翻译服务 — 多引擎自动降级
 */
class TranslationService {
    engines = new Map();
    cache;
    constructor(context) {
        this.cache = new cacheService_1.CacheService(context);
        this.engines.set('baidu', new baiduEngine_1.BaiduEngine());
        this.engines.set('deepl', new deeplEngine_1.DeepLEngine());
        this.engines.set('openai', new openaiEngine_1.OpenAIEngine());
        this.engines.set('custom', new openaiEngine_1.CustomHttpEngine());
        this.engines.set('claudeCli', new claudeCliEngine_1.ClaudeCliEngine());
    }
    async translate(text) {
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
            .get('priority', ['baidu', 'deepl', 'openai', 'custom', 'claudeCli']);
        const errors = [];
        for (const engineName of priority) {
            const engine = this.engines.get(engineName);
            if (!engine)
                continue;
            if (!engine.isConfigured())
                continue;
            try {
                const result = await engine.translate(trimmed);
                if (result) {
                    // 存入缓存（引擎名 + 翻译结果）
                    this.cache.set(cacheKey, `${engine.name}\x00${result}`);
                    return { text: result, engine: engine.displayName, cached: false };
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`[${engine.displayName}] ${msg}`);
                console.warn(`翻译引擎 ${engine.name} 失败:`, msg);
            }
        }
        throw new Error(errors.length > 0
            ? `所有翻译引擎均失败:\n${errors.join('\n')}`
            : '没有可用的翻译引擎，请在设置中配置至少一个翻译 API Key');
    }
    clearCache() {
        this.cache.clear();
        vscode.window.showInformationMessage('春蝉：翻译缓存已清除');
    }
    getCacheSize() {
        return this.cache.size;
    }
    getConfiguredEngines() {
        return [...this.engines.values()]
            .filter(e => e.isConfigured())
            .map(e => e.displayName);
    }
}
exports.TranslationService = TranslationService;
//# sourceMappingURL=translationService.js.map