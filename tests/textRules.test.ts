import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, splitIntoSentences, isMathArtifact, isReferenceStart } from '../src/webviews/pdfViewer/textRules.ts';

test('splitIntoSentences: 基本断句', () => {
  assert.deepEqual(
    splitIntoSentences('We train a model. It works well! Does it scale? Yes.').map(s => s.trim()),
    ['We train a model.', 'It works well!', 'Does it scale?', 'Yes.']
  );
});

test('splitIntoSentences: 不在 et al. / Fig. / 人名缩写处断句', () => {
  const out = splitIntoSentences('As shown by Smith et al. in Fig. 3, the method works. Next we test.').map(s => s.trim());
  assert.equal(out.length, 2);
  assert.ok(out[0].includes('et al.') && out[0].includes('Fig. 3'));

  const initials = splitIntoSentences('Proposed by A. B. Smith for this task. Done.').map(s => s.trim());
  assert.equal(initials.length, 2);
});

test('splitIntoSentences: 中文标点', () => {
  assert.equal(splitIntoSentences('这是第一句。这是第二句！').length, 2);
});

test('splitIntoSentences: 尾部无标点的残句保留，过短片段丢弃', () => {
  assert.deepEqual(splitIntoSentences('Done. trailing words').map(s => s.trim()), ['Done.', 'trailing words']);
  assert.deepEqual(splitIntoSentences('a'), []);
});

test('splitIntoSentences: 拼回后与原文等价（占位符被还原）', () => {
  const text = 'See Fig. 2 and Eq. 4 by Wang et al. here. Then more.';
  assert.equal(splitIntoSentences(text).join(''), text);
});

test('normalizeText: 全角数字、圆圈数字、项目符号', () => {
  assert.equal(normalizeText('１２３'), '123');
  assert.equal(normalizeText('① first'), '(1) first');
  assert.equal(normalizeText(' item'), '• item');
  assert.equal(normalizeText(''), '');
});

test('isMathArtifact', () => {
  assert.equal(isMathArtifact('\\alpha'), true);
  assert.equal(isMathArtifact('∑'), true);
  assert.equal(isMathArtifact('<='), true);
  assert.equal(isMathArtifact('word'), false);
  assert.equal(isMathArtifact('x'), false);
});

test('isReferenceStart: 常见参考文献起始格式', () => {
  assert.equal(isReferenceStart('[12] Smith J. Title'), true);
  assert.equal(isReferenceStart('12. Smith J. Title'), true);
  assert.equal(isReferenceStart('2019. Something'), false);
  assert.equal(isReferenceStart('Smith, J. (2019) Title'), true);
  assert.equal(isReferenceStart('plain body text'), false);
});

test('isReferenceStart: 参考文献区内的 hanging 缩进决定作者-年份样式', () => {
  assert.equal(isReferenceStart('Smith, J. Title of paper', true, true), true);
  assert.equal(isReferenceStart('Smith, J. Title of paper 2020', true, false), false);
});
