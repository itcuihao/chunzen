"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlossaryService = void 0;
const GLOSSARY_KEY = 'chunzen.glossary';
const MAX_TERMS = 1000;
/**
 * 术语表服务 — CRUD，持久化到 extension globalState
 */
class GlossaryService {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.globalState.get(GLOSSARY_KEY, []);
    }
    add(source, target) {
        const terms = this.getAll();
        if (terms.length >= MAX_TERMS) {
            throw new Error(`术语表已达上限 (${MAX_TERMS} 条)`);
        }
        const entry = {
            id: generateId(),
            source: source.trim(),
            target: target.trim()
        };
        terms.push(entry);
        this.save(terms);
        return entry;
    }
    update(id, source, target) {
        const terms = this.getAll();
        const idx = terms.findIndex(t => t.id === id);
        if (idx === -1)
            return undefined;
        terms[idx] = { id, source: source.trim(), target: target.trim() };
        this.save(terms);
        return terms[idx];
    }
    delete(id) {
        const terms = this.getAll();
        const idx = terms.findIndex(t => t.id === id);
        if (idx === -1)
            return false;
        terms.splice(idx, 1);
        this.save(terms);
        return true;
    }
    clear() {
        this.context.globalState.update(GLOSSARY_KEY, []);
    }
    /**
     * Apply glossary to text — replace known terms with translations
     */
    applyToText(text) {
        const terms = this.getAll();
        const found = [];
        for (const term of terms) {
            if (text.toLowerCase().includes(term.source.toLowerCase())) {
                found.push({ source: term.source, target: term.target });
            }
        }
        return found;
    }
    save(terms) {
        this.context.globalState.update(GLOSSARY_KEY, terms);
    }
}
exports.GlossaryService = GlossaryService;
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
//# sourceMappingURL=glossaryService.js.map