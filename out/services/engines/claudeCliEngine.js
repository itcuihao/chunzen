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
exports.ClaudeCliEngine = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Claude CLI 翻译引擎（使用 claude -p 命令）
 */
class ClaudeCliEngine {
    name = 'claudeCli';
    displayName = 'Claude CLI';
    isConfigured() {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.claudeCli');
        return cfg.get('enabled', false);
    }
    async translate(text) {
        const cfg = vscode.workspace.getConfiguration('chunzen.translation.claudeCli');
        const enabled = cfg.get('enabled', false);
        const prompt = cfg.get('prompt', '将以下学术英文翻译为中文，只输出译文：');
        if (!enabled) {
            throw new Error('Claude CLI 未启用');
        }
        const fullPrompt = `${prompt}\n\n${text}`;
        try {
            const { stdout } = await execFileAsync('claude', ['-p', fullPrompt], {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            });
            return stdout.trim();
        }
        catch (err) {
            const error = err;
            if (error.code === 'ENOENT') {
                throw new Error('未找到 claude 命令，请确认已安装 Claude CLI');
            }
            throw new Error(`Claude CLI 执行失败: ${error.message}`);
        }
    }
}
exports.ClaudeCliEngine = ClaudeCliEngine;
//# sourceMappingURL=claudeCliEngine.js.map