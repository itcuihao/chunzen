import * as vscode from 'vscode';
import { GlossaryEntry } from '../types/models';

const GLOSSARY_KEY = 'chunzen.glossary';
const MAX_TERMS = 1000;

/**
 * 术语表服务 — CRUD，持久化到 extension globalState
 */
export class GlossaryService {
  constructor(private context: vscode.ExtensionContext) {}

  getAll(): GlossaryEntry[] {
    return this.context.globalState.get<GlossaryEntry[]>(GLOSSARY_KEY, []);
  }

  add(source: string, target: string): GlossaryEntry {
    const terms = this.getAll();
    if (terms.length >= MAX_TERMS) {
      throw new Error(`术语表已达上限 (${MAX_TERMS} 条)`);
    }
    const entry: GlossaryEntry = {
      id: generateId(),
      source: source.trim(),
      target: target.trim()
    };
    terms.push(entry);
    this.save(terms);
    return entry;
  }

  update(id: string, source: string, target: string): GlossaryEntry | undefined {
    const terms = this.getAll();
    const idx = terms.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    terms[idx] = { id, source: source.trim(), target: target.trim() };
    this.save(terms);
    return terms[idx];
  }

  delete(id: string): boolean {
    const terms = this.getAll();
    const idx = terms.findIndex(t => t.id === id);
    if (idx === -1) return false;
    terms.splice(idx, 1);
    this.save(terms);
    return true;
  }

  clear(): void {
    this.context.globalState.update(GLOSSARY_KEY, []);
  }

  /**
   * Apply glossary to text — replace known terms with translations
   */
  applyToText(text: string): Array<{ source: string; target: string }> {
    const terms = this.getAll();
    const found: Array<{ source: string; target: string }> = [];
    for (const term of terms) {
      if (text.toLowerCase().includes(term.source.toLowerCase())) {
        found.push({ source: term.source, target: term.target });
      }
    }
    return found;
  }

  private save(terms: GlossaryEntry[]): void {
    this.context.globalState.update(GLOSSARY_KEY, terms);
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}