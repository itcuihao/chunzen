"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const vscode = __importStar(require("vscode"));
/**
 * LRU 缓存服务 — 内存 + 磁盘持久化
 */
class CacheService {
    cache = new Map();
    maxSize;
    persistPath;
    constructor(context) {
        this.maxSize = vscode.workspace
            .getConfiguration('chunzen')
            .get('cache.maxSize', 500);
        this.persistPath = vscode.Uri.joinPath(context.globalStorageUri, 'translation-cache.json');
        this.loadFromDisk();
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        // LRU：重新插入放到末尾
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        else if (this.cache.size >= this.maxSize) {
            // 删除最旧的条目
            const firstKey = this.cache.keys().next().value;
            if (firstKey)
                this.cache.delete(firstKey);
        }
        this.cache.set(key, { value, timestamp: Date.now() });
        this.saveToDisk();
    }
    clear() {
        this.cache.clear();
        this.saveToDisk();
    }
    get size() {
        return this.cache.size;
    }
    async loadFromDisk() {
        try {
            const data = await vscode.workspace.fs.readFile(this.persistPath);
            const json = JSON.parse(Buffer.from(data).toString('utf-8'));
            if (Array.isArray(json)) {
                for (const [k, v] of json) {
                    this.cache.set(k, v);
                }
            }
        }
        catch {
            // 文件不存在或解析失败，忽略
        }
    }
    saveToDiskDebounced = debounce(async () => {
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.persistPath, '..'));
            const json = JSON.stringify([...this.cache.entries()]);
            await vscode.workspace.fs.writeFile(this.persistPath, Buffer.from(json, 'utf-8'));
        }
        catch {
            // 写入失败忽略
        }
    }, 2000);
    saveToDisk() {
        this.saveToDiskDebounced();
    }
}
exports.CacheService = CacheService;
function debounce(fn, ms) {
    let timer;
    return ((...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    });
}
//# sourceMappingURL=cacheService.js.map