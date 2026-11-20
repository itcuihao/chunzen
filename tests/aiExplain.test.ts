import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_EXPLAIN_SYSTEM_PROMPT,
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  buildExplainSystemPrompt,
  parseExplainOutput
} from '../src/services/engines/llmPrompt.ts';

test('释义 prompt 与翻译 prompt 不同：释义要求先译文后解释', () => {
  assert.notEqual(AI_EXPLAIN_SYSTEM_PROMPT, DEFAULT_TRANSLATION_SYSTEM_PROMPT);
  assert.match(AI_EXPLAIN_SYSTEM_PROMPT, /译文：/);
  assert.match(AI_EXPLAIN_SYSTEM_PROMPT, /解释：/);
});

test('释义 prompt 注入命中的术语表；无术语时保持原样', () => {
  assert.equal(buildExplainSystemPrompt([]), AI_EXPLAIN_SYSTEM_PROMPT);
  const withTerms = buildExplainSystemPrompt([{ id: '1', source: 'circRNA', target: '环状RNA' }]);
  assert.ok(withTerms.startsWith(AI_EXPLAIN_SYSTEM_PROMPT));
  assert.match(withTerms, /circRNA -> 环状RNA/);
});

test('解析标准“译文/解释”输出', () => {
  assert.deepEqual(
    parseExplainOutput('译文：环状RNA\n解释：一类共价闭合的非编码RNA。'),
    { translation: '环状RNA', explanation: '一类共价闭合的非编码RNA。' }
  );
});

test('解析支持半角冒号与多行内容', () => {
  assert.deepEqual(
    parseExplainOutput('译文: 第一行\n第二行\n解释: 说明A\n说明B'),
    { translation: '第一行\n第二行', explanation: '说明A\n说明B' }
  );
});

test('只有译文时 explanation 为空', () => {
  assert.deepEqual(parseExplainOutput('译文：环状RNA'), { translation: '环状RNA', explanation: undefined });
});

test('模型未遵循格式时整段作为解释，内容不丢失', () => {
  assert.deepEqual(parseExplainOutput('这是一段自由格式的说明。'), { explanation: '这是一段自由格式的说明。' });
});

test('空输出返回空对象', () => {
  assert.deepEqual(parseExplainOutput('   '), {});
});
