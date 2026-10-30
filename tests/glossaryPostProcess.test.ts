import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGlossary } from '../src/services/glossaryPostProcess.ts';

const term = (source: string, target: string) => ({ id: '1', source, target });

test('英文术语按单词边界、忽略大小写替换', () => {
  assert.equal(applyGlossary('使用 Transformer 模型与 transformers', [term('transformer', '变换器')]), '使用 变换器 模型与 transformers');
});

test('支持 | 分隔的多种写法', () => {
  assert.equal(applyGlossary('CNN 与 ConvNet', [term('CNN|ConvNet', '卷积网络')]), '卷积网络 与 卷积网络');
});

test('target 中的 $ 不被当作替换模式', () => {
  assert.equal(applyGlossary('cost', [term('cost', '$& 成本 $1')]), '$& 成本 $1');
});

test('source 含正则元字符时不抛错', () => {
  assert.equal(applyGlossary('a+b (c)', [term('a+b', 'X')]), 'X (c)');
});

test('空术语表原样返回', () => {
  assert.equal(applyGlossary('原文', []), '原文');
});
