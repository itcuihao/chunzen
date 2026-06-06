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
exports.AnthropicEngine = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Anthropic Messages API 翻译引擎
 * 支持自定义 endpoint 和 model，适用于任何兼容 Anthropic API 的服务
 */
class AnthropicEngine {
    name = 'anthropic';
    displayName = 'Anthropic API';
    isConfigured() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
        return !!(cfg.get('apiKey') && cfg.get('baseUrl'));
    }
    async translate(text, sourceLang, targetLang, glossary) {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.anthropic');
        const apiKey = cfg.get('apiKey', '');
        const baseUrl = cfg.get('baseUrl', '').replace(/\/$/, '');
        const model = cfg.get('model', 'mimo-v2.5-pro');
        const systemPrompt = cfg.get('systemPrompt', '你是一个学术论文翻译专家。请将以下英文学术句子翻译成中文，保持专业术语准确，语言简洁流畅。只输出翻译结果，不要解释。');
        if (!apiKey || !baseUrl) {
            throw new Error('Anthropic API 未配置');
        }
        let glossaryPrompt = '';
        if (glossary && glossary.length > 0) {
            glossaryPrompt = '\n\n在翻译时，请严格遵守以下学术专有名词/术语对照表：\n' +
                glossary.map(g => `- ${g.source} -> ${g.target}`).join('\n');
        }
        const url = `${baseUrl}/v1/messages`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 512,
                system: systemPrompt + glossaryPrompt,
                messages: [
                    { role: 'user', content: text }
                ]
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Anthropic API 请求失败 ${resp.status}: ${errText.slice(0, 200)}`);
        }
        const data = (await resp.json());
        if (data.error) {
            throw new Error(`Anthropic API 错误: ${data.error.message}`);
        }
        // Anthropic Messages API 返回多个 content block（text + thinking），只取 text
        const textBlock = data.content?.find(c => c.type === 'text');
        if (!textBlock?.text) {
            throw new Error('Anthropic API 返回空结果');
        }
        return textBlock.text.trim();
    }
}
exports.AnthropicEngine = AnthropicEngine;
//# sourceMappingURL=anthropicEngine.js.map