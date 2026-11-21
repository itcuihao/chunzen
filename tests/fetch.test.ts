/**
 * customFetch 的行为约定：链路回退、超时不吞、错误说人话。
 * 这里用真实网络行为不易复现，故直接验证对外承诺的语义。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';

const { customFetch, describeFetchError } = await import('../src/utils/fetch.ts');

function serve(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

describe('customFetch', () => {
  test('Happy Eyeballs 已关闭（多 A 记录站点不再整体超时）', () => {
    // open.bigmodel.cn 有两条 A 记录，Node 默认 autoSelectFamily 会等到超时；
    // 模块加载时必须已把它关掉，否则真实端点全部不可达。
    const get = (net as any).getDefaultAutoSelectFamily;
    if (typeof get !== 'function') return; // 老版本 Node 没有该 API
    assert.equal(get(), false);
  });

  test('正常响应原样返回', async () => {
    const s = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    try {
      const resp = await customFetch(s.url);
      assert.equal(resp.status, 200);
      assert.deepEqual(await resp.json(), { ok: true });
    } finally {
      await s.close();
    }
  });

  test('连接被拒绝时错误带地址与可操作提示，而不是裸 fetch failed', async () => {
    const s = await serve(() => {});
    const deadUrl = s.url;
    await s.close();
    await assert.rejects(
      () => customFetch(deadUrl),
      (err: any) => {
        assert.match(err.message, /127\.0\.0\.1/);
        assert.match(err.message, /ECONNREFUSED|连接被拒绝/);
        return true;
      }
    );
  });

  test('AbortSignal 超时原样抛出，不被包装也不重试', async () => {
    const s = await serve((_req, res) => {
      setTimeout(() => res.end('too slow'), 3000);
    });
    try {
      await assert.rejects(
        () => customFetch(s.url, { signal: AbortSignal.timeout(120) }),
        (err: any) => {
          assert.ok(['AbortError', 'TimeoutError'].includes(err.name), `实际 name=${err.name}`);
          return true;
        }
      );
    } finally {
      await s.close();
    }
  });

  test('POST 请求体与自定义头透传', async () => {
    let seen: { body?: string; auth?: string } = {};
    const s = await serve((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        seen = { body: Buffer.concat(chunks).toString(), auth: req.headers.authorization as string };
        res.writeHead(200);
        res.end('{}');
      });
    });
    try {
      await customFetch(`${s.url}/x`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tk' },
        body: JSON.stringify({ hello: 'world' })
      });
      assert.equal(seen.body, '{"hello":"world"}');
      assert.equal(seen.auth, 'Bearer tk');
    } finally {
      await s.close();
    }
  });
});

describe('describeFetchError', () => {
  const cases: Array<[string, RegExp]> = [
    ['ETIMEDOUT', /连接超时/],
    ['ENOTFOUND', /域名解析失败/],
    ['ECONNREFUSED', /连接被拒绝/],
    ['ECONNRESET', /连接被重置/],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', /自签名证书/],
    ['CERT_HAS_EXPIRED', /证书已过期/]
  ];

  for (const [code, pattern] of cases) {
    test(`${code} → 可读提示`, () => {
      const err = describeFetchError({ code, message: code }, 'https://example.com/x');
      assert.match(err.message, pattern);
      assert.match(err.message, /example\.com/);
    });
  }

  test('未知错误保留原始信息', () => {
    const err = describeFetchError({ message: 'something odd' }, 'https://example.com/x');
    assert.match(err.message, /something odd/);
  });
});
