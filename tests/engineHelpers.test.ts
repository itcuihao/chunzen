import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getByPath, renderBodyTemplate } from '../src/utils/engineHelpers.ts';

test('getByPath 按路径取值', () => {
  assert.equal(getByPath({ data: { translation: '好' } }, 'data.translation'), '好');
  assert.equal(getByPath({ a: 1 }, 'a.b.c'), undefined);
  assert.equal(getByPath(null, 'a'), undefined);
});

test('renderBodyTemplate 转义引号并替换全部占位符', () => {
  const body = renderBodyTemplate('{"a":"{{text}}","b":"{{text}}"}', 'say "hi"\n$&');
  assert.deepEqual(JSON.parse(body), { a: 'say "hi"\n$&', b: 'say "hi"\n$&' });
});
