import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePriority } from '../src/services/enginePriority.ts';

const known = ['baidu', 'deepl', 'openai', 'custom'];

test('保留用户顺序，并把缺失的新引擎追加到末尾', () => {
  assert.deepEqual(normalizePriority(['openai', 'baidu'], known), ['openai', 'baidu', 'deepl', 'custom']);
});

test('去除未知、重复与非字符串项', () => {
  assert.deepEqual(normalizePriority(['x', 'baidu', 'baidu', 3, null], known), ['baidu', 'deepl', 'openai', 'custom']);
});

test('配置不是数组时回落到默认顺序', () => {
  assert.deepEqual(normalizePriority(undefined, known), known);
  assert.deepEqual(normalizePriority('baidu', known), known);
});

test('用户保存过的旧顺序不被默认顺序变更覆盖，仅补全缺失引擎', () => {
  // 旧默认顺序 baidu, deepl, openai, custom：用户已持久化，应原样保留
  assert.deepEqual(
    normalizePriority(['baidu', 'deepl', 'openai', 'custom'], ['baidu', 'openai', 'deepl', 'custom']),
    ['baidu', 'deepl', 'openai', 'custom']
  );
});

test('package.json 声明的默认优先级与注册表顺序一致', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const declared = pkg.contributes.configuration.properties['chunzen.translation.priority'].default;
  assert.deepEqual(declared, ['baidu', 'openai', 'custom', 'deepl']);
});
