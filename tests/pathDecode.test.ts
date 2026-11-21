/**
 * constructPath 参数的跨版本解码。
 *
 * PDF.js 4.x 改了 constructPath 的参数结构（见 pathDecode.ts 顶部注释），旧解析器
 * 在 5.x 上会静默返回空横线。这里用两种真实形状的参数各跑一遍，锚定行为。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { extractPathLines, isDrawOpsShape, DRAW_OPS, toNumberArray } = await import(
  '../src/webviews/pdfViewer/pathDecode.ts'
);

const IDENTITY = [1, 0, 0, 1, 0, 0];
const SCALE_2 = [2, 0, 0, 2, 0, 0];

/** 3.x 的 OPS 常量（取自 pdfjs-dist 3.11.174） */
const OPS3 = {
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
};

describe('形状判定', () => {
  test('3.x：args[0] 是算子数组', () => {
    assert.equal(isDrawOpsShape([[OPS3.moveTo, OPS3.lineTo], [0, 0, 10, 0], [0, 0, 10, 0]]), false);
  });

  test('3.x：args[0] 是 Float32Array', () => {
    assert.equal(isDrawOpsShape([new Float32Array([13, 14]), new Float32Array([0, 0, 10, 0])]), false);
  });

  test('4.x+：args[0] 是标量算子', () => {
    assert.equal(isDrawOpsShape([20, [[DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 10, 0]], null]), true);
  });
});

describe('3.x 解码', () => {
  test('moveTo + lineTo 产出一条线', () => {
    const { lines, boxes } = extractPathLines(
      [[OPS3.moveTo, OPS3.lineTo], [0, 0, 100, 0], null],
      IDENTITY,
      IDENTITY,
      OPS3
    );
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0], { x1: 0, y1: 0, x2: 100, y2: 0 });
    assert.equal(boxes.length, 0);
  });

  test('一条 constructPath 内的多条子路径共享数据游标', () => {
    // moveTo(0,10) lineTo(100,10) moveTo(0,20) lineTo(100,20)
    const { lines } = extractPathLines(
      [
        [OPS3.moveTo, OPS3.lineTo, OPS3.moveTo, OPS3.lineTo],
        [0, 10, 100, 10, 0, 20, 100, 20],
        null
      ],
      IDENTITY,
      IDENTITY,
      OPS3
    );
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((l) => l.y1), [10, 20]);
  });

  test('rectangle 产出 box', () => {
    const { boxes } = extractPathLines(
      [[OPS3.rectangle], [10, 20, 100, 4], null],
      IDENTITY,
      IDENTITY,
      OPS3
    );
    assert.equal(boxes.length, 1);
    assert.deepEqual(boxes[0], { minX: 10, minY: 20, maxX: 110, maxY: 24 });
  });

  test('minMax 也产出 box', () => {
    const { boxes } = extractPathLines(
      [[OPS3.moveTo], [0, 0], [10, 20, 110, 24]],
      IDENTITY,
      IDENTITY,
      OPS3
    );
    assert.equal(boxes.length, 1);
    assert.deepEqual(boxes[0], { minX: 10, minY: 20, maxX: 110, maxY: 24 });
  });

  test('ctm 与 viewport 依次作用', () => {
    const { lines } = extractPathLines(
      [[OPS3.moveTo, OPS3.lineTo], [0, 0, 10, 0], null],
      [1, 0, 0, 1, 5, 7], // 平移
      SCALE_2,            // 再放大 2 倍
      OPS3
    );
    assert.deepEqual(lines[0], { x1: 10, y1: 14, x2: 30, y2: 14 });
  });
});

