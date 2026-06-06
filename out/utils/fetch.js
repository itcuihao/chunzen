"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProxyAgent = getProxyAgent;
exports.customFetch = customFetch;
// @ts-ignore
const https_proxy_agent_1 = require("https-proxy-agent");
// @ts-ignore
const http_proxy_agent_1 = require("http-proxy-agent");
// @ts-ignore
const node_fetch_1 = __importDefault(require("node-fetch"));
let vscode;
try {
    vscode = require('vscode');
}
catch (e) {
    // 忽略，说明在非 VSCode 插件环境下运行测试
}
/**
 * 获取代理 Agent
 */
function getProxyAgent(targetUrl) {
    let proxyUrl = '';
    // 1. 优先从 VS Code 配置中获取代理
    if (vscode && vscode.workspace) {
        try {
            const httpConfig = vscode.workspace.getConfiguration('http');
            proxyUrl = httpConfig.get('proxy') || '';
        }
        catch (err) {
            console.warn('[ChunZen] 读取 VSCode 代理配置失败:', err);
        }
    }
    // 2. 如果没有 VS Code 配置，或为空，则从系统环境变量中获取
    if (!proxyUrl) {
        proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.HTTP_PROXY ||
            process.env.http_proxy || '';
    }
    if (!proxyUrl) {
        return undefined;
    }
    try {
        const isHttps = targetUrl.startsWith('https:');
        let rejectUnauthorized = true;
        if (vscode && vscode.workspace) {
            try {
                rejectUnauthorized = vscode.workspace.getConfiguration('http').get('proxyStrictSSL') !== false;
            }
            catch (e) { }
        }
        if (isHttps) {
            // @ts-ignore
            return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl, { rejectUnauthorized });
        }
        else {
            return new http_proxy_agent_1.HttpProxyAgent(proxyUrl);
        }
    }
    catch (err) {
        console.error('[ChunZen] 创建代理 Agent 失败:', err);
        return undefined;
    }
}
/**
 * 包装过的 fetch，自动继承 VSCode / 系统代理，并支持连接失败回退到直连
 */
async function customFetch(url, init) {
    const agent = getProxyAgent(url);
    if (!agent) {
        // 没有代理配置，直接使用原生全局 fetch (在 Node 18+ 环境下，原生 fetch 效率最高且支持 http2)
        return fetch(url, init);
    }
    try {
        const options = {
            ...init,
            agent
        };
        // 尝试使用代理进行请求
        return await (0, node_fetch_1.default)(url, options);
    }
    catch (err) {
        const isProxyError = err.code === 'ECONNREFUSED' ||
            err.code === 'ENOTFOUND' ||
            err.code === 'ECONNRESET' ||
            err.message?.includes('proxy') ||
            err.message?.includes('tunneling socket could not be established');
        if (isProxyError) {
            console.warn(`[ChunZen] 代理请求失败 (${err.message || err})，尝试回退到直连: ${url}`);
            return fetch(url, init);
        }
        throw err;
    }
}
//# sourceMappingURL=fetch.js.map