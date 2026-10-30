import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCitationKeys, convertSupTagsToUnicode, isSuperscriptCitation } from '../src/utils/academicHelper.ts';

test('parseCitationKeys 展开范围与列表', () => {
  assert.deepEqual(parseCitationKeys('1-3'), ['1', '2', '3']);
  assert.deepEqual(parseCitationKeys('1,4'), ['1', '4']);
  assert.deepEqual(parseCitationKeys('¹⁻³'), ['1', '2', '3']);
});

test('convertSupTagsToUnicode 仅转换引用型 sup', () => {
  assert.equal(convertSupTagsToUnicode('word<sup>1,2</sup>'), 'word¹,²');
  assert.equal(convertSupTagsToUnicode('x<sup>n</sup>'), 'x<sup>n</sup>');
});

test('isSuperscriptCitation', () => {
  assert.equal(isSuperscriptCitation('¹,²'), true);
  assert.equal(isSuperscriptCitation('12'), false);
});
