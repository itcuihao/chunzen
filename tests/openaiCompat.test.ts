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

test('预设本身是合法地址与合法模型名（模型名不能为空、不能含空格）', () => {
  assert.ok(OPENAI_PRESETS.length >= 4);
  for (const preset of OPENAI_PRESETS) {
    assert.match(preset.baseUrl, /^https:\/\//, `${preset.id} baseUrl`);
    assert.ok(preset.model.trim() === preset.model && preset.model.length > 0, `${preset.id} model`);
    assert.ok(preset.keyUrl.startsWith('https://'), `${preset.id} keyUrl`);
  }
});

test('预设地址互不重复，且 findPreset/detectPreset 可双向对应', () => {
  assert.equal(new Set(OPENAI_PRESETS.map((p) => p.baseUrl)).size, OPENAI_PRESETS.length);
  for (const preset of OPENAI_PRESETS) {
    assert.equal(findPreset(preset.id)?.baseUrl, preset.baseUrl);
    assert.equal(detectPreset(preset.baseUrl)?.id, preset.id);
  }
  assert.equal(findPreset('nope'), undefined);
  assert.equal(detectPreset('https://unknown.example.com'), undefined);
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
