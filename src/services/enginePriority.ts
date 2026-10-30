/**
 * 规范化用户配置的引擎优先级：
 * 去掉非字符串/重复/未知引擎，并把用户配置中缺失的已知引擎按默认顺序追加到末尾，
 * 这样新增引擎后，已保存过旧优先级配置的用户也能看到并使用它。
 */
export function normalizePriority(configured: unknown, known: readonly string[]): string[] {
  const result: string[] = [];
  const knownSet = new Set(known);
  if (Array.isArray(configured)) {
    for (const name of configured) {
      if (typeof name === 'string' && knownSet.has(name) && !result.includes(name)) {
        result.push(name);
      }
    }
  }
  for (const name of known) {
    if (!result.includes(name)) result.push(name);
  }
  return result;
}
