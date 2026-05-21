import * as vscode from 'vscode';
import { TranslationHistoryEntry } from '../types/models';

const HISTORY_KEY = 'chunzen.history';
const MAX_HISTORY = 100;

/**
 * 翻译历史服务 — LRU，持久化到 extension globalState
 */
export class HistoryService {
  constructor(private context: vscode.ExtensionContext) {}

  getAll(): TranslationHistoryEntry[] {
    return this.context.globalState.get<TranslationHistoryEntry[]>(HISTORY_KEY, []);
  }

  add(original: string, translated: string, engine: string): void {
    const history = this.getAll();
    history.unshift({ original, translated, engine, timestamp: Date.now() });
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }
    this.save(history);
  }

  clear(): void {
    this.context.globalState.update(HISTORY_KEY, []);
  }

  private save(history: TranslationHistoryEntry[]): void {
    this.context.globalState.update(HISTORY_KEY, history);
  }
}