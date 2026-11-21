/**
 * webview 首帧不能被外部字体阻塞。
 *
 * 起因：`pdfViewer.css` 与 `panel.css` 第一行都是
 *   @import url('https://fonts.googleapis.com/css2?family=Inter...');
 * CSS 的 @import 是阻塞式的 —— 浏览器要等这个响应回来才继续解析样式表，
 * 连带首帧渲染一起等。在本机实测同一份 PDF：
 *
 *   放行 @import（真实 CSP）：首屏 1482 / 1568 / 1767 ms
 *   改成非阻塞 link      ：首屏  265 /  269 /  274 ms
 *
 * 也就是说打开 PDF 的那一两秒全花在一个字体上，而 Google Fonts 在国内
 * 尤其慢（实测单个请求 1.1–2.4s，断网时等到超时）。PDF 渲染本身只要
 * ~250ms（11MB 的 jem 也一样），所以这不是"PDF.js 打包进扩展变卡了"。
 *
 * 修法：字体与 KaTeX 改用 media="print" 的 <link>，它不参与渲染阻塞，
 * 下载完后由带 nonce 的脚本切回 all。不能用 onload="this.media='all'"
 * ——两个 provider 的 CSP script-src 都没有 'unsafe-inline'，内联事件
 * 处理器会被直接拦掉（这条也有断言）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CSS_FILES = [
  'src/webviews/pdfViewer/styles/pdfViewer.css',
  'src/webviews/sidePanel/styles/panel.css',
];

test('样式表不再用阻塞式 @import 拉外部字体', () => {
  for (const rel of CSS_FILES) {
    const css = read(rel);
    assert.ok(!/@import\s+url\(\s*['"]?https?:/i.test(css), `${rel} 仍用 @import 拉外部资源`);
  }
});

test('字体与 KaTeX 走 media="print" 的非阻塞 link', () => {
  const pdf = read('src/pdfEditor/PdfEditorProvider.ts');
  const panel = read('src/sidePanel/SidePanelProvider.ts');

  // PDF 阅读器：Inter
  assert.match(pdf, /id="font-link"[^>]*media="print"/s);
  // 侧栏：Inter + KaTeX
  assert.match(panel, /id="font-link"[^>]*media="print"/s);
  assert.match(panel, /id="katex-link"[^>]*media="print"/s);

  // 绝不能给它们加回阻塞式加载（preconnect 不算，它不阻塞渲染）
  for (const [name, src] of [['PdfEditorProvider', pdf], ['SidePanelProvider', panel]] as const) {
    const blocking = [...src.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => /rel="stylesheet"/.test(tag))
      .filter((tag) => /fonts\.googleapis\.com|katex\.min\.css/.test(tag))
      .filter((tag) => !/media="print"/.test(tag));
    assert.deepEqual(blocking, [], `${name} 仍有阻塞式外部样式表`);
  }
});

test('切 media 靠带 nonce 的脚本，不能靠内联 onload', () => {
  // CSP: script-src 'nonce-...' —— 没有 'unsafe-inline'，onload= 会被拦。
  for (const rel of ['src/pdfEditor/PdfEditorProvider.ts', 'src/sidePanel/SidePanelProvider.ts']) {
    const src = read(rel);
    assert.ok(!/\sonload=|this\.media='all'/.test(src), `${rel} 用了内联事件处理器`);
    assert.match(src, /addEventListener\('load'/, `${rel} 应在 load 事件里切 media`);
  }
});

test('字体栈有本地回退，拿不到字体也不会退化成衬线体', () => {
  const css = read('src/webviews/pdfViewer/styles/pdfViewer.css');
  const decl = css.match(/font-family:\s*'Inter',([^;]+);/);
  assert.ok(decl, '未找到 Inter 字体栈');
  const stack = decl![1];
  for (const fallback of ['sans-serif']) {
    assert.ok(stack.includes(fallback), `字体栈缺少 ${fallback} 回退`);
  }
  assert.ok(/-apple-system|system-ui|Segoe UI/.test(stack), '字体栈缺少系统字体回退');
});
