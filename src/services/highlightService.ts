import * as vscode from 'vscode';
import { SelectionHighlight } from '../types/models';

const HIGHLIGHTS_KEY = 'chunzen.highlights';

/**
2. * 高亮与批注服务 — 持久化到 extension globalState 之中
3. */
export class HighlightService {
  constructor(private context: vscode.ExtensionContext) {}

  getAll(): SelectionHighlight[] {
    return this.context.globalState.get<SelectionHighlight[]>(HIGHLIGHTS_KEY, []);
  }

  getForPdf(pdfUri: string): SelectionHighlight[] {
    const all = this.getAll();
    return all.filter(h => h.pdfUri === pdfUri);
  }

  add(highlight: Omit<SelectionHighlight, 'id' | 'createdAt'> & { id?: string }): SelectionHighlight {
    const all = this.getAll();
    const newHighlight: SelectionHighlight = {
      ...highlight,
      id: highlight.id || Math.random().toString(36).substring(2, 9),
      createdAt: Date.now()
    };
    const existingIdx = all.findIndex(h => h.id === newHighlight.id);
    if (existingIdx >= 0) {
      all[existingIdx] = { ...all[existingIdx], ...newHighlight };
    } else {
      all.push(newHighlight);
    }
    this.save(all);
    return newHighlight;
  }

  updateNote(id: string, note: string): void {
    const all = this.getAll();
    const hl = all.find(h => h.id === id);
    if (hl) {
      hl.note = note;
      this.save(all);
    }
  }

  updateColor(id: string, color: SelectionHighlight['color']): void {
    const all = this.getAll();
    const hl = all.find(h => h.id === id);
    if (hl) {
      hl.color = color;
      this.save(all);
    }
  }

  delete(id: string): void {
    const all = this.getAll();
    const filtered = all.filter(h => h.id !== id);
    this.save(filtered);
  }

  clearForPdf(pdfUri: string): void {
    const all = this.getAll();
    const filtered = all.filter(h => h.pdfUri !== pdfUri);
    this.save(filtered);
  }

  private save(highlights: SelectionHighlight[]): void {
    this.context.globalState.update(HIGHLIGHTS_KEY, highlights);
  }
}
