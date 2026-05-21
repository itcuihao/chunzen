import * as vscode from 'vscode';
import * as path from 'path';
import { PdfViewerToExtMessage } from '../types/messages';
import { TranslationService } from '../services/translationService';
import { JournalService } from '../services/journalService';
import { SidePanelProvider } from '../sidePanel/SidePanelProvider';
import { HistoryService } from '../services/historyService';
import { getNonce } from '../utils/nonce';

/**
 * PDF 自定义编辑器 Provider
 * 处理 .pdf 文件的打开，渲染 PDF.js WebView
 */
export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'chunzen.pdfViewer';

  private translationService: TranslationService;
  private journalService: JournalService;
  private sidePanel: SidePanelProvider;
  private historyService: HistoryService;
  private context: vscode.ExtensionContext;

  // 每个文档对应的 WebView
  private webviews = new Map<string, vscode.WebviewPanel>();

  constructor(
    context: vscode.ExtensionContext,
    translationService: TranslationService,
    journalService: JournalService,
    sidePanel: SidePanelProvider,
    historyService: HistoryService
  ) {
    this.context = context;
    this.translationService = translationService;
    this.journalService = journalService;
    this.sidePanel = sidePanel;
    this.historyService = historyService;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const uri = document.uri;
    const key = uri.toString();
    this.webviews.set(key, webviewPanel);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.file(path.dirname(uri.fsPath))
      ]
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, uri);

    // 接收 WebView 消息
    webviewPanel.webview.onDidReceiveMessage(
      async (msg: PdfViewerToExtMessage) => {
        switch (msg.type) {
          case 'ready':
            // WebView 就绪，确保面板打开
            this.sidePanel.show();
            break;

          case 'sentence-hover':
            await this.handleSentenceHover(msg.text);
            break;

          case 'sentence-click':
            await this.handleSentenceHover(msg.text);
            break;

          case 'text-select':
            await this.handleSentenceHover(msg.text);
            break;

          case 'doi-found':
            await this.handleDoiFound(msg.doi, msg.issn, msg.journal);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    webviewPanel.onDidDispose(() => {
      this.webviews.delete(key);
    });
  }

  private async handleSentenceHover(text: string): Promise<void> {
    if (!text.trim() || text.trim().length < 5) return;

    this.sidePanel.show();
    this.sidePanel.showLoading('翻译中…');

    try {
      const result = await this.translationService.translate(text);
      this.sidePanel.updateTranslation(text, result.text, result.engine, result.cached);
      this.historyService.add(text, result.text, result.engine);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sidePanel.showError(msg);
    }
  }

  private async handleDoiFound(
    doi?: string,
    issn?: string,
    journal?: string
  ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('chunzen.journal');
    if (!cfg.get<boolean>('enabled', true)) return;

    const query = journal || issn || doi;
    if (!query) return;

    try {
      const info = await this.journalService.query(query);
      if (info) {
        if (doi) info.doi = doi;
        this.sidePanel.updateJournal(info);
      }
    } catch (err) {
      console.warn('期刊信息查询失败:', err);
    }
  }

  private getHtml(webview: vscode.Webview, pdfUri: vscode.Uri): string {
    const pdfSrc = webview.asWebviewUri(pdfUri);
    const viewerJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'pdfViewer.js')
    );
    const viewerCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'pdfViewer.css')
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             connect-src ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com;
             worker-src blob:;
             img-src ${webview.cspSource} blob: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${viewerCssUri}">
  <title>春蝉 PDF 阅读器</title>
</head>
<body>
  <div id="toolbar">
    <div class="toolbar-left">
      <button id="btn-prev" title="上一页">‹</button>
      <span id="page-info">
        <input id="page-input" type="number" min="1" value="1">
        <span id="page-total">/ ?</span>
      </span>
      <button id="btn-next" title="下一页">›</button>
    </div>
    <div class="toolbar-center">
      <span id="pdf-title" class="pdf-title"></span>
    </div>
    <div class="toolbar-right">
      <button id="btn-zoom-out" title="缩小">−</button>
      <span id="zoom-level">100%</span>
      <button id="btn-zoom-in" title="放大">+</button>
      <button id="btn-fit" title="适合宽度">⊡</button>
    </div>
  </div>

  <div id="pdf-container">
    <canvas id="pdf-canvas"></canvas>
    <div id="text-layer"></div>
    <div id="sentence-highlight"></div>
  </div>

  <div id="loading-overlay">
    <div class="spinner"></div>
    <div class="loading-text">加载 PDF 中…</div>
  </div>

  <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script nonce="${nonce}">
    window.PDF_SRC = "${pdfSrc}";
    window.PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  </script>
  <script nonce="${nonce}" src="${viewerJsUri}"></script>
</body>
</html>`;
  }
}
