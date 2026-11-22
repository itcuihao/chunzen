/**
 * OpenAI 兼容引擎的端到端仿真测试。
 *
 * - 默认全部离线运行：用本地 HTTP 服务器模拟各种真实服务商的响应形态
 *   （200/400/401/404/429/5xx、网关 HTML、流式分片、模型列表缺字段等），
 *   确保「地址候选 → 参数降级 → 重试 → 错误信息」整条链路可回归。
 * - 设置 CHUNZEN_LIVE_OPENAI=1（并给出 CHUNZEN_LIVE_BASE_URL / _KEY / _MODEL）
 *   时才打真实端点，用于人工验证。
 *
 * 运行：npm run test:live
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

const CONFIG_KEY = 'chunzen.translation.openai';

function setConfig(values: Record<string, unknown>): void {
  const store = ((globalThis as any).__chunzenTestConfig ||= {});
  store[CONFIG_KEY] = values;
}

// 必须在被测模块 import 之前设置好配置
setConfig({});

const { OpenAIEngine } = await import('../src/services/engines/openaiEngine.ts');
const { chatCompletionsCandidates } = await import('../src/services/engines/openaiCompat.ts');

// ── 本地模拟服务 ──

interface Route {
  status: number;
  body: string;
  contentType?: string;
  headers?: Record<string, string>;
}

/** 按「请求路径 + 第几次命中」返回预设响应，用于模拟参数降级/重试 */
type Handler = (req: { path: string; method: string; body: string; hits: number }) => Route;

let server: http.Server;
let baseUrl = '';
const hitsByPath = new Map<string, number>();

function startServer(handler: Handler): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const path = req.url ?? '/';
        const hits = (hitsByPath.get(path) ?? 0) + 1;
        hitsByPath.set(path, hits);
        const route = handler({
          path,
          method: req.method ?? 'GET',
          body: Buffer.concat(chunks).toString('utf8'),
          hits
        });
        res.writeHead(route.status, {
          'Content-Type': route.contentType ?? 'application/json',
          ...(route.headers ?? {})
        });
        res.end(route.body);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withServer(handler: Handler, run: () => Promise<void>): Promise<void> {
  hitsByPath.clear();
  await startServer(handler);
  try {
    await run();
  } finally {
    await stopServer();
  }
}

const ok = (content: string): Route => ({
  status: 200,
  body: JSON.stringify({ choices: [{ message: { content } }] })
});

// ── 离线仿真 ──

