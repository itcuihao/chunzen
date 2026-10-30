// 让 node --test 能解析源码里不带扩展名的相对 import（webpack/tsc 风格）
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '/index.ts']) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
  }
  return next(specifier, context);
}
`));
