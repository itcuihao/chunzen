import * as vscode from 'vscode';
import * as path from 'path';
import { PdfViewerToExtMessage } from '../types/messages';
import { TranslationService } from '../services/translationService';
import { JournalService } from '../services/journalService';
import { SidePanelProvider } from '../sidePanel/SidePanelProvider';
import { HistoryService } from '../services/historyService';
import { ConfigService } from '../services/configService';
import { getNonce } from '../utils/nonce';
import { DoiResolver } from '../services/doiResolver';

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
  private configService: ConfigService;
  private context: vscode.ExtensionContext;

  // 每个文档对应的 WebView
  private webviews = new Map<string, vscode.WebviewPanel>();
  private panelUris = new Map<vscode.WebviewPanel, vscode.Uri>();
  private activeWebviewPanel: vscode.WebviewPanel | undefined;

  constructor(
    context: vscode.ExtensionContext,
    translationService: TranslationService,
    journalService: JournalService,
    sidePanel: SidePanelProvider,
    historyService: HistoryService,
    configService: ConfigService
  ) {
    this.context = context;
    this.translationService = translationService;
    this.journalService = journalService;
    this.sidePanel = sidePanel;
    this.historyService = historyService;
    this.configService = configService;
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
    this.panelUris.set(webviewPanel, uri);
    this.activeWebviewPanel = webviewPanel;
    this.sidePanel.setActivePdf(uri);

    webviewPanel.onDidChangeViewState(e => {
      if (e.webviewPanel.active) {
        this.activeWebviewPanel = webviewPanel;
        this.sidePanel.setActivePdf(uri);
      }
    });

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
            webviewPanel.webview.postMessage({
              type: 'layout-config',
              config: this.configService.getLayoutConfig()
            });
            break;

          case 'pdf-hover':
            console.log('[Extension] PdfEditorProvider received pdf-hover from webview, forwarding to sidePanel with id:', msg.id);
            this.sidePanel.postMessage({ type: 'pdf-hover', id: msg.id });
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

          case 'translate-page-paragraphs':
            await this.handleTranslatePageParagraphs(webviewPanel, msg.pageNumber, msg.paragraphs);
            break;

          case 'page-text-loaded':
            this.sidePanel.syncPageText(msg.pageNumber, msg.paragraphs, msg.columnsCount, msg.translations);
            break;

          case 'figure-screenshot-captured':
            await this.handleFigureScreenshotCaptured(webviewPanel, msg.pageNumber, msg.dataUrl);
            break;

          case 'figure-screenshot-error':
            vscode.window.showWarningMessage(`图像区域截图失败（第 ${msg.pageNumber} 页）：${msg.reason}`);
            break;

          case 'pdf-pages-text-result':
            this.sidePanel.handlePdfPagesTextResult(msg.paragraphs);
            break;

          case 'pdf-bibliography-extracted':
            this.sidePanel.syncBibliography(msg.bibliography);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    webviewPanel.onDidDispose(() => {
      this.webviews.delete(key);
      this.panelUris.delete(webviewPanel);
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
      }
    });
  }

  private async handleFigureScreenshotCaptured(
    panel: vscode.WebviewPanel,
    pageNumber: number,
    dataUrl: string
  ): Promise<void> {
    const pdfUri = this.panelUris.get(panel);
    if (!pdfUri) {
      vscode.window.showWarningMessage('截图保存失败：未找到当前 PDF 文档路径。');
      return;
    }

    const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!m?.[1]) {
      vscode.window.showWarningMessage('截图保存失败：无效的图片数据。');
      return;
    }

    const raw = Buffer.from(m[1], 'base64');
    const baseName = path.basename(pdfUri.fsPath, path.extname(pdfUri.fsPath));
    const dir = path.dirname(pdfUri.fsPath);
    let target = path.join(dir, `${baseName}.p${pageNumber}.png`);

    for (let i = 1; i <= 99; i++) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(target));
        target = path.join(dir, `${baseName}.p${pageNumber}-${i}.png`);
      } catch {
        break;
      }
    }

    await vscode.workspace.fs.writeFile(vscode.Uri.file(target), raw);
    vscode.window.showInformationMessage(`整页高清截图已保存：${path.basename(target)}`);
  }

  private resolveActivePanel(): vscode.WebviewPanel | undefined {
    let panel = this.activeWebviewPanel;
    if (!panel && this.webviews.size > 0) {
      panel = Array.from(this.webviews.values())[0];
    }
    return panel;
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
    const journalCfg = vscode.workspace.getConfiguration('chunzen.journal');
    if (!journalCfg.get<boolean>('enabled', true)) return;

    const preferredSource = journalCfg.get<'ablesci' | 'letpub'>('source', 'ablesci');

    let resolvedQuery = issn || journal || doi;
    let paperMeta: any = {};

    // 1. 优先使用 DOI 并在后台解析出准确的 ISSN / 期刊名以及论文元数据
    if (doi) {
      try {
        const metadata = await DoiResolver.resolveDoi(doi);
        paperMeta = metadata;
        if (metadata.issn || metadata.journalName) {
          resolvedQuery = metadata.issn || metadata.journalName;
          console.log(`[ChunZen] DOI 解析成功, 得到的 ISSN/期刊名: "${resolvedQuery}"`);
        }
      } catch (err) {
        console.warn('[ChunZen] DOI 自动解析接口异常:', err);
      }
    }

    if (!resolvedQuery) return;

    try {
      const info = await this.journalService.query(resolvedQuery, preferredSource);
      if (info) {
        if (doi) info.doi = doi;
        
        // 合并论文级元数据
        if (paperMeta.publishYear) info.publishYear = paperMeta.publishYear;
        if (paperMeta.firstAuthor) info.firstAuthor = paperMeta.firstAuthor;
        if (paperMeta.firstAuthorAffiliation) info.firstAuthorAffiliation = paperMeta.firstAuthorAffiliation;
        if (paperMeta.lastAuthor) info.lastAuthor = paperMeta.lastAuthor;
        if (paperMeta.lastAuthorAffiliation) info.lastAuthorAffiliation = paperMeta.lastAuthorAffiliation;
        if (paperMeta.paperSource) info.paperSource = paperMeta.paperSource;

        this.sidePanel.updateJournal(info);
      }
    } catch (err) {
      console.warn('期刊信息查询失败:', err);
    }
  }

  private async handleTranslatePageParagraphs(
    webviewPanel: vscode.WebviewPanel,
    pageNumber: number,
    paragraphs: Array<{ id: string; text: string }>
  ): Promise<void> {
    try {
      const translations: Array<{ id: string; translatedText: string }> = [];

      for (const para of paragraphs) {
        if (!para.text.trim()) {
          translations.push({ id: para.id, translatedText: '' });
          continue;
        }

        const result = await this.translationService.translate(para.text);
        translations.push({ id: para.id, translatedText: result.text });
        this.historyService.add(para.text, result.text, result.engine);

        if (!result.cached) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      webviewPanel.webview.postMessage({
        type: 'translate-page-paragraphs-result',
        pageNumber,
        translations
      });

      // Also sync to the side panel!
      this.sidePanel.syncPageTranslation(pageNumber, translations);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      webviewPanel.webview.postMessage({
        type: 'translate-page-paragraphs-error',
        pageNumber,
        message: errMsg
      });
      this.sidePanel.showError(errMsg);
    }
  }

  public async translateActivePage(pageNumber: number, paragraphs: Array<{ id: string; text: string }>): Promise<void> {
    const panel = this.resolveActivePanel();
    if (!panel) {
      vscode.window.showWarningMessage('未检测到活动的 PDF 编辑器，请确保 PDF 编辑器处于打开状态。');
      return;
    }
    // Instruct the active webview panel to show translation loading state
    panel.webview.postMessage({
      type: 'translate-page-paragraphs-loading',
      pageNumber
    });
    await this.handleTranslatePageParagraphs(panel, pageNumber, paragraphs);
  }

  public hoverActivePageElement(id?: string): void {
    const panel = this.resolveActivePanel();
    if (panel) {
      console.log('[Extension] PdfEditorProvider hoverActivePageElement, posting sync-panel-hover to active PDF viewer webview with id:', id);
      panel.webview.postMessage({
        type: 'sync-panel-hover',
        id
      });
    } else {
      console.warn('[Extension] PdfEditorProvider hoverActivePageElement, no activeWebviewPanel or other panels found to send sync-panel-hover.');
    }
  }

  public async refreshActivePageText(): Promise<void> {
    const panel = this.resolveActivePanel();
    if (!panel) {
      vscode.window.showWarningMessage('未检测到活动的 PDF 编辑器，请确保 PDF 编辑器处于打开状态。');
      return;
    }
    panel.webview.postMessage({
      type: 'trigger-page-text-extract',
      layoutConfig: this.configService.getLayoutConfig()
    });
  }

  public async captureActiveFigureScreenshot(): Promise<void> {
    const panel = this.resolveActivePanel();
    if (!panel) {
      vscode.window.showWarningMessage('未检测到活动的 PDF 编辑器，请确保 PDF 编辑器处于打开状态。');
      return;
    }

    panel.webview.postMessage({ type: 'capture-figure-screenshot' });
  }

  public getPdfPagesText(scope: 'read' | 'all' | 'custom', customRange?: string): void {
    const panel = this.resolveActivePanel();
    if (!panel) {
      vscode.window.showWarningMessage('未检测到活动的 PDF 编辑器，请确保 PDF 编辑器处于打开状态。');
      return;
    }
    panel.webview.postMessage({
      type: 'get-pdf-pages-text',
      scope,
      customRange
    });
  }

  public syncLayoutConfigToAllViewers(): void {
    const layoutConfig = this.configService.getLayoutConfig();
    for (const panel of this.webviews.values()) {
      panel.webview.postMessage({
        type: 'layout-config',
        config: layoutConfig
      });
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
             connect-src ${webview.cspSource} https: http:;
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
      <button id="btn-outline" title="显示/隐藏目录">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </button>
      <div style="width: 1px; height: 16px; background: var(--toolbar-border); margin: 0 6px;"></div>
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
      <button id="btn-capture" title="保存当前页为高清图片">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
      </button>
    </div>
  </div>

  <div id="main-layout">
    <div id="outline-sidebar" class="hidden">
      <div class="outline-header">目录导航</div>
      <div id="outline-tree"></div>
    </div>
    <div id="pdf-container">
      <canvas id="pdf-canvas"></canvas>
      <div id="text-layer"></div>
      <div id="sentence-highlight"></div>
    </div>
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
