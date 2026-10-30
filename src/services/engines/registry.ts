import * as vscode from 'vscode';
import { TranslationEngine } from '../../types/models';
import { normalizePriority } from '../enginePriority';
import { BaiduEngine } from './baiduEngine';
import { DeepLEngine } from './deeplEngine';
import { OpenAIEngine, CustomHttpEngine } from './openaiEngine';

/**
 * 翻译引擎注册表 — 引擎列表的唯一来源（同时决定默认优先级顺序）。
 * 新增引擎：实现 TranslationEngine → 加入此处 → package.json 增加配置项 →
 * ConfigService.ENGINE_CONFIG_KEYS 与 SettingsTab.engineFields 增加字段。
 */
const ENGINES: readonly TranslationEngine[] = [
  new BaiduEngine(),
  new OpenAIEngine(),
  new DeepLEngine(),
  new CustomHttpEngine()
];

export function getEngines(): readonly TranslationEngine[] {
  return ENGINES;
}

export function getEngineNames(): string[] {
  return ENGINES.map(e => e.name);
}

/** 读取并规范化用户配置的引擎优先级 */
export function getTranslationPriority(): string[] {
  const configured = vscode.workspace
    .getConfiguration('chunzen.translation')
    .get<unknown>('priority');
  return normalizePriority(configured, getEngineNames());
}
