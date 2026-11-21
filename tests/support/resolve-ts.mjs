// 让 node --test 能解析源码里不带扩展名的相对 import（webpack/tsc 风格），
// 并把仅存在于 VSCode 运行时的模块映射到 tests/support/stubs 下的桩。
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const supportDir = new URL('./', import.meta.url).href;
const stubs = {
  vscode: 'vscode.mjs',
  'node-fetch': 'node-fetch.mjs',
  'http-proxy-agent': 'proxy-agent.mjs',
  'https-proxy-agent': 'proxy-agent.mjs'
};

// data: URL 里没有 import.meta.url，把已解析好的绝对路径注入进去
const source = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUPPORT_DIR = ${JSON.stringify(supportDir)};
const STUBS = ${JSON.stringify(stubs)};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) {
    return next(new URL(stub, SUPPORT_DIR + 'stubs/').href, context);
  }
  if (specifier.startsWith('.') && !/\\\\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '/index.ts']) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
  }
  return next(specifier, context);
}
`;

register('data:text/javascript,' + encodeURIComponent(source));
