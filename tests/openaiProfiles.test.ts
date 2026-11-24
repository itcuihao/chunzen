import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPENAI_PRESETS } from '../src/services/engines/openaiPresets';
import {
  getOrderedConfiguredProfiles,
  isOpenAiProfileConfigured,
  parseOpenAiProfiles,
  resolveOpenAiProfiles
} from '../src/services/engines/openaiProfiles';

describe('openaiProfiles & presets', () => {
  it('预设列表中“自定义 / 中转站”排在第一位', () => {
    assert.equal(OPENAI_PRESETS[0]?.id, 'custom');
  });

  it('parseOpenAiProfiles 规范化字段并去重 ID', () => {
    const raw = JSON.stringify([
      { id: 'p1', name: 'A', baseUrl: ' https://a.com/v1 ', apiKey: ' k1 ', model: ' m1 ' },
      { id: 'p1', name: 'B', baseUrl: 'https://b.com/v1', apiKey: 'k2', model: 'm2', enabled: false }
    ]);
    const list = parseOpenAiProfiles(raw);
    assert.equal(list.length, 2);
    assert.equal(list[0].id, 'p1');
    assert.equal(list[0].baseUrl, 'https://a.com/v1');
    assert.equal(list[0].enabled, true);
    assert.equal(list[1].id, 'p1-2');
    assert.equal(list[1].enabled, false);
  });

  it('resolveOpenAiProfiles 在 profiles 为空时自动迁移旧版单组配置', () => {
    const migrated = resolveOpenAiProfiles([], {
      apiKey: 'sk-legacy',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      timeoutMs: 45000
    });
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].apiKey, 'sk-legacy');
    assert.equal(migrated[0].baseUrl, 'https://api.deepseek.com');
    assert.equal(migrated[0].model, 'deepseek-flash');
    assert.equal(migrated[0].name, 'DeepSeek 官方');
    assert.equal(migrated[0].enabled, true);
  });

  it('resolveOpenAiProfiles 当新旧配置都为空时返回空数组', () => {
    assert.deepEqual(resolveOpenAiProfiles([], { apiKey: '', baseUrl: '', model: '' }), []);
  });

  it('getOrderedConfiguredProfiles 按顺序过滤未启用/未填全的项，并支持指定优先 ID', () => {
    const profiles = [
      { id: 'p1', name: '禁用', baseUrl: 'https://a.com/v1', apiKey: 'k1', model: 'm1', enabled: false },
      { id: 'p2', name: '主翻译', baseUrl: 'https://b.com/v1', apiKey: 'k2', model: 'm2', enabled: true },
      { id: 'p3', name: '缺模型', baseUrl: 'https://c.com/v1', apiKey: 'k3', model: '', enabled: true },
      { id: 'p4', name: 'AI解释专用', baseUrl: 'https://d.com/v1', apiKey: 'k4', model: 'm4', enabled: true }
    ];

    assert.equal(isOpenAiProfileConfigured(profiles[0]), false);
    assert.equal(isOpenAiProfileConfigured(profiles[1]), true);

    const defaultOrder = getOrderedConfiguredProfiles(profiles);
    assert.deepEqual(defaultOrder.map((p) => p.id), ['p2', 'p4']);

    const explainOrder = getOrderedConfiguredProfiles(profiles, 'p4');
    assert.deepEqual(explainOrder.map((p) => p.id), ['p4', 'p2']);
  });
});
