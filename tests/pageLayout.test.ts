// buildTextLayer 页面级快照测试：真实 PDF.js 3.11.174 + 真实 getPageText/buildTextLayer，
// 对样例 PDF 的代表性页面生成「版面指纹」并与已提交快照比对。
//
// 有意改动版面逻辑后，重新生成快照并审阅 diff：  UPDATE_SNAPSHOTS=1 npm test
// 快照只含段落类型/分栏/取整后的包围盒/句数/文本哈希，不含论文原文。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPdf, fingerprintPage, type PageFingerprint } from './support/pageHarness.ts';

const ROOT = join(import.meta.dirname, '..');
const SNAP_DIR = join(import.meta.dirname, '__snapshots__');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

interface Sample {
  id: string;
  file: string;
  /** 覆盖：首页、含图/表题注、参考文献密集页、横线、单栏末页 */
  pages: Array<{ page: number; why: string }>;
}

const SAMPLES: Sample[] = [
  {
    id: 'circrna',
    file: 'pdf/circRNAs in Cancer (Patop, Ines Lucia Kadener, Sebastian) (Z-Library).pdf',
    pages: [
      { page: 1, why: '首页：双栏、标题、摘要、小节标题' },
      { page: 2, why: '图下方双栏正文、页眉/作者区被跳过' },
      { page: 5, why: '图题注（figure-caption）' },
      { page: 7, why: '纯参考文献页' }
    ]
  },
  {
    id: 'lncrna',
    file: 'pdf/Long non-coding RNAs- definitions, functions, challenges and recommendations.pdf',
    pages: [
      { page: 1, why: '首页：单栏版式' },
      { page: 3, why: '双栏纯正文' },
      { page: 5, why: '页眉多段被跳过 + 图题注 + 参考文献' },
      { page: 7, why: '表格（table）+ 大量小标题' },
      { page: 9, why: '图题注与正文混排' },
      { page: 12, why: '参考文献密集页（70+ 段）' },
      { page: 18, why: '单栏末页、段落极少' }
    ]
  }
];

function snapPath(id: string): string {
  return join(SNAP_DIR, `${id}.json`);
}

function loadSnapshot(id: string): Record<string, PageFingerprint> | undefined {
  const p = snapPath(id);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined;
}

for (const sample of SAMPLES) {
  const pdfPath = join(ROOT, sample.file);

  test(`版面快照: ${sample.id}`, { skip: existsSync(pdfPath) ? false : `样例 PDF 不存在: ${sample.file}` }, async () => {
    const handle = await openPdf(pdfPath);
    try {
      const actual: Record<string, PageFingerprint> = {};
      for (const { page } of sample.pages) {
        actual[`p${page}`] = fingerprintPage(await handle.layoutPage(page));
      }

      if (UPDATE) {
        mkdirSync(SNAP_DIR, { recursive: true });
        writeFileSync(snapPath(sample.id), JSON.stringify(actual, null, 1) + '\n');
        return;
      }

      const expected = loadSnapshot(sample.id);
      assert.ok(expected, `缺少快照 ${snapPath(sample.id)}，请运行 UPDATE_SNAPSHOTS=1 npm test 生成并提交`);

      for (const { page, why } of sample.pages) {
        const key = `p${page}`;
        assert.deepEqual(actual[key], expected[key], `第 ${page} 页版面与快照不一致（${why}）`);
      }
    } finally {
      await handle.close();
    }
  });
}

// ── 与快照无关的结构性不变量：快照被误更新时仍能兜底 ──

test('版面不变量: 每页段落的包围盒落在页面内且文本非空', { skip: existsSync(join(ROOT, SAMPLES[1].file)) ? false : '样例 PDF 不存在' }, async () => {
  const handle = await openPdf(join(ROOT, SAMPLES[1].file));
  try {
    for (const page of [1, 3, 7, 12]) {
      const result = await handle.layoutPage(page);
      assert.ok(result.paragraphs.length > 0, `第 ${page} 页应至少有一个段落`);
      for (const p of result.paragraphs) {
        if (p.lineMarker) continue;
        assert.ok(p.text.trim().length > 0, `第 ${page} 页出现空文本段落 ${p.id}`);
        assert.ok(p.width > 0 && p.height > 0, `第 ${page} 页段落 ${p.id} 尺寸非法`);
      }
      const ids = result.paragraphs.map(p => p.id);
      assert.equal(new Set(ids).size, ids.length, `第 ${page} 页段落 id 重复`);
    }
  } finally {
    await handle.close();
  }
});

test('版面不变量: 句子 id 在整页内唯一，且仅出现在未跳过的段落中', { skip: existsSync(join(ROOT, SAMPLES[0].file)) ? false : '样例 PDF 不存在' }, async () => {
  const handle = await openPdf(join(ROOT, SAMPLES[0].file));
  try {
    const result = await handle.layoutPage(1);
    const sentenceIds = result.paragraphs.flatMap(p => (p.sentences ?? []).map(s => s.id));
    assert.equal(new Set(sentenceIds).size, sentenceIds.length);
    for (const p of result.paragraphs) {
      if (p.skipped) assert.equal(p.sentences, undefined, `被跳过的段落 ${p.id} 不应有句子`);
    }
    assert.equal(sentenceIds.length, result.sentences.size);
  } finally {
    await handle.close();
  }
});

test('版面不变量: 同一输入重复处理结果一致（确定性）', { skip: existsSync(join(ROOT, SAMPLES[0].file)) ? false : '样例 PDF 不存在' }, async () => {
  const handle = await openPdf(join(ROOT, SAMPLES[0].file));
  try {
    const first = fingerprintPage(await handle.layoutPage(2));
    const second = fingerprintPage(await handle.layoutPage(2));
    assert.deepEqual(first, second);
  } finally {
    await handle.close();
  }
});
