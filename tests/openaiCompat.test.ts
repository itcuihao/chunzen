import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPENAI_PRESETS,
  chatCompletionsCandidates,
  detectPreset,
  extractApiError,
  extractAssistantContent,
  extractModelIds,
  findPreset,
  httpFailureHint,
  isConcretePreset,
  looksLikeModelError,
  modelListCandidates,
  parseJson,
  previewText,
  OpenAiRequestError
} from '../src/services/engines/openaiCompat.ts';
import { resolveOpenAiTimeout } from '../src/services/engines/defaults.ts';

// ── 地址候选：三种填法都要能通 ──

test('chatCompletionsCandidates: 根地址自动补 /v1/chat/completions 作为回退', () => {
  assert.deepEqual(chatCompletionsCandidates('https://api.deepseek.com'), [
    'https://api.deepseek.com/chat/completions',
    'https://api.deepseek.com/v1/chat/completions'
  ]);
});

test('chatCompletionsCandidates: 已经带 /v1 时只拼一层，不再补 /v1', () => {
  assert.deepEqual(chatCompletionsCandidates('https://api.openai.com/v1'), [
    'https://api.openai.com/v1/chat/completions'
  ]);
  assert.deepEqual(chatCompletionsCandidates('https://open.bigmodel.cn/api/paas/v4'), [
    'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  ]);
});

test('chatCompletionsCandidates: 直接粘贴完整地址时原样使用', () => {
  assert.deepEqual(chatCompletionsCandidates('https://api.deepseek.com/chat/completions'), [
    'https://api.deepseek.com/chat/completions'
  ]);
  assert.deepEqual(chatCompletionsCandidates('http://localhost:11434/v1/chat/completions/'), [
    'http://localhost:11434/v1/chat/completions'
  ]);
});

test('chatCompletionsCandidates: 非法地址不产生候选（不发请求）', () => {
  assert.deepEqual(chatCompletionsCandidates(''), []);
  assert.deepEqual(chatCompletionsCandidates('ftp://x'), []);
  assert.deepEqual(chatCompletionsCandidates('api.deepseek.com'), []);
});

test('modelListCandidates: 从完整 endpoint 反推 /models', () => {
  assert.deepEqual(modelListCandidates('https://api.deepseek.com'), [
    'https://api.deepseek.com/models',
    'https://api.deepseek.com/v1/models'
  ]);
  assert.deepEqual(modelListCandidates('https://api.openai.com/v1/chat/completions'), [
    'https://api.openai.com/v1/models'
  ]);
});

// ── 响应解析 ──

test('parseJson: 非 JSON（网关 HTML）返回 undefined 而不是抛错', () => {
  assert.equal(parseJson('<html>502 Bad Gateway</html>'), undefined);
  assert.equal(parseJson(''), undefined);
  assert.equal(parseJson(undefined), undefined);
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
});

test('extractAssistantContent: 兼容字符串、数组分片与 choices[].text', () => {
  assert.equal(extractAssistantContent({ choices: [{ message: { content: ' hi ' } }] }), ' hi ');
  assert.equal(
    extractAssistantContent({ choices: [{ message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] } }] }),
    'AB'
  );
  assert.equal(extractAssistantContent({ choices: [{ text: 'plain' }] }), 'plain');
  assert.equal(extractAssistantContent({ output_text: 'out' }), 'out');
  assert.equal(extractAssistantContent({ choices: [] }), undefined);
});

test('extractApiError: 各家的错误字段都能捞到', () => {
  assert.equal(extractApiError({ error: { message: 'invalid api key' } }), 'invalid api key');
  assert.equal(extractApiError({ error: 'bad' }), 'bad');
  assert.equal(extractApiError({ message: 'm' }), 'm');
  assert.equal(extractApiError({ msg: 'zh' }), 'zh');
  assert.equal(extractApiError({ detail: 'd' }), 'd');
  assert.equal(extractApiError({}), undefined);
  assert.equal(extractApiError(undefined), undefined);
});

test('extractModelIds: 去重排序，兼容 data[].id / models[].name', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }] }), ['a', 'b']);
  assert.deepEqual(extractModelIds({ models: [{ name: 'x' }] }), ['x']);
  assert.deepEqual(extractModelIds({ data: 'nope' }), []);
});

