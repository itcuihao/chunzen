import * as vscode from 'vscode';
import { ExtToPanelMessage, PanelToExtMessage } from '../types/messages';
import { JournalInfo } from '../types/models';
import { getNonce } from '../utils/nonce';
import { TranslationService } from '../services/translationService';
import { GlossaryService } from '../services/glossaryService';
import { HistoryService } from '../services/historyService';
import { ConfigService } from '../services/configService';
import { LayoutConfig } from '../types/config';

export class SidePanelProvider {
  public static readonly viewType = 'chunzen.sidePanel';
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private translationService: TranslationService;
  private glossaryService: GlossaryService;
  private historyService: HistoryService;
  private configService: ConfigService;
  private layoutTerminal: vscode.Terminal | undefined;

  public onTranslatePageRequested?: (pageNumber: number, paragraphs: Array<{ id: string; text: string }>) => Promise<void>;
  public onRefreshPageTextRequested?: () => Promise<void>;
  public onPanelHoverRequested?: (id?: string) => Promise<void>;
  public onLayoutConfigChanged?: (layoutConfig: LayoutConfig) => Promise<void> | void;

  private lastPageText: {
    pageNumber: number;
    paragraphs: Array<{ id: string; text: string; section?: 'header' | 'left' | 'right' | 'footer' | 'full'; columnIndex?: number; fontSize?: number; height?: number; bold?: boolean; blockType?: string; skipped?: boolean; lineMarker?: 'horizontal-rule'; ruleX1?: number; ruleX2?: number }>;
    columnsCount: number;
    translations?: Array<{ id: string; translatedText: string }>;
  } | null = null;

