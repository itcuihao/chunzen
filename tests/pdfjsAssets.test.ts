/**
 * PDF.js 的运行时来源必须与 devDependency 同源。
 *
 * 历史问题：PDF.js 不从 node_modules 加载，而是硬编码 CDN URL 指向 3.11.174，
 * 于是「npm 里的版本」「CDN 上的版本」「快照的基准版本」三处手工同步。任一处
 * 漂移都不会报错——最坏情况是跨 major 升级后 constructPath 语义变了，表格横线
 * 静默消失（见 pathDecode.ts）。
 *
 * 现在 PDF.js 由 webpack 从 node_modules 拷进 dist/pdfjs/，版本唯一来源是
 * lockfile。这组测试锁死该不变量。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const ROOT = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
  dependencies?: Record<string, string>;
};

/** 取 pdfjs-dist 的版本；这里只关心「有且只有一个来源」 */
function declaredPdfjsVersion(): string {
  const fromDev = pkg.devDependencies?.['pdfjs-dist'];
  const fromProd = pkg.dependencies?.['pdfjs-dist'];
  const versions = [fromDev, fromProd].filter(Boolean) as string[];
  assert.equal(versions.length, 1, 'pdfjs-dist 应当只在一个依赖段落里声明');
  return versions[0];
}

describe('PDF.js 版本一致性', () => {
  test('devDependency 是精确版本而非范围', () => {
    // 范围（^3.11.174）会让 npm ci 装到别的版本，而 dist/pdfjs/ 是构建时拷的，
    // 两者漂移会把「线上实际加载的 PDF.js」和「测试验证的 PDF.js」分开。
    const v = declaredPdfjsVersion();
    assert.match(v, /^\d+\.\d+\.\d+$/, `pdfjs-dist 应固定到精确版本，实际为 ${v}`);
  });

  test('已安装的 pdfjs-dist 与声明的一致', () => {
    const installed = join(ROOT, 'node_modules/pdfjs-dist/package.json');
    if (!existsSync(installed)) return; // 未装依赖时跳过（如纯 lint 环境）
    const actual = JSON.parse(readFileSync(installed, 'utf8')).version as string;
    assert.equal(actual, declaredPdfjsVersion(), '装到本地的 pdfjs-dist 版本与 package.json 不一致，请 npm ci');
  });

  test('分发的 PDF.js 产物与声明的版本一致', () => {
    const main = join(ROOT, 'dist/pdfjs/pdf.min.js');
    if (!existsSync(main)) return; // 未构建时跳过
    const expected = declaredPdfjsVersion();
    for (const file of ['pdf.min.js', 'pdf.worker.min.js']) {
      const code = readFileSync(join(ROOT, 'dist/pdfjs', file), 'utf8');
      assert.ok(code.includes(expected), `dist/pdfjs/${file} 不包含版本 ${expected}，可能是构建产物过期`);
    }
  });
});

describe('不再从 CDN 加载', () => {
  const sources = ['src/pdfEditor/PdfEditorProvider.ts', 'webpack.config.js'];

  for (const rel of sources) {
    test(`${rel} 不含外部 CDN 地址`, () => {
      const code = readFileSync(join(ROOT, rel), 'utf8');
      assert.ok(!/cdnjs\.cloudflare\.com/.test(code), `${rel} 仍然引用 cdnjs，PDF.js 应随扩展分发`);
      assert.ok(!/ajax\.cloudflare/.test(code), `${rel} 仍然引用 cloudflare ajax`);
    });
  }

  test('webview 的 CSP 不信任任何外部脚本域名', () => {
    const code = readFileSync(join(ROOT, 'src/pdfEditor/PdfEditorProvider.ts'), 'utf8');
    const csp = /content="default-src 'none';([\s\S]*?)">/.exec(code)?.[1] ?? '';
    assert.ok(csp, '未找到 CSP 声明');
    const scriptSrc = /script-src([^;]*);/.exec(csp)?.[1] ?? '';
    // 只应是 nonce 与 webview 自身的源
    assert.ok(!scriptSrc.includes('https://'), `script-src 仍允许外部域名：${scriptSrc.trim()}`);
  });

  test('worker 与字体服从 webview 自身的源', () => {
    const code = readFileSync(join(ROOT, 'src/pdfEditor/PdfEditorProvider.ts'), 'utf8');
    for (const directive of ['worker-src', 'font-src']) {
      const value = new RegExp(`${directive}([^;]*);`).exec(code)?.[1] ?? '';
      assert.ok(value.includes('cspSource'), `${directive} 未包含 cspSource：${value.trim()}`);
    }
  });
});

describe('分发产物可用', () => {
  test('pdf.min.js 是可加载的 UMD，且暴露引擎所需成员', () => {
    const file = join(ROOT, 'dist/pdfjs/pdf.min.js');
    if (!existsSync(file)) return; // 未构建时跳过
    // UMD 在无 module 的环境下会挂到 globalThis.pdfjsLib；在 CJS 里走 module.exports
    const lib = require(file) as Record<string, unknown>;
    for (const member of ['getDocument', 'Util', 'OPS', 'GlobalWorkerOptions', 'version']) {
      assert.ok(member in lib, `pdf.min.js 缺少 ${member}`);
    }
    assert.equal(lib.version, declaredPdfjsVersion());
  });

  test('pdf.worker.min.js 是自包含脚本', () => {
    const file = join(ROOT, 'dist/pdfjs/pdf.worker.min.js');
    if (!existsSync(file)) return;
    const code = readFileSync(file, 'utf8');
    assert.ok(code.includes('WorkerMessageHandler'), 'worker 产物不完整');
    // 不应当在 worker 里再次拉取主库或其它脚本
    assert.ok(!/cdnjs\.cloudflare\.com/.test(code), 'worker 仍然引用 CDN');
  });

  test('CJK 字符映射表与标准字体随包分发', () => {
    const cmaps = join(ROOT, 'dist/pdfjs/cmaps');
    const fonts = join(ROOT, 'dist/pdfjs/standard_fonts');
    if (!existsSync(cmaps)) return;
    // 缺失这些文件时中文 PDF 会抽不出字形，且只在渲染时静默失败
    assert.ok(existsSync(join(cmaps, 'UniGB-UCS2-H.bcmap')), '缺少中文 cmap');
    assert.ok(existsSync(join(fonts, 'FoxitFixed.pfb')), '缺少标准字体');
  });
});
