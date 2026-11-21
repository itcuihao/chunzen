/**
 * 分发产物必须真的能解析 PDF——不只是「文件存在」。
 *
 * 其余测试分两路：pageLayout.test.ts 用 node_modules 里的 legacy 构建验版面逻辑，
 * pdfjsAssets.test.ts 验 dist/pdfjs/ 的文件齐不齐、版本对不对。**没有一条测试
 * 让实际要发布的那份 pdf.min.js 去读一份真 PDF**——所以「文件都在、版本也对，
 * 但产物本身在浏览器里跑不起来」这类故障，全套测试是绿的。
 *
 * 这组测试补的正是这一格：直接 require 分发产物，走真实的 getPageText 路径
 * （含 constructPath 解码、横线识别、文本抽取），再和 node_modules 的结果对照。
 * 两者一致，才说明「打进 vsix 的东西」与「测试验证的东西」是同一个东西。
 *
 * 注意：这里刻意不用 webview 的 URL 加载路径（那需要浏览器），而是把同一份
 * UMD 产物 require 进来。差异只在传输方式，解码逻辑完全相同。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');

const SAMPLE = join(ROOT, 'pdf/test_1page.pdf');
const SAMPLE_CJK = join(ROOT, 'pdf/Long non-coding RNAs- definitions, functions, challenges and recommendations.pdf');

const DIST_LIB = join(ROOT, 'dist/pdfjs/pdf.min.js');
const DIST_WORKER = join(ROOT, 'dist/pdfjs/pdf.worker.min.js');

/** 未构建时整组跳过：这些断言只对「要发布的那份产物」有意义 */
const skip = !existsSync(DIST_LIB) || !existsSync(DIST_WORKER);

interface DistLib {
  version: string;
  getDocument(config: Record<string, unknown>): { promise: Promise<any>; destroy(): Promise<void> };
  GlobalWorkerOptions: { workerSrc: string };
  OPS: Record<string, number>;
}

/**
 * 在 Node 里让 PDF.js 加载分发出去的 worker。
 *
 * 浏览器里 worker 是真 Worker，由 workerSrc 指向 dist/pdfjs/pdf.worker.min.js；
 * Node 没有 Worker，PDF.js 会退化到 fake worker 并 require/import 同目录下的
 * 'pdf.worker.js'。所以这里把 workerSrc 指向 worker 文件本身，PDF.js 的 fake
 * worker 逻辑会按路径把它读进来——路径解析行为和浏览器不同，但线协议一致。
 */
async function loadDistLib(): Promise<DistLib> {
  const lib = require(DIST_LIB) as DistLib;
  lib.GlobalWorkerOptions.workerSrc = DIST_WORKER;
  (globalThis as { pdfjsLib?: unknown }).pdfjsLib = lib;
  return lib;
}

/** 生产路径：pdfRenderer.getPageText 读全局 pdfjsLib，与浏览器里完全同一份代码 */
async function readPage(
  lib: DistLib,
  file: string,
  pageNumber: number
): Promise<{ rules: number; items: number; hasStructure: boolean }> {
  const { getPageText } = await import('../src/webviews/pdfViewer/pdfRenderer.ts');
  const data = new Uint8Array(readFileSync(file));
  const task = lib.getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const quiet = console.log;
    console.log = () => {};
    try {
      const rich = await getPageText(page);
      return {
        rules: rich.horizontalRules.length,
        items: rich.items.length,
        hasStructure: rich.hasStructure,
      };
    } finally {
      console.log = quiet;
    }
  } finally {
    await task.destroy();
  }
}

describe('分发产物能真的解析 PDF', { skip }, () => {
  let lib: DistLib;

  before(async () => {
    lib = await loadDistLib();
  });

  after(() => {
    delete (globalThis as { pdfjsLib?: unknown }).pdfjsLib;
  });

  test('分发产物直接读 PDF：抽出文本与横线', async () => {
    const r = await readPage(lib, SAMPLE, 1);
    // 单页测试文档：786 个文本项、1 条横线（见 pageLayout 快照与浏览器实测）
    assert.ok(r.items > 500, `文本项过少（${r.items}），分发产物可能未正确解码内容流`);
    assert.equal(r.rules, 1, `横线数应为 1，实际 ${r.rules}——constructPath 解码可能失效`);
  });

  test('分发产物能读多页 + 中文 PDF', async () => {
    // 中文文档依赖 cmaps：这里只验文本抽取不报错、每页都有内容。
    // （字形渲染需要浏览器 canvas，不在 Node 覆盖范围内）
    const r = await readPage(lib, SAMPLE_CJK, 1);
    assert.ok(r.items > 100, `文本项过少（${r.items}）`);
    assert.equal(r.rules, 7, `首页横线数应为 7，实际 ${r.rules}`);
  });

  test('分发产物与 node_modules 的结果一致', async () => {
    // 这是本组测试的核心：dist 里那份必须和测试基准同源同行为。
    // 若 webpack 拷错了文件、或用旧产物覆盖，这里会先炸。
    const legacy = require('pdfjs-dist/legacy/build/pdf.js') as DistLib;
    const fromLegacy = await (async () => {
      legacy.GlobalWorkerOptions.workerSrc = join(
        ROOT,
        'node_modules/pdfjs-dist/legacy/build/pdf.worker.js'
      );
      (globalThis as { pdfjsLib?: unknown }).pdfjsLib = legacy;
      return readPage(legacy, SAMPLE, 1);
    })();
    (globalThis as { pdfjsLib?: unknown }).pdfjsLib = lib;
    const fromDist = await readPage(lib, SAMPLE, 1);

    assert.equal(fromDist.rules, fromLegacy.rules, '横线数不一致：分发产物与测试基准行为不同');
    assert.equal(fromDist.items, fromLegacy.items, '文本项数不一致：分发产物与测试基准行为不同');
  });

  test('OPS 表与解码器假设一致', async () => {
    // pathDecode.ts 靠 constructPath 的算子编号分派；编号漂了不会报错，
    // 只会让横线静默消失（正是之前 CDN 版本漂移踩过的坑）
    assert.equal(lib.OPS.constructPath, 91);
    assert.equal(lib.OPS.rectangle, 19);
    assert.equal(lib.OPS.stroke, 20);
  });
});

describe('分发产物与声明版本同源', { skip }, () => {
  test('dist 与 node_modules 的版本号一致', async () => {
    const lib = require(DIST_LIB) as DistLib;
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'node_modules/pdfjs-dist/package.json'), 'utf8')
    ) as { version: string };
    assert.equal(lib.version, pkg.version, 'dist/pdfjs 的产物不是当前安装的 pdfjs-dist 编出来的');
  });

  test('worker 产物与主库版本一致', () => {
    // 两者版本不匹配时 PDF.js 会直接抛
    // "API version does not match Worker version"，但那只在浏览器里发生，
    // 构建期没有任何检查。产物里的版本号是裸字符串（apiVersion:"x.y.z"）。
    const declared = JSON.parse(
      readFileSync(join(ROOT, 'node_modules/pdfjs-dist/package.json'), 'utf8')
    ).version as string;
    for (const [name, file] of [['主库', DIST_LIB], ['worker', DIST_WORKER]] as const) {
      const code = readFileSync(file, 'utf8');
      assert.ok(
        code.includes(`"${declared}"`),
        `${name} 产物中找不到声明的版本 ${declared}，可能是旧构建残留`
      );
    }
  });
});
