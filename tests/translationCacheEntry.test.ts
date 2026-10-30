import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCacheEntry, decodeCacheEntry } from '../src/services/translationCacheEntry.ts';

test('编码后可解码', () => {
  assert.deepEqual(decodeCacheEntry(encodeCacheEntry('deepl', '你好')), { engine: 'deepl', text: '你好' });
});

test('兼容旧格式 引擎\\0译文', () => {
  assert.deepEqual(decodeCacheEntry('baidu\x00译文'), { engine: 'baidu', text: '译文' });
});

test('译文中含分隔符时不被截断', () => {
  assert.equal(decodeCacheEntry(encodeCacheEntry('openai', 'a\x00b'))?.text, 'a\x00b');
});

test('无分隔符的损坏数据返回 undefined', () => {
  assert.equal(decodeCacheEntry('garbage'), undefined);
});
