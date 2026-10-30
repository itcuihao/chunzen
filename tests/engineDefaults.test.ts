import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEEPSEEK_EXAMPLE_BASE_URL,
  DEEPSEEK_EXAMPLE_MODEL,
  resolveOpenAiBaseUrl,
  resolveOpenAiModel
} from '../src/services/engines/defaults.ts';

const props = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .contributes.configuration.properties;

// ── 安全约束：API Key 只发往用户亲手填写的地址 ──

test('package.json: 所有携带或决定 Key 去向的设置项都没有默认值', () => {
  for (const key of [
    'chunzen.translation.openai.apiKey',
    'chunzen.translation.openai.baseUrl',
    'chunzen.translation.openai.model'
  ]) {
    assert.equal(props[key].default, '', `${key} 不得有默认值`);
  }
});

test('package.json: 没有任何设置项的默认值是 OpenAI/DeepSeek 等具体服务地址', () => {
  const urls = Object.entries(props)
    .filter(([k, v]: [string, any]) => k.startsWith('chunzen.translation.') && typeof v.default === 'string' && /^https?:\/\//.test(v.default));
  assert.deepEqual(urls.map(([k]) => k), []);
});

test('源码: OpenAI 引擎和配置层不再含任何服务商地址字面量', () => {
  for (const f of ['../src/services/engines/openaiEngine.ts', '../src/services/configService.ts']) {
    const text = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/api\.openai\.com|api\.deepseek\.com/.test(text), `${f} 不应出现服务商地址`);
  }
});

test('源码: 引擎只在校验 Base URL 与模型之后才发请求', () => {
  const text = readFileSync(new URL('../src/services/engines/openaiEngine.ts', import.meta.url), 'utf8');
  const fetchAt = text.indexOf('customFetch(baseUrl');
  assert.ok(fetchAt > 0);
  const before = text.slice(0, fetchAt);
  assert.ok(before.includes('if (!baseUrl)'), '发请求前必须检查 baseUrl');
  assert.ok(before.includes('if (!model)'), '发请求前必须检查 model');
  assert.ok(before.includes('if (!apiKey)'), '发请求前必须检查 apiKey');
});

// ── 地址/模型校验 ──

test('resolveOpenAiBaseUrl: 空、空白、非字符串一律不可用', () => {
  assert.equal(resolveOpenAiBaseUrl(''), undefined);
  assert.equal(resolveOpenAiBaseUrl('   '), undefined);
  assert.equal(resolveOpenAiBaseUrl(undefined), undefined);
  assert.equal(resolveOpenAiBaseUrl(null), undefined);
  assert.equal(resolveOpenAiBaseUrl(123), undefined);
});

test('resolveOpenAiBaseUrl: 只接受 http/https，拒绝其他协议与非法地址', () => {
  assert.equal(resolveOpenAiBaseUrl('file:///etc/passwd'), undefined);
  assert.equal(resolveOpenAiBaseUrl('javascript:alert(1)'), undefined);
  assert.equal(resolveOpenAiBaseUrl('ftp://example.com'), undefined);
  assert.equal(resolveOpenAiBaseUrl('api.example.com/v1'), undefined);
  assert.equal(resolveOpenAiBaseUrl('not a url'), undefined);
});

test('resolveOpenAiBaseUrl: 合法地址去掉首尾空白与末尾斜杠，保留路径', () => {
  assert.equal(resolveOpenAiBaseUrl(' https://api.example.com/ '), 'https://api.example.com');
  assert.equal(resolveOpenAiBaseUrl('https://api.example.com/v1///'), 'https://api.example.com/v1');
  assert.equal(resolveOpenAiBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('resolveOpenAiModel: 空/空白/非字符串不可用，其余去空白后返回', () => {
  assert.equal(resolveOpenAiModel(''), undefined);
  assert.equal(resolveOpenAiModel('  '), undefined);
  assert.equal(resolveOpenAiModel(undefined), undefined);
  assert.equal(resolveOpenAiModel(' my-model '), 'my-model');
});

test('示例常量本身是合法的，且只用于设置页按钮，不是回退值', () => {
  assert.equal(resolveOpenAiBaseUrl(DEEPSEEK_EXAMPLE_BASE_URL), 'https://api.deepseek.com');
  assert.equal(resolveOpenAiModel(DEEPSEEK_EXAMPLE_MODEL), 'deepseek-flash');
});