test('httpFailureHint: 为常见状态码给出可执行的下一步', () => {
  assert.match(httpFailureHint(401), /API Key/);
  assert.match(httpFailureHint(404), /\/v1/);
  assert.match(httpFailureHint(400), /模型/);
  assert.match(httpFailureHint(429), /限流/);
  assert.equal(httpFailureHint(204), '');
});

test('previewText: 压平空白并截断', () => {
  assert.equal(previewText('a\n\n b', 10), 'a b');
  assert.equal(previewText('x'.repeat(20), 5), 'xxxxx…');
});

test('OpenAiRequestError: 携带请求地址、状态码与建议', () => {
  const err = new OpenAiRequestError('boom', 'https://x/v1/chat/completions', 404, 'check path');
  assert.equal(err.requestUrl, 'https://x/v1/chat/completions');
  assert.equal(err.status, 404);
  assert.equal(err.hint, 'check path');
  assert.ok(err instanceof Error);
});

// ── 服务商预设 ──

test('具体预设本身是合法地址与合法模型名（模型名不能为空、不能含空格）', () => {
  assert.ok(OPENAI_PRESETS.length >= 3);
  const concrete = OPENAI_PRESETS.filter(isConcretePreset);
  assert.ok(concrete.length >= 3, '至少要保留几个开箱可用的服务商');
  for (const preset of concrete) {
    assert.match(preset.baseUrl, /^https:\/\//, `${preset.id} baseUrl`);
    assert.ok(preset.model.trim() === preset.model && preset.model.length > 0, `${preset.id} model`);
    assert.ok(preset.keyUrl.startsWith('https://'), `${preset.id} keyUrl`);
  }
});

test('自定义/中转站预设不带任何地址：点了就是交还手填', () => {
  // 中转站占多数，其地址无法预设。若它带占位地址，用户点一下就会得到一个
  // 看起来合法、实际打不通的 Base URL，反而比留空更难排查。
  const custom = OPENAI_PRESETS.filter(p => !isConcretePreset(p));
  assert.equal(custom.length, 1, '应当恰好有一个自定义预设');
  for (const preset of custom) {
    assert.equal(preset.baseUrl, '');
    assert.equal(preset.model, '');
    assert.equal(preset.keyUrl, '');
    assert.ok(preset.note.length > 0, '自定义预设需要说明文案');
  }
});

test('预设默认模型名是当前官方 ID，不是已下线/版本号', () => {
  // deepseek-chat / deepseek-reasoner 已从官方文档全站消失；
  // "DeepSeek-V4.1-Flash-1017" 是 MODEL VERSION，不是可请求的模型 ID——填它必 404。
  // 文档原文：Use deepseek-flash as the model name.
  const deepseek = findPreset('deepseek');
  assert.equal(deepseek?.model, 'deepseek-flash');
  const deepseekNote = deepseek?.note ?? '';
  assert.ok(/deepseek-chat/.test(deepseekNote), '应提示旧名已下线，避免用户沿用旧文档');

  // SiliconFlow 是命名空间前缀式，且与智谱直连的模型名不同：
  // 直连写 glm-4-flash，中转写 zai-org/GLM-5.3-Flash。
  const silicon = findPreset('siliconflow');
  assert.equal(silicon?.model, 'zai-org/GLM-5.3-Flash');

  // 所有具体预设的模型名都不能是"看起来像版本号"的写法
  for (const preset of OPENAI_PRESETS.filter(isConcretePreset)) {
    assert.ok(!/[A-Z]{2,}.*-\d{4}$/.test(preset.model), `${preset.id} 模型名疑似版本号`);
    assert.ok(!/^\s|\s$/.test(preset.model), `${preset.id} 模型名含空白`);
  }
});

test('不提供 Kimi / OpenAI 官方预设', () => {
  // 这两家被明确移除：前者按需临时申请，后者国内基本走中转站
  for (const id of ['moonshot', 'kimi', 'openai']) {
    assert.equal(findPreset(id), undefined, `不应存在 ${id} 预设`);
  }
  const urls = OPENAI_PRESETS.map(p => p.baseUrl).join(' ');
  assert.ok(!/moonshot|api\.openai\.com/.test(urls), '不应残留 Kimi / OpenAI 官方地址');
});

test('预设地址互不重复，且 findPreset/detectPreset 可双向对应', () => {
  const concrete = OPENAI_PRESETS.filter(isConcretePreset);
  assert.equal(new Set(concrete.map((p) => p.baseUrl)).size, concrete.length);
  for (const preset of concrete) {
    assert.equal(findPreset(preset.id)?.baseUrl, preset.baseUrl);
    assert.equal(detectPreset(preset.baseUrl)?.id, preset.id);
  }
  assert.equal(findPreset('nope'), undefined);
  assert.equal(detectPreset('https://unknown.example.com'), undefined);
});

test('detectPreset 不会把空地址误判成自定义预设', () => {
  // 自定义预设 baseUrl 是空串；若参与匹配，任何空/无效地址都会命中它，
  // 表单就会以为用户“选中了自定义”，从而隐藏手填提示
  assert.equal(detectPreset(''), undefined);
  assert.equal(detectPreset('   '), undefined);
  assert.equal(detectPreset(undefined), undefined);
  assert.equal(detectPreset(null), undefined);
});

test('预设只用于表单，不参与引擎的请求路径（引擎不得回退到预设地址）', () => {
  const engine = readFileSync(new URL('../src/services/engines/openaiEngine.ts', import.meta.url), 'utf8');
  assert.ok(!/OPENAI_PRESETS|findPreset|detectPreset/.test(engine), '引擎不应读取预设，否则等于给 Key 一个默认去向');
  assert.ok(!/api\.deepseek\.com|api\.openai\.com|bigmodel|siliconflow|moonshot/.test(engine), '引擎不得含服务商地址字面量');
});

test('超时时间：非法值回落到 60s，并按 3s~180s 收敛', () => {
  assert.equal(resolveOpenAiTimeout(undefined), 60000);
  assert.equal(resolveOpenAiTimeout('abc'), 60000);
  assert.equal(resolveOpenAiTimeout('15000'), 15000);
  assert.equal(resolveOpenAiTimeout(10), 3000);
  assert.equal(resolveOpenAiTimeout(999999), 180000);
});

test('模型名错误识别：跨服务商措辞都能认出来', () => {
  // 这一条决定「测试连接失败后要不要自动拉模型列表」。
  // 各家措辞完全不同，但语义集中，实测样本：
  const shouldMatch: Array<[number, string]> = [
    [400, '模型不存在，请检查模型代码。'],                       // 智谱
    [404, 'Model Not Exist'],                                   // DeepSeek
    [400, 'The model `deepseek-v4.1-flash` does not exist'],     // OpenAI 风格
    [400, '20012 Model does not exist'],                         // 硅基流动
    [400, 'invalid model: gpt-9'],                               // 各类中转
    [422, 'no such model'],                                      // 少数网关
    [404, 'model not found'],
    [400, 'unknown model'],
    [400, '模型名称错误'],
  ];
  for (const [status, detail] of shouldMatch) {
    assert.equal(looksLikeModelError(status, detail), true, `未识别：${status} ${detail}`);
  }
});

test('模型名错误识别：不误判认证/限流/参数/路径类错误', () => {
  // 误判会导致用户配错 Base URL 时又白等一次 /models 请求（可到 20s）。
  const shouldNotMatch: Array<[number | undefined, string]> = [
    [401, 'Invalid API key provided'],
    [403, 'insufficient permissions'],
    [429, 'model quota exceeded'],           // 提到 model 但语义是限流
    [404, 'Not Found'],                       // 路径错，没提 model
    [400, 'messages is required'],
    [400, 'temperature must be <= 2'],
    [402, 'Insufficient Balance'],
    [undefined, ''],
    [undefined, 'fetch failed'],
  ];
  for (const [status, detail] of shouldNotMatch) {
    assert.equal(looksLikeModelError(status, detail), false, `误判：${status} ${detail}`);
  }
});
