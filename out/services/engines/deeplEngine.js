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
exports.DeepLEngine = void 0;
const vscode = __importStar(require("vscode"));
/**
 * DeepL 翻译引擎
 * 文档：https://www.deepl.com/docs-api
 */
class DeepLEngine {
    name = 'deepl';
    displayName = 'DeepL';
    isConfigured() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.deepl');
        return !!cfg.get('apiKey');
    }
    async translate(text) {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.deepl');
        const apiKey = cfg.get('apiKey', '');
        const freeApi = cfg.get('freeApi', true);
        if (!apiKey) {
            throw new Error('DeepL 未配置 API Key');
        }
        const baseUrl = freeApi
            ? 'https://api-free.deepl.com/v2/translate'
            : 'https://api.deepl.com/v2/translate';
        const resp = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                Authorization: `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: [text],
                source_lang: 'EN',
                target_lang: 'ZH'
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`DeepL 请求失败 ${resp.status}: ${errText}`);
        }
        const data = (await resp.json());
        if (!data.translations?.length) {
            throw new Error('DeepL 返回空结果');
        }
        return data.translations[0].text;
    }
}
exports.DeepLEngine = DeepLEngine;
//# sourceMappingURL=deeplEngine.js.map