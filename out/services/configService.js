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
            priority: cfg.get('priority', ['baidu', 'deepl', 'openai', 'custom', 'claudeCli']),
            baidu: {
                appId: cfg.get('baidu.appId', ''),
                secretKey: cfg.get('baidu.secretKey', '')
            },
            deepl: {
                apiKey: cfg.get('deepl.apiKey', ''),
                freeApi: cfg.get('deepl.freeApi', true)
            },
            openai: {
                apiKey: cfg.get('openai.apiKey', ''),
                baseUrl: cfg.get('openai.baseUrl', 'https://api.openai.com/v1'),
                model: cfg.get('openai.model', 'gpt-4o-mini'),
                systemPrompt: cfg.get('openai.systemPrompt', '')
            },
            custom: {
                url: cfg.get('custom.url', ''),
                headers: cfg.get('custom.headers', {}),
                bodyTemplate: cfg.get('custom.bodyTemplate', '{"text": "{{text}}", "target_lang": "ZH"}'),
                responsePath: cfg.get('custom.responsePath', 'result')
            },
            claudeCli: {
                enabled: cfg.get('claudeCli.enabled', false),
                prompt: cfg.get('claudeCli.prompt', '')
            }
        };
    }
    getJournalConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.journal');
        return { enabled: cfg.get('enabled', true) };
    }
    getCacheConfig() {
        const cfg = vscode.workspace.getConfiguration('chunzen.cache');
        return { maxSize: cfg.get('maxSize', 500) };
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
            custom: { url: tc.custom.url, headers: JSON.stringify(tc.custom.headers), bodyTemplate: tc.custom.bodyTemplate, responsePath: tc.custom.responsePath },
            claudeCli: { enabled: String(tc.claudeCli.enabled), prompt: tc.claudeCli.prompt }
        };
    }
    getEngineStatuses() {
        const cfg = this.getTranslationConfig();
        return [
            { name: 'baidu', displayName: '百度翻译', configured: !!(cfg.baidu.appId && cfg.baidu.secretKey) },
            { name: 'deepl', displayName: 'DeepL', configured: !!cfg.deepl.apiKey },
            { name: 'openai', displayName: 'AI 翻译', configured: !!cfg.openai.apiKey },
            { name: 'custom', displayName: '自定义接口', configured: !!cfg.custom.url },
            { name: 'claudeCli', displayName: 'Claude CLI', configured: cfg.claudeCli.enabled }
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
            if (key === 'enabled') {
                await cfg.update(fullKey, value === 'true', vscode.ConfigurationTarget.Global);
            }
            else if (key === 'freeApi') {
                await cfg.update(fullKey, value === 'true', vscode.ConfigurationTarget.Global);
            }
            else if (key === 'headers') {
                try {
                    const parsed = JSON.parse(value);
                    await cfg.update(fullKey, parsed, vscode.ConfigurationTarget.Global);
                }
                catch {
                    // If invalid JSON, store as-is
                    await cfg.update(fullKey, value, vscode.ConfigurationTarget.Global);
                }
            }
            else {
                await cfg.update(fullKey, value, vscode.ConfigurationTarget.Global);
            }
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=configService.js.map