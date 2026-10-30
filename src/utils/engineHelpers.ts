/** 按 `a.b.c` 路径从对象中取值 */
export function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur && typeof cur === 'object') {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * 渲染自定义接口的请求体模板：把所有 `{{text}}` 替换为 JSON 转义后的文本。
 * 使用函数替换，避免文本中的 `$&` 等被当作替换模式。
 */
export function renderBodyTemplate(template: string, text: string): string {
  const escaped = JSON.stringify(text).slice(1, -1);
  return template.split('{{text}}').join(escaped);
}