describe('地址候选与链路', () => {
  test('Base URL 不带 /v1 时，第二个候选地址能救回来', async () => {
    await withServer(({ path, hits }) => {
      // /chat/completions 该服务不支持，返回 405；/v1/chat/completions 正常
      if (path.endsWith('/v1/chat/completions')) return ok('第二候选命中');
      return hits > 1 ? { status: 500, body: '{}' } : { status: 405, body: '{"error":{"message":"method not allowed"}}' };
    }, async () => {
      setConfig({ apiKey: 'k', baseUrl, model: 'test-model' });
      const engine = new OpenAIEngine();
      const out = await engine.translate('hello');
      assert.equal(out, '第二候选命中');
      assert.deepEqual(chatCompletionsCandidates(baseUrl), [
        `${baseUrl}/chat/completions`,
        `${baseUrl}/v1/chat/completions`
      ]);
    });
  });

  test('直接填完整 /chat/completions 地址时只发一次请求', async () => {
    await withServer(({ path }) => {
      assert.equal(path, '/chat/completions');
      return ok('完整地址命中');
    }, async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/chat/completions`, model: 'test-model' });
      const out = await new OpenAIEngine().translate('hello');
      assert.equal(out, '完整地址命中');
    });
  });
});

describe('参数降级', () => {
  test('服务商拒绝 temperature 时自动降级并成功（不暴露 400）', async () => {
    const bodies: string[] = [];
    await withServer(({ path, body }) => {
      if (path !== '/v1/chat/completions') return { status: 404, body: '{}' };
      bodies.push(body);
      if (body.includes('"temperature"')) {
        return { status: 400, body: '{"error":{"message":"temperature is not supported for this model"}}' };
      }
      return ok('降级后成功');
    }, async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      const out = await new OpenAIEngine().translate('hello');
      assert.equal(out, '降级后成功');
      assert.equal(bodies.length, 2, '应先带 temperature 再不带 temperature 各一次');
      assert.ok(bodies[0].includes('"temperature"'));
      assert.ok(!bodies[1].includes('"temperature"'));
    });
  });

  test('连 max_tokens 也被拒绝时退到最小请求体', async () => {
    const bodies: string[] = [];
    await withServer(({ path, body }) => {
      if (path !== '/v1/chat/completions') return { status: 404, body: '{}' };
      bodies.push(body);
      return body.includes('"temperature"') || body.includes('"max_tokens"')
        ? { status: 422, body: '{"message":"unsupported parameter"}' }
        : ok('最小请求体成功');
    }, async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      assert.equal(await new OpenAIEngine().translate('hello'), '最小请求体成功');
      assert.equal(bodies.length, 3);
    });
  });
});

describe('错误处理', () => {
  test('401 立即失败、不重试、给出请求地址与处置建议', async () => {
    let calls = 0;
    await withServer(() => {
      calls += 1;
      return { status: 401, body: '{"error":{"code":"1001","message":"令牌已过期或验证不正确"}}' };
    }, async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      await assert.rejects(
        () => new OpenAIEngine().translate('hello'),
        (err: any) => {
          assert.match(err.message, /HTTP 401/);
          assert.match(err.message, /令牌已过期/);
          assert.match(err.requestUrl, /\/chat\/completions$/);
          assert.match(err.hint, /API Key/);
          return true;
        }
      );
      assert.equal(calls, 1, '401 不应重试');
    });
  });

  test('模型不存在时透传服务商原始错误并给出「拉取模型列表」建议', async () => {
    await withServer(() => ({ status: 400, body: '{"error":{"code":"1211","message":"模型不存在，请检查模型代码。"}}' }), async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      await assert.rejects(
        () => new OpenAIEngine().translate('hello'),
        (err: any) => {
          assert.match(err.message, /模型不存在/);
          assert.match(err.hint, /模型/);
          return true;
        }
      );
    });
  });

  test('网关返回 HTML 时报「响应不是 JSON」而不是解析异常', async () => {
    await withServer(() => ({ status: 200, body: '<html>502 Bad Gateway</html>', contentType: 'text/html' }), async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      await assert.rejects(
        () => new OpenAIEngine().translate('hello'),
        (err: any) => {
          assert.match(err.message, /不是 JSON/);
          return true;
        }
      );
    });
  });

  test('200 但内容为空时报错，而不是返回空串', async () => {
    await withServer(() => ({ status: 200, body: JSON.stringify({ choices: [] }) }), async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      await assert.rejects(() => new OpenAIEngine().translate('hello'), /内容为空/);
    });
  });

  test('429 会重试一次，第二次成功', async () => {
    let calls = 0;
    await withServer(() => {
      calls += 1;
      return calls === 1
        ? { status: 429, body: '{"error":{"message":"rate limited"}}' }
        : ok('重试成功');
    }, async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      assert.equal(await new OpenAIEngine().translate('hello'), '重试成功');
      assert.equal(calls, 2);
    });
  });

  test('未配置时不发任何请求', async () => {
    let calls = 0;
    await withServer(() => {
      calls += 1;
      return ok('不应被调用');
    }, async () => {
      setConfig({});
      await assert.rejects(() => new OpenAIEngine().translate('hello'), /API Key/);
      setConfig({ apiKey: 'k' });
      await assert.rejects(() => new OpenAIEngine().translate('hello'), /Base URL/);
      setConfig({ apiKey: 'k', baseUrl });
      await assert.rejects(() => new OpenAIEngine().translate('hello'), /模型名称/);
      // 全空但给了模型名，仍应因缺 Key 拒绝
      setConfig({ model: 'test-model' });
      await assert.rejects(() => new OpenAIEngine().translate('hello'), /API Key/);
      assert.equal(calls, 0);
    });
  });

  test('空字符串覆盖不会顶掉已保存的配置（设置页表单空值场景）', async () => {
    await withServer(() => ok('已保存配置生效'), async () => {
      setConfig({ apiKey: 'saved-key', baseUrl: `${baseUrl}/v1`, model: 'saved-model' });
      // 表单未改动时传空串
      const out = await new OpenAIEngine().translate('hello', undefined, undefined, [], {
        apiKey: '', baseUrl: '', model: ''
      });
      assert.equal(out, '已保存配置生效');
    });
  });
});

describe('响应形态兼容', () => {
  test('content 为分片数组时拼接', async () => {
    await withServer(() => ({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: '分' }, { type: 'text', text: '片' }] } }] })
    }), async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      assert.equal(await new OpenAIEngine().translate('hello'), '分片');
    });
  });

  test('choices[].text 形态（部分兼容实现）', async () => {
    await withServer(() => ({ status: 200, body: JSON.stringify({ choices: [{ text: '旧格式' }] }) }), async () => {
      setConfig({ apiKey: 'k', baseUrl: `${baseUrl}/v1`, model: 'test-model' });
      assert.equal(await new OpenAIEngine().translate('hello'), '旧格式');
    });
  });
});

describe('diagnose / 模型列表', () => {
  test('拿到模型列表并能判定目标模型是否存在', async () => {
    await withServer(({ path }) => {
      if (path === '/v1/models' || path === '/models') {
        return {
          status: 200,
          body: JSON.stringify({ data: [{ id: 'glm-4.5' }, { id: 'glm-5.3-flash' }, { id: 'glm-4.5' }] })
        };
      }
      return { status: 404, body: '{}' };
    }, async () => {
      const result = await new OpenAIEngine().diagnose(`${baseUrl}/v1`, 'k');
      assert.equal(result.ok, true);
      assert.deepEqual(result.models, ['glm-4.5', 'glm-5.3-flash']);
      assert.match(result.message, /2 个模型/);
    });
  });

  test('401 时立即返回，不继续尝试其它地址', async () => {
    let calls = 0;
    await withServer(() => {
      calls += 1;
      return { status: 401, body: '{"error":{"message":"invalid token"}}' };
    }, async () => {
      const result = await new OpenAIEngine().diagnose(baseUrl, 'bad');
      assert.equal(result.ok, false);
      assert.match(result.message, /认证失败/);
      assert.match(result.hint, /API Key/);
      assert.equal(calls, 1);
    });
  });

  test('服务未提供模型列表时仍判定连接正常', async () => {
    await withServer(() => ({ status: 200, body: '{"object":"list"}' }), async () => {
      const result = await new OpenAIEngine().diagnose(`${baseUrl}/v1`, 'k');
      assert.equal(result.ok, true);
      assert.deepEqual(result.models, []);
      assert.match(result.message, /连接正常/);
    });
  });
});

// ── 真实端点（可选） ──

const LIVE = process.env.CHUNZEN_LIVE_OPENAI === '1';
const LIVE_BASE = process.env.CHUNZEN_LIVE_BASE_URL ?? '';
const LIVE_KEY = process.env.CHUNZEN_LIVE_KEY ?? '';
const LIVE_MODEL = process.env.CHUNZEN_LIVE_MODEL ?? '';

describe('真实端点（CHUNZEN_LIVE_OPENAI=1 时启用）', () => {
  test('diagnose + translate', { skip: !LIVE && '未设置 CHUNZEN_LIVE_OPENAI=1' }, async () => {
    const engine = new OpenAIEngine();
    setConfig({ apiKey: LIVE_KEY, baseUrl: LIVE_BASE, model: LIVE_MODEL, timeoutMs: 60000 });

    const diag = await engine.diagnose(LIVE_BASE, LIVE_KEY, 60000);
    console.log('[live] diagnose:', diag.message, '| url:', diag.requestUrl);
    assert.equal(diag.ok, true, `diagnose 失败: ${diag.message} ${diag.hint ?? ''}`);
    if (diag.models?.length) {
      assert.ok(diag.models.includes(LIVE_MODEL), `${LIVE_MODEL} 不在模型列表中: ${diag.models.join(', ')}`);
    }

    const sample = 'Circular RNAs have emerged as a novel class of non-coding RNAs that regulate gene expression.';
    const out = await engine.translate(sample);
    console.log(`[live] ${LIVE_MODEL} → ${out}`);
    assert.ok(out.trim().length > 0);
    assert.ok(/[\u4e00-\u9fa5]/.test(out), '译文应含中文');

    await assert.rejects(
      () => engine.translate(sample, undefined, undefined, [], { apiKey: 'definitely-not-a-valid-key' }),
      (err: any) => {
        assert.ok(err.message.length > 0);
        console.log('[live] 错误 Key 表现:', err.message, '| hint:', err.hint);
        return true;
      }
    );
  });
});

describe('模型名错误的处理', () => {
  test('模型名不存在时抛出的错误带 status，供上层判断是否自动拉列表', async () => {
    // 曾经这里硬编码 status=undefined，导致 SidePanelProvider 拿不到状态码，
    // 「模型不存在」的 400 无法识别成模型名问题，用户只能自己去猜模型 ID。
    await withServer(
      ({ path }) => {
        if (path.endsWith('/models')) {
          return { status: 200, body: JSON.stringify({ data: [{ id: 'real-model-a' }, { id: 'real-model-b' }] }) };
        }
        return { status: 400, body: JSON.stringify({ error: { message: '模型不存在，请检查模型代码。' } }) };
      },
      async () => {
        const engine = new OpenAIEngine();
        await assert.rejects(
          () =>
            engine.translate('hello', undefined, undefined, [], {
              baseUrl,
              apiKey: 'k',
              model: 'made-up-model'
            }),
          (err: any) => {
            assert.equal(err.status, 400, 'status 必须透传，否则上层无法识别模型名错误');
            assert.equal(engine.isModelNameError?.(err.status, err.message), true);
            return true;
          }
        );

        // 上层据此补拉列表，能拿到真实名字
        const diag = await engine.diagnose(baseUrl, 'k');
        assert.deepEqual(diag.models, ['real-model-a', 'real-model-b']);
      }
    );
  });
});
