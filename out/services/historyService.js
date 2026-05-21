"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryService = void 0;
const HISTORY_KEY = 'chunzen.history';
const MAX_HISTORY = 100;
/**
 * 翻译历史服务 — LRU，持久化到 extension globalState
 */
class HistoryService {
    context;
    constructor(context) {
        this.context = context;
    }
    getAll() {
        return this.context.globalState.get(HISTORY_KEY, []);
    }
    add(original, translated, engine) {
        const history = this.getAll();
        history.unshift({ original, translated, engine, timestamp: Date.now() });
        if (history.length > MAX_HISTORY) {
            history.length = MAX_HISTORY;
        }
        this.save(history);
    }
    clear() {
        this.context.globalState.update(HISTORY_KEY, []);
    }
    save(history) {
        this.context.globalState.update(HISTORY_KEY, history);
    }
}
exports.HistoryService = HistoryService;
//# sourceMappingURL=historyService.js.map