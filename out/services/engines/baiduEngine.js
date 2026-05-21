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
exports.BaiduEngine = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
/**
 * 百度翻译引擎
 * 文档：https://fanyi-api.baidu.com/doc/21
 */
class BaiduEngine {
    name = 'baidu';
    displayName = '百度翻译';
    isConfigured() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.baidu');
        return !!(cfg.get('appId') && cfg.get('secretKey'));
    }
    async translate(text, _sourceLang = 'en', _targetLang = 'zh') {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.baidu');
        const appId = cfg.get('appId', '');
        const secretKey = cfg.get('secretKey', '');
        if (!appId || !secretKey) {
            throw new Error('百度翻译未配置');
        }
        const salt = Date.now().toString();
        const sign = crypto
            .createHash('md5')
            .update(appId + text + salt + secretKey)
            .digest('hex');
        const params = new URLSearchParams({
            q: text,
            from: 'en',
            to: 'zh',
            appid: appId,
            salt,
            sign
        });
        const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?${params}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
            throw new Error(`百度翻译请求失败: ${resp.status}`);
        }
        const data = (await resp.json());
        if (data.error_code) {
            throw new Error(`百度翻译错误 ${data.error_code}: ${data.error_msg}`);
        }
        if (!data.trans_result?.length) {
            throw new Error('百度翻译返回空结果');
        }
        return data.trans_result.map(r => r.dst).join('\n');
    }
}
exports.BaiduEngine = BaiduEngine;
//# sourceMappingURL=baiduEngine.js.map