"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HighlightService = void 0;
const HIGHLIGHTS_KEY = 'chunzen.highlights';
/**
2. * 高亮与批注服务 — 持久化到 extension globalState 之中
3. */
class HighlightService {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.globalState.get(HIGHLIGHTS_KEY, []);
    }
    getForPdf(pdfUri) {
        const all = this.getAll();
        return all.filter(h => h.pdfUri === pdfUri);
    }
    add(highlight) {
        const all = this.getAll();
        const newHighlight = {
            ...highlight,
            id: highlight.id || Math.random().toString(36).substring(2, 9),
            createdAt: Date.now()
        };
        const existingIdx = all.findIndex(h => h.id === newHighlight.id);
        if (existingIdx >= 0) {
            all[existingIdx] = { ...all[existingIdx], ...newHighlight };
        }
        else {
            all.push(newHighlight);
        }
        this.save(all);
        return newHighlight;
    }
    updateNote(id, note) {
        const all = this.getAll();
        const hl = all.find(h => h.id === id);
        if (hl) {
            hl.note = note;
            this.save(all);
        }
    }
    updateColor(id, color) {
        const all = this.getAll();
        const hl = all.find(h => h.id === id);
        if (hl) {
            hl.color = color;
            this.save(all);
        }
    }
    delete(id) {
        const all = this.getAll();
        const filtered = all.filter(h => h.id !== id);
        this.save(filtered);
    }
    clearForPdf(pdfUri) {
        const all = this.getAll();
        const filtered = all.filter(h => h.pdfUri !== pdfUri);
        this.save(filtered);
    }
    save(highlights) {
        this.context.globalState.update(HIGHLIGHTS_KEY, highlights);
    }
}
exports.HighlightService = HighlightService;
//# sourceMappingURL=highlightService.js.map