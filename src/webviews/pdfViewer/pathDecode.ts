/**
 * PDF.js `constructPath` 参数的跨版本解码。
 *
 * 纯函数，不依赖 `pdfjsLib` 全局：算子编码表由调用方传入，方便单测直接构造两种版本的
 * 参数结构。`pdfRenderer.ts` 的 `extractHorizontalRules` 用它还原表格横线。
 *
 * 版本差异（实测 pdfjs-dist 3.11.174 vs 5.7.284，同一份 PDF 第 1 页）：
 *
 *   3.x   fnArray 里每个 constructPath 的 args = [ops[], data[], minMax]
 *         ops 是 OPS.moveTo/lineTo/... 组成的数组，data 是与 ops 对应的坐标扁平数组，
 *         游标跨子路径连续递增。绘制算子（stroke/fill）是紧随其后的独立条目。
 *
 *   4.x+  args = [op, data: [DrawOPS 扁平流], minMax]
 *         op 是单个 OPS 数值（20=stroke, 28=endPath, ...），每条路径单独一个
 *         constructPath，且**绘制算子合并进了 constructPath 自身**，后面不再跟
 *         stroke。DrawOPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3,
 *         closePath: 4 }，坐标紧跟算子。
 *
 * 只按 3.x 解析会让 4.x+ 的 ops 读成单个数字、data 读成嵌套数组，横线恒为空。
 */

export type PathLine = { x1: number; y1: number; x2: number; y2: number };
export type PathBox = { minX: number; minY: number; maxX: number; maxY: number };
export type PathRules = { lines: PathLine[]; boxes: PathBox[] };

/** 4.x+ 的 DrawOPS 编码，固定值，不随 OPS 变动 */
export const DRAW_OPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/** 3.x 使用的 OPS 子集，调用方从 pdfjsLib.OPS 取；测试里手工给 */
export interface LegacyOps {
  moveTo?: number;
  lineTo?: number;
  curveTo?: number;
  curveTo2?: number;
  curveTo3?: number;
  closePath?: number;
  rectangle?: number;
  rect?: number;
}

export function toNumberArray(input: unknown): number[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(Number).filter(Number.isFinite);
  if (ArrayBuffer.isView(input)) {
    return Array.from(input as unknown as ArrayLike<number>).map(Number).filter(Number.isFinite);
  }
  return [];
}

export function applyTransformPoint(x: number, y: number, m: number[]): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** 4.x+ 的参数形状：args[0] 是标量而非数组 */
export function isDrawOpsShape(args: unknown): boolean {
  if (!Array.isArray(args) || args.length < 2) return false;
  return !Array.isArray(args[0]) && !ArrayBuffer.isView(args[0]);
}

/**
 * @param args        constructPath 的 argsArray 条目
 * @param ctm         当前变换矩阵
 * @param viewport    视口变换
 * @param legacyOps   3.x 的 OPS 表（4.x+ 分支忽略）
 */
export function extractPathLines(
  args: unknown,
  ctm: number[],
  viewport: number[],
  legacyOps: LegacyOps = {}
): PathRules {
  const rules: PathRules = { lines: [], boxes: [] };
  const arr = Array.isArray(args) ? args : [];
  if (arr.length < 2) return rules;

  const minMax = toNumberArray(arr[2]);

  if (isDrawOpsShape(args)) {
    readDrawOpsPath(arr[1], ctm, viewport, rules);
  } else {
    readLegacyPath(arr[0], arr[1], ctm, viewport, legacyOps, rules);
  }

  if (minMax.length >= 4) {
    const [minX, minY, maxX, maxY] = minMax;
    const corners = [
      applyTransformPoint(minX, minY, ctm),
      applyTransformPoint(maxX, minY, ctm),
      applyTransformPoint(maxX, maxY, ctm),
      applyTransformPoint(minX, maxY, ctm),
    ].map(([px, py]) => applyTransformPoint(px, py, viewport));
    const xs = corners.map(([px]) => px);
    const ys = corners.map(([, py]) => py);
    rules.boxes.push({
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    });
  }

  return rules;
}

