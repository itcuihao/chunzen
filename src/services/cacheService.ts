import * as vscode from 'vscode';

/**
 * LRU 缓存服务 — 内存 + 磁盘持久化
 */
export class CacheService {
  private cache: Map<string, { value: string; timestamp: number }> = new Map();
  private persistPath: vscode.Uri;

  constructor(context: vscode.ExtensionContext) {
    this.persistPath = vscode.Uri.joinPath(
      context.globalStorageUri,
      'translation-cache.json'
    );
    this.loadFromDisk();
  }

  get maxCacheSize(): number {
    return vscode.workspace
      .getConfiguration('chunzen')
      .get<number>('cache.maxSize', 500);
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // LRU：重新插入放到末尾
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxCacheSize) {
      // 删除最旧的条目
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
    this.saveToDisk();
  }

  clear(): void {
    this.cache.clear();
    this.saveToDisk();
  }

  get size(): number {
    return this.cache.size;
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await vscode.workspace.fs.readFile(this.persistPath);
      const json = JSON.parse(Buffer.from(data).toString('utf-8'));
      if (Array.isArray(json)) {
        for (const [k, v] of json) {
          this.cache.set(k, v);
        }
      }
    } catch {
      // 文件不存在或解析失败，忽略
    }
  }

  private saveToDiskDebounced = debounce(async () => {
    try {
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.joinPath(this.persistPath, '..')
      );
      const json = JSON.stringify([...this.cache.entries()]);
      await vscode.workspace.fs.writeFile(
        this.persistPath,
        Buffer.from(json, 'utf-8')
      );
    } catch {
      // 写入失败忽略
    }
  }, 2000);

  private saveToDisk(): void {
    this.saveToDiskDebounced();
  }
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
