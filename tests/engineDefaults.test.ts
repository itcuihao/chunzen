import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPENAI_DEFAULT_BASE_URL,
  OPENAI_DEFAULT_MODEL,
  LEGACY_OPENAI_BASE_URL,
  LEGACY_OPENAI_MODEL,
  legacyOpenAiPins
} from '../src/services/engines/defaults.ts';

const props = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .contributes.configuration.properties;

test('代码默认值与 package.json 声明的默认值一致', () => {
  assert.equal(props['chunzen.translation.openai.baseUrl'].default, OPENAI_DEFAULT_BASE_URL);
  assert.equal(props['chunzen.translation.openai.model'].default, OPENAI_DEFAULT_MODEL);
});

test('新默认值为 DeepSeek；Base URL 不含 /chat/completions（引擎会自行拼接）', () => {
  assert.equal(OPENAI_DEFAULT_BASE_URL, 'https://api.deepseek.com');
  assert.equal(OPENAI_DEFAULT_MODEL, 'deepseek-flash');
  assert.ok(!OPENAI_DEFAULT_BASE_URL.endsWith('/chat/completions'));
});

test('迁移: 已填 Key 且依赖旧默认值的用户被固定在 OpenAI 旧值', () => {
  assert.deepEqual(
    legacyOpenAiPins({ apiKey: 'sk-xxx', baseUrlExplicit: false, modelExplicit: false }),
    { baseUrl: LEGACY_OPENAI_BASE_URL, model: LEGACY_OPENAI_MODEL }
  );
});

test('迁移: 只固定用户没显式设置的那一项，不覆盖已有设置', () => {
  assert.deepEqual(
    legacyOpenAiPins({ apiKey: 'sk-xxx', baseUrlExplicit: true, modelExplicit: false }),
    { model: LEGACY_OPENAI_MODEL }
  );
  assert.deepEqual(
    legacyOpenAiPins({ apiKey: 'sk-xxx', baseUrlExplicit: false, modelExplicit: true }),
    { baseUrl: LEGACY_OPENAI_BASE_URL }
  );
  assert.deepEqual(legacyOpenAiPins({ apiKey: 'sk-xxx', baseUrlExplicit: true, modelExplicit: true }), {});
});

test('迁移: 没有 Key 的用户（含新用户）不写任何设置，直接用新默认值', () => {
  assert.deepEqual(legacyOpenAiPins({ apiKey: '', baseUrlExplicit: false, modelExplicit: false }), {});
  assert.deepEqual(legacyOpenAiPins({ apiKey: '   ', baseUrlExplicit: false, modelExplicit: false }), {});
});

test('迁移: 幂等 — 写入后变为显式设置，再次执行不再产生写入', () => {
  const first = legacyOpenAiPins({ apiKey: 'sk-xxx', baseUrlExplicit: false, modelExplicit: false });
  assert.ok(first.baseUrl && first.model);
  const second = legacyOpenAiPins({ apiKey: 'sk-xxx', baseUrlExplicit: true, modelExplicit: true });
  assert.deepEqual(second, {});
});
