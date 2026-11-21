/**
 * PDF.js 的唯一运行时来源。
 *
 * PDF.js 是 UMD 构建，由 `PdfEditorProvider` 以 `<script src>` 注入 `pdfjsLib` 全局，
 * 不从源码 import——这样：
 *   - 运行时与测试注入的是同一份 API 表面（测试用 legacy 构建，Node 里必须如此）；
 *   - 不需要把 1MB 的 UMD 过一遍 webpack，避免 chunk/CJS 互操作问题。
 *
 * 用惰性取值而不是模块级常量：脚本在 `dist/pdfViewer.js` 之前加载，但测试里
 * `globalThis.pdfjsLib` 是在 harness 里稍后才写入的。
 */

/** `pdfRenderer.ts` / `textLayer.ts` 实际用到的成员 */
export interface PdfJsRuntime {
  getDocument(config: {
    url: string;
    cMapUrl?: string;
    cMapPacked?: boolean;
    standardFontDataUrl?: string;
  }): { promise: Promise<any> };
  Util: { transform(a: number[], b: number[]): number[] };
  OPS?: Record<string, number>;
  GlobalWorkerOptions: { workerSrc: string };
}

let cached: PdfJsRuntime | undefined;

export function pdfjs(): PdfJsRuntime {
  if (!cached) {
    const injected = (globalThis as { pdfjsLib?: PdfJsRuntime }).pdfjsLib;
    if (!injected) {
      throw new Error('PDF.js 未加载：PdfEditorProvider 应在 dist/pdfViewer.js 之前注入 pdfjsLib');
    }
    cached = injected;
  }
  return cached;
}
