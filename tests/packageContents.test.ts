/**
 * vsix 里应当装什么、不应当装什么。
 *
 * 历史问题：.vscodeignore 里写的是 `test/**`，而测试夹具目录实际叫 `tests/`，
 * 于是 26 个测试文件（含 76KB 版面快照）静默进了包。这不会让任何测试失败——
 * 只是每次装机多传几十 KB，且把开发期的坐标数据暴露给最终用户。
 *
 * 仓库里恰好同时存在 `test/`（6MB 截图，本就该排除）与 `tests/`（单测），
 * 两者名字只差一个 s，所以规则必须逐条列出、不能靠匹配凑。
 *
 * 这组测试锁死 .vscodeignore 的边界：不该进包的东西，必须有对应规则。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

/** 读取 .vscodeignore 的非空、非注释行 */
function ignoreRules(): string[] {
  return readFileSync(join(ROOT, '.vscodeignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** 某条规则是否覆盖给定路径（仅支持 tests 用到的这几种形态） */
function covers(rules: string[], target: string): boolean {
  return rules.some((rule) => {
    if (rule.startsWith('!')) return false; // 否定规则不构成排除
    // `dir/**` 或 `dir/` 覆盖其下所有内容；也接受精确路径
    const base = rule.replace(/\/\*\*$/, '/').replace(/\/$/, '');
    return target === base || target.startsWith(`${base}/`);
  });
}

describe('.vscodeignore 覆盖开发期目录', () => {
  // 这些目录若漏排，只会让 vsix 变大，没有任何测试会失败
  const devOnly = [
    { path: 'tests', why: '单测与版面快照，用户不需要' },
    { path: 'test', why: '开发期截图，6MB' },
    { path: 'src', why: 'TypeScript 源码，已由 webpack 打包' },
    { path: 'node_modules', why: '依赖已打包进 dist' },
    { path: 'scripts', why: '构建脚本，但 layout_endpoint.py 例外' },
    { path: 'out', why: 'tsc 增量产物' },
  ];

  for (const { path, why } of devOnly) {
    test(`${path}/ 被排除（${why}）`, () => {
      if (!existsSync(join(ROOT, path))) return; // 目录不存在则规则无意义
      assert.ok(covers(ignoreRules(), path), `.vscodeignore 未排除 ${path}/：${why}`);
    });
  }

  test('规则用的是真实目录名而非近似名', () => {
    // 曾经的 bug：写了 test/** 却以为在排除 tests/**
    const rules = ignoreRules();
    for (const dir of ['test', 'tests']) {
      if (!existsSync(join(ROOT, dir))) continue;
      assert.ok(covers(rules, dir), `仓库存在 ${dir}/，但 .vscodeignore 没有对应规则`);
    }
  });

  test('.vscode-test 的排除规则不被误伤', () => {
    // 改 test/** 时曾把 .vscode-test/** 连坐成 .vscode-tests/**，
    // 结果 .vscode-test 若存在就会进包（集成测试的下载缓存，几十 MB）
    const rules = ignoreRules();
    assert.ok(rules.includes('.vscode-test/**'), '.vscode-test/** 规则丢失或被改写');
  });
});

describe('运行期必需资源不被排除', () => {
  test('dist/ 不在排除列表里', () => {
    const rules = ignoreRules();
    assert.ok(!covers(rules, join('dist', 'extension.js')), 'dist/ 被排除了，扩展将无法加载');
    assert.ok(!covers(rules, join('dist', 'pdfjs', 'pdf.min.js')), 'dist/pdfjs/ 被排除了，PDF.js 将 404');
  });

  test('package.json 与 media/ 不在排除列表里', () => {
    const rules = ignoreRules();
    assert.ok(!covers(rules, 'package.json'), 'package.json 被排除，vsce 无法读取清单');
    // media 里只有部分截图被排除，图标必须保留
    assert.ok(!covers(rules, join('media', 'icon.png')), 'media/icon.png 被排除，扩展将无图标');
  });

  test('pdf/ 样例文档不进包', () => {
    // 这些是版面快照的输入，体积不小
    if (!existsSync(join(ROOT, 'pdf'))) return;
    const size = statSync(join(ROOT, 'pdf')).size;
    assert.ok(size > 0);
    assert.ok(covers(ignoreRules(), 'pdf'), '.vscodeignore 未排除 pdf/');
  });
});

test('dist/ 是构建产物，不能有文件被 git 跟踪', () => {
  // dist/pdfViewer.css 与 dist/panel.js.LICENSE.txt 曾被历史误提交：它们被
  // .gitignore 忽略却又在索引里，于是每次 npm run compile 都让工作区变脏，
  // 还会混进无关提交的 diff。构建产物应当只由 CI/本地构建生成。
  const out = execSync('git ls-files dist/', { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(out, '', `dist/ 下仍有被跟踪文件:\n${out}`);
});
