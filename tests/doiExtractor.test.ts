import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoiExtractor } from '../src/services/doiExtractor.ts';

test('提取 DOI 并去除末尾标点', () => {
  assert.equal(DoiExtractor.extractDoi('see doi: 10.1038/s41586-020-2649-2.'), '10.1038/s41586-020-2649-2');
  assert.equal(DoiExtractor.extractDoi('no doi here'), undefined);
});

test('提取并去重 ISSN', () => {
  assert.deepEqual(DoiExtractor.extractIssn('ISSN 0028-0836, 0028-0836, 1476-4687'), ['0028-0836', '1476-4687']);
});
