// @ts-ignore
import { HttpsProxyAgent } from 'https-proxy-agent';
// @ts-ignore
import { HttpProxyAgent } from 'http-proxy-agent';
// @ts-ignore
import nodeFetch, { type RequestInit as NodeFetchRequestInit, type Response } from 'node-fetch';
import * as net from 'net';

let vscode: any;
try {
  vscode = require('vscode');
} catch (e) {
  // 忽略，说明在非 VSCode 插件环境下运行测试
}

/**
 * 关闭 Node 的 Happy Eyeballs（autoSelectFamily）。
 *
 * 背景：Node 20+ 默认开启 autoSelectFamily，会并发尝试域名解析出的所有地址。
 * 对部分站点（实测 open.bigmodel.cn，A 记录有 8.209.116.154 / 47.254.134.77 两个）
 * 该实现会一直等到整体超时，表现为 `fetch failed / ETIMEDOUT`，
 * 而 curl、Node 原生 https.request 均正常 —— 即“网络没问题但插件里一定会失败”。
 *
 * 关闭后走传统串行连接，上述站点恢复正常。Node 未提供该 API 时静默跳过。
 */
function disableHappyEyeballs(): void {
  try {
    const maybe = net as unknown as {
      getDefaultAutoSelectFamily?: () => boolean;
      setDefaultAutoSelectFamily?: (v: boolean) => void;
    };
    if (maybe.getDefaultAutoSelectFamily?.() === true) {
      maybe.setDefaultAutoSelectFamily?.(false);
      console.log('[ChunZen] 已关闭 autoSelectFamily（规避多 A 记录站点的 Happy Eyeballs 超时）');
    }
  } catch (err) {
    console.warn('[ChunZen] 关闭 autoSelectFamily 失败:', err);
  }
}

disableHappyEyeballs();

/**
 * 获取代理 Agent
 */
export function getProxyAgent(targetUrl: string) {
  let proxyUrl = '';

  // 1. 优先从 VS Code 配置中获取代理
  if (vscode && vscode.workspace) {
    try {
      const httpConfig = vscode.workspace.getConfiguration('http');
      proxyUrl = (httpConfig.get('proxy') as string) || '';
    } catch (err) {
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
      } catch (e) {}
    }

    if (isHttps) {
      // @ts-ignore
      return new HttpsProxyAgent(proxyUrl, { rejectUnauthorized });
    } else {
      return new HttpProxyAgent(proxyUrl);
    }
  } catch (err) {
    console.error('[ChunZen] 创建代理 Agent 失败:', err);
    return undefined;
  }
}

/** 这些错误通常意味着“这条链路走不通”，换一条链路值得再试一次 */
function isLinkFailure(err: any): boolean {
  const code = err?.code || err?.cause?.code || err?.errno;
  const message = String(err?.message || '');
  return code === 'ECONNREFUSED'
    || code === 'ENOTFOUND'
    || code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || code === 'ECONNABORTED'
    || code === 'EPIPE'
    || /fetch failed/i.test(message)
    || /proxy/i.test(message)
    || /tunneling socket could not be established/i.test(message);
}

/** 把底层错误包装成能看懂的一句话：区分超时、证书、DNS、代理 */
export function describeFetchError(err: any, url: string): Error {
  const code = err?.code || err?.cause?.code || err?.errno || '';
  const isAbort = err?.name === 'AbortError' || err?.name === 'TimeoutError';
  if (isAbort) return err;

  const hints: Record<string, string> = {
    ETIMEDOUT: '连接超时：该地址可能被网络阻断，或需要配置代理（VS Code 设置 http.proxy / 环境变量 HTTPS_PROXY）',
    ENOTFOUND: '域名解析失败：请检查地址拼写或 DNS',
    ECONNREFUSED: '连接被拒绝：地址可达但端口未监听，或代理未启动',
    ECONNRESET: '连接被重置：常见于代理/防火墙拦截或服务端主动断开',
    CERT_HAS_EXPIRED: '证书已过期：企业代理或自签证书环境可关闭 http.proxyStrictSSL',
    DEPTH_ZERO_SELF_SIGNED_CERT: '自签名证书：企业代理环境可关闭 http.proxyStrictSSL',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: '证书链无法验证：企业代理环境可关闭 http.proxyStrictSSL'
  };
  const detail = hints[code] || (err?.cause?.message || err?.message || String(err));
  const wrapped = new Error(`${url} → ${code ? `${code}：` : ''}${detail}`);
  (wrapped as any).cause = err;
  return wrapped;
}

/**
 * 包装过的 fetch：自动继承 VSCode / 系统代理，链路失败时换链路重试。
 *
 * 尝试顺序：
 * 1. 有代理 → 走代理；无代理 → 直连
 * 2. 当前链路出现超时/DNS/连接重置 → 换另一条链路再试一次（带代理↔直连）
 *
 * 这样企业代理配置错误时不会让所有网络功能直接哑掉，也不会把底层
 * `fetch failed` 这种无信息量的错误抛给上层。
 */
export async function customFetch(url: string, init?: any): Promise<Response> {
  const agent = getProxyAgent(url);
  const attempts: Array<{ label: string; run: () => Promise<Response> }> = [];

  if (agent) {
    const options: NodeFetchRequestInit = { ...init, agent };
    attempts.push({ label: '代理', run: () => nodeFetch(url, options) as unknown as Promise<Response> });
    attempts.push({ label: '直连', run: () => fetch(url, init) as unknown as Promise<Response> });
  } else {
    attempts.push({ label: '直连', run: () => fetch(url, init) as unknown as Promise<Response> });
    // 原生 fetch 与 node-fetch 的 socket 建立路径不同，前者失败时后者往往能通
    attempts.push({ label: 'node-fetch', run: () => nodeFetch(url, init as NodeFetchRequestInit) as unknown as Promise<Response> });
  }

  let lastError: any;
  for (const [index, attempt] of attempts.entries()) {
    try {
      return await attempt.run();
    } catch (err: any) {
      lastError = err;
      // 被 AbortSignal 取消是调用方的意图，不要掩盖也不要重试
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err;

      const hasNext = index < attempts.length - 1;
      if (hasNext && isLinkFailure(err)) {
        console.warn(`[ChunZen] ${attempt.label}请求失败（${err?.code || err?.message}），尝试${attempts[index + 1].label}: ${url}`);
        continue;
      }
      throw describeFetchError(err, url);
    }
  }

  throw describeFetchError(lastError, url);
}
