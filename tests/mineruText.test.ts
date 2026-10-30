import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMathInText, applyHighlightsToMineruText, applyJumpLinksToMineruText } from '../src/webviews/sidePanel/mineruText.ts';

test('renderMathInText: 行内与块级公式被渲染为 katex HTML，其余文本不变', () => {
  const out = renderMathInText('a $x^2$ b $$y$$ c');
  assert.ok(out.includes('katex'));
  assert.ok(!out.includes('$x^2$'));
  assert.ok(out.startsWith('a ') && out.endsWith(' c'));
  assert.equal(renderMathInText('no math, cost is 5 dollars'), 'no math, cost is 5 dollars');
});

test('applyHighlightsToMineruText: 仅对本段落的高亮生效，带 id 与批注标记', () => {
  const hl = [
    { id: 'h1', pdfUri: 'u', pageNumber: 1, paragraphId: 'p1', text: 'key term', color: 'blue' as const, createdAt: 0 },
    { id: 'h2', pdfUri: 'u', pageNumber: 1, paragraphId: 'other', text: 'term', color: 'green' as const, createdAt: 0 }
  ];
  const out = applyHighlightsToMineruText('this is a key term here', 'p1', hl);
  assert.ok(out.includes('data-highlight-id="h1"'));
  assert.ok(!out.includes('h2'));
  assert.equal(applyHighlightsToMineruText('plain', 'p1', hl), 'plain');
});

test('applyHighlightsToMineruText: 高亮文本含正则元字符时不抛错；批注带徽标', () => {
  const hl = [{ id: 'h', pdfUri: 'u', pageNumber: 1, paragraphId: 'p', text: 'a+b (c)', color: 'yellow' as const, note: '重点', createdAt: 0 }];
  const out = applyHighlightsToMineruText('see a+b (c) now', 'p', hl);
  assert.ok(out.includes('data-highlight-id="h"'));
  assert.ok(out.includes('批注: 重点'));
});

test('applyJumpLinksToMineruText: 数字引用区分有无文献条目，图表引用可跳转', () => {
  const out = applyJumpLinksToMineruText('See [1,2] and Figure 3.', { '1': { text: 'ref', pageNumber: 9 } });
  assert.ok(out.includes('data-jump-citation="1"'));
  assert.ok(!out.includes('data-jump-citation="2"'));
  assert.ok(out.includes('data-jump-caption="Figure 3"'));
});

test('applyJumpLinksToMineruText: 范围展开与空串', () => {
  const out = applyJumpLinksToMineruText('[1-3]', { '1': { text: '', pageNumber: 1 }, '2': { text: '', pageNumber: 1 }, '3': { text: '', pageNumber: 1 } });
  assert.equal((out.match(/data-jump-citation=/g) || []).length, 3);
  assert.equal(applyJumpLinksToMineruText('', {}), '');
});
