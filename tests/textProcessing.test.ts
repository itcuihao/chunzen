import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  protectMathAndCitations,
  restoreMathAndCitations,
  restoreMathAndCitationsFallback,
  mapHtmlToPlain,
  mergeSplitDoi,
  mergeSplitUrl,
  preprocessLinks,
  protectTextWithPlaceholders,
  splitTableCells,
  classifyParagraphs
} from '../src/webviews/sidePanel/textProcessing.ts';

test('protectMathAndCitations: 公式与引用被替换为占位符，可无损还原', () => {
  const text = 'Energy $E=mc^2$ is shown in [1-3] and $$x+y$$ as noted¹.';
  const { protectedText, maths, citations } = protectMathAndCitations(text);
  assert.ok(!protectedText.includes('$'));
  assert.ok(!protectedText.includes('[1-3]'));
  assert.equal(maths.length, 2);
  assert.equal(citations.length, 2);
  assert.equal(restoreMathAndCitations(protectedText, maths, citations), text);
});

test('restoreMathAndCitations: 译文中缺失/越界的占位符保持原样', () => {
  assert.equal(restoreMathAndCitations('a [[CZCITATION_5]] b', [], []), 'a [[CZCITATION_5]] b');
});

test('restoreMathAndCitationsFallback: 译文只保留占位符时依据原文还原', () => {
  const original = 'See [2] and $a$.';
  const { protectedText } = protectMathAndCitations(original);
  assert.equal(restoreMathAndCitationsFallback(protectedText, original), original);
});

test('mapHtmlToPlain: 去标签并建立索引映射', () => {
  const html = 'a<i>b</i>c';
  const { plainText, mapIdx } = mapHtmlToPlain(html);
  assert.equal(plainText, 'abc');
  assert.equal(html[mapIdx[1]], 'b');
  assert.equal(mapIdx[plainText.length], html.length);
});

test('mergeSplitDoi: 仅在连接符处合并被换行拆开的 DOI', () => {
  assert.equal(mergeSplitDoi('doi 10.1038/s41586- 020-2649-2 end'), 'doi 10.1038/s41586-020-2649-2 end');
  assert.equal(mergeSplitDoi('see 10.1038/abc and more'), 'see 10.1038/abc and more');
});

test('mergeSplitUrl: 合并被空白拆开的 URL，不吞并普通后续单词', () => {
  assert.equal(mergeSplitUrl('https://example.com/a/ b/c'), 'https://example.com/a/b/c');
  assert.equal(mergeSplitUrl('https://example.com then words'), 'https://example.com then words');
});

test('preprocessLinks: 空串安全', () => {
  assert.equal(preprocessLinks(''), '');
});

test('protectTextWithPlaceholders: 数字引用、图表引用、DOI 各自编号', () => {
  const out = protectTextWithPlaceholders('As in [1], Figure 2 and Table 3 (doi:10.1038/abc123).');
  assert.ok(out.includes('[[CZNUM_0]]'));
  assert.ok(out.includes('[[CZFIG_0]]'));
  assert.ok(out.includes('[[CZFIG_1]]'));
  assert.ok(out.includes('[[CZDOI_0]]'));
  assert.ok(!out.includes('[1]'));
});

test('protectTextWithPlaceholders: 作者-年份引用', () => {
  const out = protectTextWithPlaceholders('Smith et al. (2019) showed this (Jones, 2020).');
  assert.ok(out.includes('[[CZNAR_0]]'));
  assert.ok(out.includes('[[CZPAR_0]]'));
});

test('protectTextWithPlaceholders: 空串与无引用文本', () => {
  assert.equal(protectTextWithPlaceholders(''), '');
  assert.equal(protectTextWithPlaceholders('plain text only'), 'plain text only');
});

test('splitTableCells: tab 优先，其次多空格，否则整体一格', () => {
  assert.deepEqual(splitTableCells('a\tb\tc'), ['a', 'b', 'c']);
  assert.deepEqual(splitTableCells('a   b    c'), ['a', 'b', 'c']);
  assert.deepEqual(splitTableCells('single cell'), ['single cell']);
  assert.deepEqual(splitTableCells('   '), []);
});

test('classifyParagraphs: 有字号时 blockType 优先于字号推断', () => {
  assert.deepEqual(
    classifyParagraphs([
      { text: 'T', blockType: 'title', fontSize: 10 },
      { text: 'H', blockType: 'heading', fontSize: 10 },
      { text: 'Fig', blockType: 'figure-caption', fontSize: 10 },
      { text: 'r', blockType: 'reference', fontSize: 10 }
    ]),
    ['title', 'heading', 'small', 'small']
  );
});

test('classifyParagraphs: 整页都没有字号信息时全部按正文处理（含带 blockType 的段落）', () => {
  assert.deepEqual(classifyParagraphs([{ text: 'a' }, { text: 'b', blockType: 'title' }]), ['body', 'body']);
});

test('classifyParagraphs: 按字号与标题关键词回退判断', () => {
  const roles = classifyParagraphs([
    { text: 'Body text paragraph one that is long enough.', fontSize: 10 },
    { text: 'Body text paragraph two that is long enough.', fontSize: 10 },
    { text: 'Body text paragraph three that is long enough.', fontSize: 10 },
    { text: 'A Very Large Title', fontSize: 16 },
    { text: 'Short Heading', fontSize: 12 },
    { text: 'Introduction', fontSize: 10 },
    { text: 'tiny footnote', fontSize: 8 }
  ]);
  assert.deepEqual(roles, ['body', 'body', 'body', 'title', 'heading', 'heading', 'small']);
});
