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
exports.CustomHttpEngine = exports.OpenAIEngine = void 0;
const vscode = __importStar(require("vscode"));
/**
 * OpenAI / Gemini / 自定义兼容接口翻译引擎
 */
class OpenAIEngine {
    name = 'openai';
    displayName = 'AI 翻译';
    isConfigured() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
        return !!cfg.get('apiKey');
    }
    async translate(text) {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.openai');
        const apiKey = cfg.get('apiKey', '');
        const baseUrl = cfg.get('baseUrl', 'https://api.openai.com/v1');
        const model = cfg.get('model', 'gpt-4o-mini');
        const systemPrompt = cfg.get('systemPrompt', '你是一个学术论文翻译专家。请将以下英文学术句子翻译成中文，保持专业术语准确，语言简洁流畅。只输出翻译结果，不要解释。');
        if (!apiKey) {
            throw new Error('OpenAI/AI 引擎未配置 API Key');
        }
        const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                max_tokens: 1024
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`AI 翻译请求失败 ${resp.status}: ${errText.slice(0, 200)}`);
        }
        const data = (await resp.json());
        if (data.error) {
            throw new Error(`AI 翻译错误: ${data.error.message}`);
        }
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('AI 翻译返回空结果');
        }
        return content.trim();
    }
}
exports.OpenAIEngine = OpenAIEngine;
/**
 * 自定义 HTTP 接口翻译引擎
 */
class CustomHttpEngine {
    name = 'custom';
    displayName = '自定义接口';
    isConfigured() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.custom');
        return !!cfg.get('url');
    }
    async translate(text) {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.custom');
        const url = cfg.get('url', '');
        const headers = cfg.get('headers', {});
        const bodyTemplate = cfg.get('bodyTemplate', '{"text": "{{text}}", "target_lang": "ZH"}');
        const responsePath = cfg.get('responsePath', 'result');
        if (!url) {
            throw new Error('自定义接口未配置 URL');
        }
        const body = bodyTemplate.replace('{{text}}', JSON.stringify(text).slice(1, -1));
        const resp = await fetch(url, {
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
        const data = (await resp.json());
        // 按路径提取结果，如 "data.translation"
        const result = responsePath.split('.').reduce((obj, key) => {
            if (obj && typeof obj === 'object') {
                return obj[key];
            }
            return undefined;
        }, data);
        if (typeof result !== 'string') {
            throw new Error(`自定义接口响应路径 "${responsePath}" 未找到字符串结果`);
        }
        return result;
    }
}
exports.CustomHttpEngine = CustomHttpEngine;
//# sourceMappingURL=openaiEngine.js.map