  constructor(
    context: vscode.ExtensionContext,
    translationService: TranslationService,
    glossaryService: GlossaryService,
    historyService: HistoryService,
    configService: ConfigService
  ) {
    this.context = context;
    this.translationService = translationService;
    this.glossaryService = glossaryService;
    this.historyService = historyService;
    this.configService = configService;

    vscode.window.onDidCloseTerminal((terminal) => {
      if (this.layoutTerminal === terminal) {
        this.layoutTerminal = undefined;
      }
    }, undefined, this.context.subscriptions);
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      SidePanelProvider.viewType,
      '春蝉 — 翻译 & 期刊信息',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist')
        ],
        retainContextWhenHidden: true
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      async (msg: PanelToExtMessage) => {
        switch (msg.type) {
          case 'request-state':
            this.sendInitState();
            break;
          case 'add-term':
            this.glossaryService.add(msg.source, msg.target);
            this.syncGlossary();
            break;
          case 'update-term':
            this.glossaryService.update(msg.id, msg.source, msg.target);
            this.syncGlossary();
            break;
          case 'delete-term':
            this.glossaryService.delete(msg.id);
            this.syncGlossary();
            break;
          case 'clear-cache':
            this.translationService.clearCache();
            break;
          case 'clear-history':
            this.historyService.clear();
            this.syncHistory();
            break;
          case 'test-engine':
            await this.handleTestEngine(msg.engineName);
            break;
          case 'save-engine-config':
            await this.configService.saveEngineConfig(msg.engineName, msg.config);
            this.postMessage({
              type: 'engines-status',
              engines: this.configService.getEngineStatuses()
            });
            break;
          case 'save-general-settings':
            await this.configService.saveGeneralSettings(msg.settings);
            this.sendInitState();
            if (msg.settings.layout && typeof msg.settings.layout.useModel === 'boolean') {
              if (this.configService.getLayoutConfig().useModel) {
                await this.ensureLayoutEndpointStarted();
              } else {
                this.stopLayoutEndpoint();
              }
            }
            await this.onLayoutConfigChanged?.(this.configService.getLayoutConfig());
            break;
          case 'import-glossary':
            vscode.window.showInformationMessage('术语导入功能即将推出');
            break;
          case 'export-translations':
            await this.handleExport(msg.format);
            break;
          case 'translate-page':
            await this.onTranslatePageRequested?.(msg.pageNumber, msg.paragraphs);
            break;
          case 'refresh-page-text':
            await this.onRefreshPageTextRequested?.();
            break;
          case 'panel-hover':
            console.log('[Extension] SidePanelProvider received panel-hover from side panel webview with id:', msg.id);
            await this.onPanelHoverRequested?.(msg.id);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  isVisible(): boolean {
    return !!this.panel;
  }

  postMessage(msg: ExtToPanelMessage): void {
    if (msg.type === 'pdf-hover') {
      console.log('[Extension] SidePanelProvider postMessage (pdf-hover): forwarding to sidePanel webview panel with id:', msg.id);
    }
    if (this.panel) {
      this.panel.webview.postMessage(msg);
    } else {
      console.warn(`[Extension] SidePanelProvider postMessage: panel is undefined. Message type: ${msg.type} was not posted.`);
    }
  }

  updateTranslation(original: string, translated: string, engine: string, cached: boolean): void {
    this.postMessage({ type: 'translate-result', original, translated, engine, cached });
  }

  updateJournal(info: JournalInfo): void {
    this.postMessage({ type: 'update-journal', info });
  }

  syncPageText(
    pageNumber: number,
    paragraphs: Array<{ id: string; text: string; section?: 'header' | 'left' | 'right' | 'footer' | 'full'; columnIndex?: number; fontSize?: number; height?: number; bold?: boolean; blockType?: string; skipped?: boolean; lineMarker?: 'horizontal-rule'; ruleX1?: number; ruleX2?: number }>,
    columnsCount: number,
    translations?: Array<{ id: string; translatedText: string }>
  ): void {
    this.lastPageText = { pageNumber, paragraphs, columnsCount, translations };
    this.postMessage({
      type: 'sync-page-text',
      pageNumber,
      paragraphs,
      columnsCount,
      translations
    });
  }

  syncPageTranslation(
    pageNumber: number,
    translations: Array<{ id: string; translatedText: string }>
  ): void {
    this.postMessage({
      type: 'sync-page-translation',
      pageNumber,
      translations
    });
  }

  showLoading(message: string): void {
    this.postMessage({ type: 'loading', message });
  }

  showError(message: string): void {
    this.postMessage({ type: 'error', message });
  }

  clear(): void {
    this.postMessage({ type: 'clear' });
  }

  sendInitState(): void {
    this.postMessage({
      type: 'init-state',
      glossary: this.glossaryService.getAll(),
      history: this.historyService.getAll(),
      engines: this.configService.getEngineStatuses(),
      priority: this.configService.getTranslationConfig().priority,
      engineConfigs: this.configService.getEngineConfigs(),
      journalSource: { type: 'letpub' },
      cacheMaxSize: this.configService.getCacheConfig().maxSize,
      layoutConfig: this.configService.getLayoutConfig()
    });
    if (this.lastPageText) {
      this.postMessage({
        type: 'sync-page-text',
        pageNumber: this.lastPageText.pageNumber,
        paragraphs: this.lastPageText.paragraphs,
        columnsCount: this.lastPageText.columnsCount,
        translations: this.lastPageText.translations
      });
    }
  }

  syncGlossary(): void {
    this.postMessage({
      type: 'glossary-sync',
      terms: this.glossaryService.getAll()
    });
  }

  syncHistory(): void {
    this.postMessage({
      type: 'history-sync',
      history: this.historyService.getAll()
    });
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private async handleTestEngine(engineName: string): Promise<void> {
    try {
      const result = await this.translationService.translateWithEngine(engineName, 'test sentence');
      this.postMessage({
        type: 'engine-test-result',
        engineName,
        success: true,
        message: `test: ${result}`
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({
        type: 'engine-test-result',
        engineName,
        success: false,
        message: msg
      });
    }
  }

  private async handleExport(format: 'markdown' | 'bilingual'): Promise<void> {
    const history = this.historyService.getAll();
    if (history.length === 0) {
      vscode.window.showInformationMessage('没有可导出的翻译记录');
      return;
    }

    let content: string;
    if (format === 'markdown') {
      content = history.map(h =>
        `**原文** — ${h.engine}\n\n> ${h.original}\n\n${h.translated}\n\n---\n`
      ).join('\n');
    } else {
      content = history.map(h =>
        `${h.original}\n${h.translated}\n\n`
      ).join('');
    }

    const doc = await vscode.workspace.openTextDocument({
      content,
      language: format === 'markdown' ? 'markdown' : 'plaintext'
    });
    await vscode.window.showTextDocument(doc);
  }

  private async ensureLayoutEndpointStarted(): Promise<void> {
    if (this.layoutTerminal) {
      this.layoutTerminal.show(true);
      return;
    }
    const scriptUri = vscode.Uri.joinPath(this.context.extensionUri, 'scripts', 'start_layout_endpoint.sh');
    const scriptPath = scriptUri.fsPath;
    const normalizedPath = scriptPath.replace(/\\/g, '/');
    const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const terminal = vscode.window.createTerminal({
      name: '春蝉版面服务',
      cwd: workspaceCwd
    });
    this.layoutTerminal = terminal;
    terminal.show(true);
    terminal.sendText(`bash "${normalizedPath}"`, true);
    vscode.window.showInformationMessage('已启动本地版面服务。首次安装依赖可能需要几分钟。');
  }

  private stopLayoutEndpoint(): void {
    if (!this.layoutTerminal) return;
    this.layoutTerminal.dispose();
    this.layoutTerminal = undefined;
    vscode.window.showInformationMessage('已停止本地版面服务。');
  }

  private getHtml(webview: vscode.Webview): string {
    const panelJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'panel.js')
    );
    const panelCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'panel.css')
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${panelCssUri}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <title>春蝉面板</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${panelJsUri}"></script>
</body>
</html>`;
  }
}
