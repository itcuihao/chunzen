import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampNumber, oneOf, CACHE_MAX_SIZE, LAYOUT_TIMEOUT_MS } from '../src/services/settingsNormalize.ts';

test('clampNumber: 范围内取整，越界截断', () => {
  assert.equal(clampNumber(300.6, CACHE_MAX_SIZE), 301);
  assert.equal(clampNumber(0, CACHE_MAX_SIZE), 50);
  assert.equal(clampNumber(99999, CACHE_MAX_SIZE), 5000);
  assert.equal(clampNumber(100, LAYOUT_TIMEOUT_MS), 500);
});

test('clampNumber: 非数字/NaN/undefined 回落到默认值', () => {
  assert.equal(clampNumber(undefined, CACHE_MAX_SIZE), 500);
  assert.equal(clampNumber('abc', LAYOUT_TIMEOUT_MS), 3500);
  assert.equal(clampNumber(NaN, LAYOUT_TIMEOUT_MS), 3500);
});

test('oneOf: 合法值原样返回，非法值回落', () => {
  assert.equal(oneOf('dark', ['auto', 'dark', 'light'] as const, 'auto'), 'dark');
  assert.equal(oneOf('neon', ['auto', 'dark', 'light'] as const, 'auto'), 'auto');
  assert.equal(oneOf(undefined, ['bar', 'overlay'] as const, 'overlay'), 'overlay');
});
