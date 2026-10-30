import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotatedPara } from '../src/webviews/sidePanel/paragraphLayout.ts';
import {
  isHeadingContinuation,
  isCollapsibleNoiseSkip,
  previousSemanticParagraph,
  getParagraphColumnIndex,
  groupParagraphsIntoBlocks
} from '../src/webviews/sidePanel/paragraphLayout.ts';

const para = (over: Partial<AnnotatedPara> & { id: string }): AnnotatedPara => ({
  text: '', role: 'body', ...over
});

test('isHeadingContinuation: 前一标题未结束且当前为短标题行时视为续行', () => {
  const prev = para({ id: 'a', text: 'Deep Learning for', role: 'heading' });
  assert.equal(isHeadingContinuation(prev, para({ id: 'b', text: 'Medical Imaging', role: 'heading' })), true);
  assert.equal(isHeadingContinuation(prev, para({ id: 'b', text: 'and more', role: 'heading' })), true);
});

test('isHeadingContinuation: 前一段以句末标点结束、非标题、被跳过时不是续行', () => {
  const heading = (text: string) => para({ id: 'x', text, role: 'heading' });
  assert.equal(isHeadingContinuation(heading('Done.'), heading('Next')), false);
  assert.equal(isHeadingContinuation(para({ id: 'p', text: 'body', role: 'body' }), heading('Next')), false);
  assert.equal(isHeadingContinuation(heading('Title'), para({ id: 'c', text: 'Next', role: 'heading', skipped: true })), false);
  assert.equal(isHeadingContinuation(undefined, heading('Next')), false);
});

test('isCollapsibleNoiseSkip: 仅水印/链接/重复噪声/表格图片类跳过可折叠', () => {
  assert.equal(isCollapsibleNoiseSkip(para({ id: 'a', skipped: true, skipReason: 'Watermark' })), true);
  assert.equal(isCollapsibleNoiseSkip(para({ id: 'a', skipped: true, skipReason: 'table-image' })), true);
  assert.equal(isCollapsibleNoiseSkip(para({ id: 'a', skipped: true, skipReason: 'header' })), false);
  assert.equal(isCollapsibleNoiseSkip(para({ id: 'a', skipped: false, skipReason: 'watermark' })), false);
  assert.equal(isCollapsibleNoiseSkip(undefined), false);
});

test('previousSemanticParagraph: 跳过噪声段，遇到横线则中断', () => {
  const list = [
    para({ id: '0', text: 'real' }),
    para({ id: '1', skipped: true, skipReason: 'watermark' }),
    para({ id: '2', text: 'cur' })
  ];
  assert.equal(previousSemanticParagraph(list, 2)?.id, '0');

  const withRule = [
    para({ id: '0', text: 'real' }),
    para({ id: '1', lineMarker: 'horizontal-rule' }),
    para({ id: '2', text: 'cur' })
  ];
  assert.equal(previousSemanticParagraph(withRule, 2), undefined);
  assert.equal(previousSemanticParagraph(list, 0), undefined);
});

test('getParagraphColumnIndex: 优先 columnIndex，其次 section，并限制在列数内', () => {
  assert.equal(getParagraphColumnIndex(para({ id: 'a', columnIndex: 1 }), 2), 1);
  assert.equal(getParagraphColumnIndex(para({ id: 'a', columnIndex: 5 }), 2), 1);
  assert.equal(getParagraphColumnIndex(para({ id: 'a', section: 'left' }), 2), 0);
  assert.equal(getParagraphColumnIndex(para({ id: 'a', section: 'right' }), 2), 1);
  assert.equal(getParagraphColumnIndex(para({ id: 'a', section: 'right' }), 1), 0);
  assert.equal(getParagraphColumnIndex(para({ id: 'a', section: 'full' }), 2), -1);
});

test('groupParagraphsIntoBlocks: 相邻同类合并，单栏/多栏交替切块', () => {
  const blocks = groupParagraphsIntoBlocks([
    para({ id: '1', section: 'full' }),
    para({ id: '2', section: 'full' }),
    para({ id: '3', section: 'left' }),
    para({ id: '4', section: 'right' }),
    para({ id: '5', section: 'full' })
  ], 2);
  assert.deepEqual(blocks.map(b => [b.type, b.paragraphs.map(p => p.id)]), [
    ['single', ['1', '2']],
    ['columns', ['3', '4']],
    ['single', ['5']]
  ]);
  assert.deepEqual(groupParagraphsIntoBlocks([], 2), []);
});

import { splitChineseSentences, alignSentences, paraClass } from '../src/webviews/sidePanel/paragraphLayout.ts';

test('paraClass: 按角色与模式取样式；正文粗体追加 font-bold，标题不重复', () => {
  const body = para({ id: 'b', role: 'body', bold: true });
  assert.ok(paraClass(body, 'en').includes('font-bold'));
  assert.ok(paraClass(body, 'en').includes('indent-4'));
  assert.ok(paraClass(body, 'zh').includes('indent-8'));
  assert.ok(!paraClass(body, 'bi-zh').includes('indent'));
  const title = para({ id: 't', role: 'title', bold: true });
  assert.equal(paraClass(title, 'en').match(/font-bold/g)?.length, 1);
});

test('paraClass: 标题续行使用更小的下边距', () => {
  const prev = para({ id: 'a', text: 'Deep Learning for', role: 'heading' });
  const cur = para({ id: 'b', text: 'Medical Imaging', role: 'heading' });
  assert.ok(paraClass(cur, 'en', prev).includes('mb-1'));
  assert.ok(paraClass(cur, 'en').includes('mb-3'));
});
