import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePriority } from '../src/services/enginePriority.ts';

const known = ['baidu', 'deepl', 'openai', 'anthropic', 'custom'];

test('保留用户顺序，并把缺失的新引擎追加到末尾', () => {
  assert.deepEqual(normalizePriority(['openai', 'baidu'], known), ['openai', 'baidu', 'deepl', 'anthropic', 'custom']);
});

test('去除未知、重复与非字符串项', () => {
  assert.deepEqual(normalizePriority(['x', 'baidu', 'baidu', 3, null], known), ['baidu', 'deepl', 'openai', 'anthropic', 'custom']);
});

test('配置不是数组时回落到默认顺序', () => {
  assert.deepEqual(normalizePriority(undefined, known), known);
  assert.deepEqual(normalizePriority('baidu', known), known);
});