describe('4.x+ 解码（DrawOPS 扁平流）', () => {
  // 取自真实 PDF 的一条表格横线：moveTo(480.8, 685.5) lineTo(491.6, 685.5) ...
  const realFlat = [
    { x: 480.8009948730469, y: 685.5390014648438 },
    { x: 491.59600830078125, y: 685.5390014648438 },
    { x: 491.59600830078125, y: 695.0230102539062 },
    { x: 480.8009948730469, y: 695.0230102539062 },
  ];
  const flat = [
    DRAW_OPS.moveTo, realFlat[0].x, realFlat[0].y,
    DRAW_OPS.lineTo, realFlat[1].x, realFlat[1].y,
    DRAW_OPS.lineTo, realFlat[2].x, realFlat[2].y,
    DRAW_OPS.lineTo, realFlat[3].x, realFlat[3].y,
    DRAW_OPS.closePath,
  ];

  test('扁平流解析出四条边', () => {
    const { lines } = extractPathLines([28, [flat], null], IDENTITY, IDENTITY);
    assert.equal(lines.length, 4);
    assert.deepEqual(lines[0], {
      x1: 480.8009948730469,
      y1: 685.5390014648438,
      x2: 491.59600830078125,
      y2: 685.5390014648438
    });
  });

  test('Float32Array 承载的扁平流同样能解', () => {
    const { lines } = extractPathLines([28, [new Float32Array(flat)], null], IDENTITY, IDENTITY);
    assert.equal(lines.length, 4);
  });

  test('未包装的扁平流（data 直接是数组）也能解', () => {
    const { lines } = extractPathLines([28, flat, null], IDENTITY, IDENTITY);
    assert.equal(lines.length, 4);
  });

  test('op 为 endPath(28) 时仍返回几何（绘制由调用方决定）', () => {
    const { lines } = extractPathLines([28, [flat], null], IDENTITY, IDENTITY);
    assert.ok(lines.length > 0);
  });

  test('curveTo / quadraticCurveTo 跳过正确数量的坐标', () => {
    const withCurve = [
      DRAW_OPS.moveTo, 0, 0,
      DRAW_OPS.curveTo, 1, 1, 2, 2, 3, 3,       // 6 个坐标
      DRAW_OPS.quadraticCurveTo, 4, 4, 5, 5,     // 4 个坐标
      DRAW_OPS.lineTo, 10, 0,
    ];
    const { lines } = extractPathLines([20, [withCurve], null], IDENTITY, IDENTITY);
    // 当前点在 quadraticCurveTo 之后是 (5,5)，lineTo 从它画到 (10,0)
    assert.deepEqual(lines[0], { x1: 5, y1: 5, x2: 10, y2: 0 });
  });

  test('未知算子立即停止，不产生错位数据', () => {
    const dirty = [DRAW_OPS.moveTo, 0, 0, 99, 1, 2, 3, DRAW_OPS.lineTo, 10, 0];
    const { lines } = extractPathLines([20, [dirty], null], IDENTITY, IDENTITY);
    assert.equal(lines.length, 0);
  });

  test('数据被截断时不越界', () => {
    const truncated = [DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 10];
    const { lines } = extractPathLines([20, [truncated], null], IDENTITY, IDENTITY);
    assert.equal(lines.length, 0);
  });

  test('minMax 仍然产出 box', () => {
    const { boxes } = extractPathLines([20, [flat], [10, 20, 110, 24]], IDENTITY, IDENTITY);
    assert.equal(boxes.length, 1);
    assert.deepEqual(boxes[0], { minX: 10, minY: 20, maxX: 110, maxY: 24 });
  });
});

describe('健壮性', () => {
  const bad: unknown[] = [null, undefined, {}, [], [1], 'str', 42];

  for (const input of bad) {
    test(`畸形输入 ${JSON.stringify(input) ?? 'undefined'} 返回空结果`, () => {
      const r = extractPathLines(input, IDENTITY, IDENTITY);
      assert.deepEqual(r, { lines: [], boxes: [] });
    });
  }

  test('toNumberArray 过滤非有限数', () => {
    assert.deepEqual(toNumberArray([1, NaN, 2, Infinity, 3]), [1, 2, 3]);
    assert.deepEqual(toNumberArray(new Float32Array([1, 2])), [1, 2]);
    assert.deepEqual(toNumberArray(null), []);
  });
});
