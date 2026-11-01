import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCitationKeys, convertSupTagsToUnicode, isSuperscriptCitation, parseAuthorYearCitations } from '../src/utils/academicHelper.ts';

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

test('parseAuthorYearCitations 解析单作者与多年份复合引用', () => {
  const single = parseAuthorYearCitations('Smith et al., 2020');
  assert.equal(single.length, 1);
  assert.equal(single[0].key, 'smith-2020');

  const multiYears = parseAuthorYearCitations('Smith et al., 2020, 2021');
  assert.equal(multiYears.length, 2);
  assert.equal(multiYears[0].key, 'smith-2020');
  assert.equal(multiYears[1].key, 'smith-2021');

  const letterSuffix = parseAuthorYearCitations('Doe, 2020a, b');
  assert.equal(letterSuffix.length, 2);
  assert.equal(letterSuffix[0].key, 'doe-2020a');
  assert.equal(letterSuffix[1].key, 'doe-2020b');
});
