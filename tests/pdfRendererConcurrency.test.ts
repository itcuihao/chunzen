import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPageText, renderPageToCanvas, type PdfPage } from '../src/webviews/pdfViewer/pdfRenderer.ts';

describe('pdfRenderer 并发渲染与后台跳过矢量规则', () => {
  it('同一 canvas 并发调用 renderPageToCanvas 时会取消前一次并等待其结束后再绘制', async () => {
    const events: string[] = [];
    let cancelFirst!: () => void;
    let resolveFirstSettled!: () => void;

    const firstDone = new Promise<void>(resolve => {
      resolveFirstSettled = resolve;
    });

    const fakePage: PdfPage = {
      getViewport({ scale }) {
        return { width: 600 * scale, height: 800 * scale, scale, transform: [scale, 0, 0, -scale, 0, 800 * scale] };
      },
      async getTextContent() {
        return { items: [] };
      },
      async getOperatorList() {
        return { fnArray: [], argsArray: [] };
      },
      render() {
        const callIndex = events.filter(e => e.startsWith('render:')).length + 1;
        events.push(`render:${callIndex}`);
        if (callIndex === 1) {
          return {
            promise: new Promise<void>((_, reject) => {
              cancelFirst = () => {
                events.push('cancel:1');
                setTimeout(() => {
                  events.push('settled:1');
                  resolveFirstSettled();
                  const err = new Error('cancelled');
                  err.name = 'RenderingCancelledException';
                  reject(err);
                }, 15);
              };
            }),
            cancel() {
              cancelFirst();
            }
          };
        }
        return {
          promise: firstDone.then(() => {
            events.push('done:2');
          }),
          cancel() {}
        };
      }
    };

    // Minimal browser globals for renderPageToCanvas
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = { devicePixelRatio: 2 };
    const fakeCanvas = {
      width: 0,
      height: 0,
      style: { width: '', height: '' },
      getContext() {
        return {};
      }
    } as unknown as HTMLCanvasElement;

    try {
      const p1 = renderPageToCanvas(fakePage, fakeCanvas, 1.0);
      const p2 = renderPageToCanvas(fakePage, fakeCanvas, 1.5);
      await Promise.all([p1, p2]);

      assert.deepEqual(events, ['render:1', 'cancel:1', 'settled:1', 'render:2', 'done:2']);
      assert.equal(fakeCanvas.width, 1800);
      assert.equal(fakeCanvas.height, 2400);
    } finally {
      (globalThis as Record<string, unknown>).window = prevWindow;
    }
  });

  it('getPageText({ skipRules: true }) 跳过 getOperatorList 并标记 rulesExtracted=false', async () => {
    let operatorListCalls = 0;
    const fakePage: PdfPage = {
      getViewport({ scale }) {
        return { width: 600 * scale, height: 800 * scale, scale, transform: [scale, 0, 0, -scale, 0, 800 * scale] };
      },
      async getTextContent() {
        return {
          items: [
            { str: 'Hello world', width: 50, height: 12, transform: [12, 0, 0, 12, 72, 700], fontName: 'g_d0_f1' }
          ]
        };
      },
      async getOperatorList() {
        operatorListCalls += 1;
        return { fnArray: [], argsArray: [] };
      },
      render() {
        return { promise: Promise.resolve(), cancel() {} };
      }
    };

    const prevPdfjs = (globalThis as Record<string, unknown>).pdfjsLib;
    (globalThis as Record<string, unknown>).pdfjsLib = { OPS: {} };
    try {
      const skipped = await getPageText(fakePage, undefined, { skipRules: true });
      assert.equal(operatorListCalls, 0);
      assert.equal(skipped.rulesExtracted, false);
      assert.deepEqual(skipped.horizontalRules, []);
      assert.equal(skipped.items.length, 1);

      const full = await getPageText(fakePage);
      assert.equal(operatorListCalls, 1);
      assert.equal(full.rulesExtracted, true);
    } finally {
      (globalThis as Record<string, unknown>).pdfjsLib = prevPdfjs;
    }
  });
});