function readDrawOpsPath(raw: unknown, ctm: number[], viewport: number[], rules: PathRules): void {
  const flat = toNumberArray(Array.isArray(raw) && raw.length === 1 ? raw[0] : raw);
  if (flat.length < 3) return;

  const toScreen = (x: number, y: number): [number, number] => {
    const [px, py] = applyTransformPoint(x, y, ctm);
    return applyTransformPoint(px, py, viewport);
  };

  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let hasCurrentPoint = false;

  for (let i = 0; i < flat.length;) {
    const op = flat[i++];

    if (op === DRAW_OPS.moveTo) {
      if (i + 1 >= flat.length) break;
      cx = flat[i++];
      cy = flat[i++];
      sx = cx;
      sy = cy;
      hasCurrentPoint = true;
      continue;
    }

    if (op === DRAW_OPS.lineTo) {
      if (i + 1 >= flat.length || !hasCurrentPoint) break;
      const nx = flat[i++];
      const ny = flat[i++];
      const [vx1, vy1] = toScreen(cx, cy);
      const [vx2, vy2] = toScreen(nx, ny);
      rules.lines.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
      cx = nx;
      cy = ny;
      continue;
    }

    if (op === DRAW_OPS.curveTo) {
      if (i + 5 >= flat.length) break;
      i += 4;
      cx = flat[i++];
      cy = flat[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (op === DRAW_OPS.quadraticCurveTo) {
      if (i + 3 >= flat.length) break;
      i += 2;
      cx = flat[i++];
      cy = flat[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (op === DRAW_OPS.closePath) {
      if (hasCurrentPoint) {
        const [vx1, vy1] = toScreen(cx, cy);
        const [vx2, vy2] = toScreen(sx, sy);
        rules.lines.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
        cx = sx;
        cy = sy;
      }
      continue;
    }

    // 未知算子：无法确定其参数宽度，继续解码会错位，停止
    break;
  }
}

function readLegacyPath(
  rawOps: unknown,
  rawData: unknown,
  ctm: number[],
  viewport: number[],
  OPS: LegacyOps,
  rules: PathRules
): void {
  const ops = toNumberArray(rawOps);
  if (ops.length === 0) return;

  const directData = toNumberArray(rawData);
  const data = directData.length > 0
    ? directData
    : (Array.isArray(rawData) && rawData.length > 0 ? toNumberArray(rawData[0]) : []);

  const moveToCode = OPS.moveTo;
  const lineToCode = OPS.lineTo;
  const curveToCode = OPS.curveTo;
  const curveTo2Code = OPS.curveTo2;
  const curveTo3Code = OPS.curveTo3;
  const closePathCode = OPS.closePath;
  const rectCode = OPS.rect ?? OPS.rectangle;

  const toScreen = (x: number, y: number): [number, number] => {
    const [px, py] = applyTransformPoint(x, y, ctm);
    return applyTransformPoint(px, py, viewport);
  };

  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let hasCurrentPoint = false;

  for (const op of ops) {
    if (moveToCode !== undefined && op === moveToCode) {
      if (i + 1 >= data.length) break;
      cx = data[i++];
      cy = data[i++];
      sx = cx;
      sy = cy;
      hasCurrentPoint = true;
      continue;
    }

    if (lineToCode !== undefined && op === lineToCode) {
      if (i + 1 >= data.length || !hasCurrentPoint) break;
      const nx = data[i++];
      const ny = data[i++];
      const [vx1, vy1] = toScreen(cx, cy);
      const [vx2, vy2] = toScreen(nx, ny);
      rules.lines.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
      cx = nx;
      cy = ny;
      continue;
    }

    if (rectCode !== undefined && op === rectCode) {
      if (i + 3 >= data.length) break;
      const x = data[i++];
      const y = data[i++];
      const w = data[i++];
      const h = data[i++];
      const corners = [
        applyTransformPoint(x, y, ctm),
        applyTransformPoint(x + w, y, ctm),
        applyTransformPoint(x + w, y + h, ctm),
        applyTransformPoint(x, y + h, ctm),
      ].map(([px, py]) => applyTransformPoint(px, py, viewport));
      const xs = corners.map(([px]) => px);
      const ys = corners.map(([, py]) => py);
      rules.boxes.push({
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      });
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      hasCurrentPoint = true;
      continue;
    }

    if (curveToCode !== undefined && op === curveToCode) {
      if (i + 5 >= data.length) break;
      i += 4;
      cx = data[i++];
      cy = data[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (curveTo2Code !== undefined && op === curveTo2Code) {
      if (i + 3 >= data.length) break;
      i += 2;
      cx = data[i++];
      cy = data[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (curveTo3Code !== undefined && op === curveTo3Code) {
      if (i + 3 >= data.length) break;
      i += 2;
      cx = data[i++];
      cy = data[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (closePathCode !== undefined && op === closePathCode) {
      if (hasCurrentPoint) {
        const [vx1, vy1] = toScreen(cx, cy);
        const [vx2, vy2] = toScreen(sx, sy);
        rules.lines.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
        cx = sx;
        cy = sy;
      }
      continue;
    }
  }
}
