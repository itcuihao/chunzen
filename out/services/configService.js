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
exports.ConfigService = void 0;
const vscode = __importStar(require("vscode"));
class ConfigService {
    getTranslationConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation');
        return {
            priority: cfg.get('priority', ['baidu', 'deepl', 'openai', 'custom']),
            baidu: {
                appId: cfg.get('baidu.appId', '').trim(),
                secretKey: cfg.get('baidu.secretKey', '').trim()
            },
            deepl: {
                apiKey: cfg.get('deepl.apiKey', '').trim(),
                freeApi: cfg.get('deepl.freeApi', true)
            },
            openai: {
                apiKey: cfg.get('openai.apiKey', '').trim(),
                baseUrl: cfg.get('openai.baseUrl', 'https://api.openai.com/v1').trim(),
                model: cfg.get('openai.model', 'gpt-4o-mini').trim(),
                systemPrompt: cfg.get('openai.systemPrompt', '').trim()
            },
            custom: {
                url: cfg.get('custom.url', '').trim(),
                headers: cfg.get('custom.headers', {}),
                bodyTemplate: cfg.get('custom.bodyTemplate', '{"text": "{{text}}", "target_lang": "ZH"}'),
                responsePath: cfg.get('custom.responsePath', 'result').trim()
            }
        };
    }
    getJournalConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.journal');
        return {
            enabled: cfg.get('enabled', true),
            source: cfg.get('source', 'ablesci')
        };
    }
    getCacheConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.cache');
        return { maxSize: cfg.get('maxSize', 500) };
    }
    getLayoutConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.layout');
        const timeout = cfg.get('timeoutMs', 3500);
        const hoverHighlightStyle = cfg.get('hoverHighlightStyle', 'overlay');
        const theme = cfg.get('theme', 'auto');
        return {
            useModel: cfg.get('useModel', false),
            modelEndpoint: cfg.get('modelEndpoint', '').trim(),
            timeoutMs: Number.isFinite(timeout) ? Math.max(500, Math.min(20000, timeout)) : 3500,
            hoverHighlightStyle: hoverHighlightStyle === 'bar' ? 'bar' : 'overlay',
            theme: theme === 'dark' || theme === 'light' ? theme : 'auto'
        };
    }
    getMineruConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.mineru');
        return {
            enable: cfg.get('enable', false),
            apiType: cfg.get('apiType', 'agent'),
            token: cfg.get('token', '').trim()
        };
    }
    /**
     * Get all engine configs as a flat record for sending to webview
     */
    getEngineConfigs() {
        const tc = this.getTranslationConfig();
        return {
            baidu: { appId: tc.baidu.appId, secretKey: tc.baidu.secretKey },
            deepl: { apiKey: tc.deepl.apiKey, freeApi: String(tc.deepl.freeApi) },
            openai: { apiKey: tc.openai.apiKey, baseUrl: tc.openai.baseUrl, model: tc.openai.model, systemPrompt: tc.openai.systemPrompt },
            custom: { url: tc.custom.url, headers: JSON.stringify(tc.custom.headers), bodyTemplate: tc.custom.bodyTemplate, responsePath: tc.custom.responsePath }
        };
    }
    getEngineStatuses() {
        const cfg = this.getTranslationConfig();
        return [
            { name: 'baidu', displayName: '百度翻译', configured: !!(cfg.baidu.appId && cfg.baidu.secretKey) },
            { name: 'deepl', displayName: 'DeepL', configured: !!cfg.deepl.apiKey },
            { name: 'openai', displayName: 'OpenAI 兼容接口', configured: !!cfg.openai.apiKey },
            { name: 'custom', displayName: '自定义接口', configured: !!cfg.custom.url }
        ];
    }
    /**
     * Save engine config to VSCode settings.
     * Uses workspace settings (settings.json) for non-sensitive values,
     * and secrets storage for API keys when available.
     */
    async saveEngineConfig(engineName, config) {
        const prefix = `chunzen.translation.${engineName}.`;
        const cfg = vscode.workspace.getConfiguration('chunzen.translation');
        for (const [key, value] of Object.entries(config)) {
            const fullKey = `${engineName}.${key}`;
            const trimmedValue = typeof value === 'string' ? value.trim() : value;
            if (key === 'enabled') {
                await cfg.update(fullKey, trimmedValue === 'true', vscode.ConfigurationTarget.Global);
            }
            else if (key === 'freeApi') {
                await cfg.update(fullKey, trimmedValue === 'true', vscode.ConfigurationTarget.Global);
            }
            else if (key === 'headers') {
                try {
                    const parsed = JSON.parse(trimmedValue);
                    await cfg.update(fullKey, parsed, vscode.ConfigurationTarget.Global);
                }
                catch {
                    // If invalid JSON, store as-is
                    await cfg.update(fullKey, trimmedValue, vscode.ConfigurationTarget.Global);
                }
            }
            else {
                await cfg.update(fullKey, trimmedValue, vscode.ConfigurationTarget.Global);
            }
        }
    }
    async saveGeneralSettings(settings) {
        const cacheCfg = vscode.workspace.getConfiguration('chunzen.cache');
        const journalCfg = vscode.workspace.getConfiguration('chunzen.journal');
        const layoutCfg = vscode.workspace.getConfiguration('chunzen.layout');
        if (typeof settings.cacheMaxSize === 'number' && Number.isFinite(settings.cacheMaxSize)) {
            const normalized = Math.max(50, Math.min(5000, Math.round(settings.cacheMaxSize)));
            await cacheCfg.update('maxSize', normalized, vscode.ConfigurationTarget.Global);
        }
        if (typeof settings.journalEnabled === 'boolean') {
            await journalCfg.update('enabled', settings.journalEnabled, vscode.ConfigurationTarget.Global);
        }
        if (settings.journalSource) {
            await journalCfg.update('source', settings.journalSource.type, vscode.ConfigurationTarget.Global);
        }
        if (settings.layout) {
            const useModelEnabled = typeof settings.layout.useModel === 'boolean'
                ? settings.layout.useModel
                : this.getLayoutConfig().useModel;
            const endpointTrimmed = typeof settings.layout.modelEndpoint === 'string'
                ? settings.layout.modelEndpoint.trim()
                : '';
            const normalizedEndpoint = useModelEnabled
                ? (endpointTrimmed || 'http://127.0.0.1:8765/layout')
                : endpointTrimmed;
            if (typeof settings.layout.useModel === 'boolean') {
                await layoutCfg.update('useModel', settings.layout.useModel, vscode.ConfigurationTarget.Global);
            }
            if (typeof settings.layout.modelEndpoint === 'string' || useModelEnabled) {
                await layoutCfg.update('modelEndpoint', normalizedEndpoint, vscode.ConfigurationTarget.Global);
            }
            if (typeof settings.layout.timeoutMs === 'number' && Number.isFinite(settings.layout.timeoutMs)) {
                const timeout = Math.max(500, Math.min(20000, Math.round(settings.layout.timeoutMs)));
                await layoutCfg.update('timeoutMs', timeout, vscode.ConfigurationTarget.Global);
            }
            if (settings.layout.hoverHighlightStyle === 'overlay' || settings.layout.hoverHighlightStyle === 'bar') {
                await layoutCfg.update('hoverHighlightStyle', settings.layout.hoverHighlightStyle, vscode.ConfigurationTarget.Global);
            }
            if (settings.layout.theme === 'auto' || settings.layout.theme === 'dark' || settings.layout.theme === 'light') {
                await layoutCfg.update('theme', settings.layout.theme, vscode.ConfigurationTarget.Global);
            }
        }
        if (settings.mineru) {
            const mineruCfg = vscode.workspace.getConfiguration('chunzen.mineru');
            if (typeof settings.mineru.enable === 'boolean') {
                await mineruCfg.update('enable', settings.mineru.enable, vscode.ConfigurationTarget.Global);
            }
            if (settings.mineru.apiType === 'agent' || settings.mineru.apiType === 'standard') {
                await mineruCfg.update('apiType', settings.mineru.apiType, vscode.ConfigurationTarget.Global);
            }
            if (typeof settings.mineru.token === 'string') {
                await mineruCfg.update('token', settings.mineru.token.trim(), vscode.ConfigurationTarget.Global);
            }
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=configService.js.map