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
  public onGetPdfPagesTextRequested?: (scope: 'read' | 'all' | 'custom', customRange?: string) => void;
  public onRefreshPageTextRequested?: () => Promise<void>;
  public onPanelHoverRequested?: (id?: string) => Promise<void>;
  public onLayoutConfigChanged?: (layoutConfig: LayoutConfig) => Promise<void> | void;

  private currentExportConfig: {
    untranslatedPolicy: 'english' | 'translate';
    format: 'markdown' | 'chinese' | 'bilingual';
    documentName?: string;
  } | null = null;

  private lastPageText: {
    pageNumber: number;
    paragraphs: Array<{ id: string; text: string; section?: 'header' | 'left' | 'right' | 'footer' | 'full'; columnIndex?: number; fontSize?: number; height?: number; bold?: boolean; blockType?: string; skipped?: boolean; skipReason?: string; lineMarker?: 'horizontal-rule' | 'table-image' | 'figure-image'; ruleX1?: number; ruleX2?: number; imageDataUrl?: string; imageAlt?: string }>;
    columnsCount: number;
    translations?: Array<{ id: string; translatedText: string }>;
  } | null = null;
  private lastJournalInfo: JournalInfo | null = null;

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
            this.glossaryService.add(msg.source, msg.target, msg.category);
            this.syncGlossary();
            break;
          case 'update-term':
            this.glossaryService.update(msg.id, msg.source, msg.target, msg.category);
            this.syncGlossary();
            break;
          case 'delete-term':
            this.glossaryService.delete(msg.id);
            this.syncGlossary();
            break;
          case 'clear-cache':
            this.translationService.clearCache();
            this.syncCacheSize();
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
            await this.handleImportGlossary(msg.defaultCategory);
            break;
          case 'restore-default-glossary':
            this.glossaryService.restoreDefaults();
            this.syncGlossary();
            vscode.window.showInformationMessage('已成功恢复默认学术常用术语库');
            break;
          case 'export-translations':
            await this.handleExport(msg.format);
            break;
          case 'export-doc':
            this.currentExportConfig = {
              untranslatedPolicy: msg.untranslatedPolicy,
              format: msg.format,
              documentName: msg.documentName
            };
            this.postMessage({
              type: 'export-progress',
              current: 0,
              total: 100,
              stage: 'extracting'
            });
            this.onGetPdfPagesTextRequested?.(msg.scope, msg.customRange);
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
    this.postMessage({
      type: 'translate-result',
      original,
      translated,
      engine,
      cached,
      cacheSize: this.translationService.getCacheSize()
    });
  }

  syncCacheSize(): void {
    const size = this.translationService.getCacheSize();
    this.postMessage({ type: 'cache-size-sync', size });
  }

  updateJournal(info: JournalInfo): void {
    this.lastJournalInfo = info;
    this.postMessage({ type: 'update-journal', info });
  }

  syncPageText(
    pageNumber: number,
    paragraphs: Array<{ id: string; text: string; section?: 'header' | 'left' | 'right' | 'footer' | 'full'; columnIndex?: number; fontSize?: number; height?: number; bold?: boolean; blockType?: string; skipped?: boolean; skipReason?: string; lineMarker?: 'horizontal-rule' | 'table-image' | 'figure-image'; ruleX1?: number; ruleX2?: number; imageDataUrl?: string; imageAlt?: string }>,
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
      journalSource: { type: this.configService.getJournalConfig().source },
      cacheMaxSize: this.configService.getCacheConfig().maxSize,
      cacheSize: this.translationService.getCacheSize(),
      layoutConfig: this.configService.getLayoutConfig()
    });
    if (this.lastJournalInfo) {
      this.postMessage({
        type: 'update-journal',
        info: this.lastJournalInfo
      });
    }
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

  private async handleImportGlossary(defaultCategory?: string): Promise<void> {
    let category = defaultCategory;
    if (!category) {
      const selected = await vscode.window.showQuickPick(
        ['计算机与人工智能', '生物医学', '化学', '物理学', '通用学术', '其他'],
        {
          placeHolder: '选择导入术语的默认学科分类'
        }
      );
      if (!selected) {
        return; // Cancelled
      }
      category = selected;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: '选择数据表文件',
      filters: {
        '数据表文件 (*.csv, *.txt, *.tsv, *.json)': ['csv', 'txt', 'tsv', 'json']
      }
    });

    if (uris && uris.length > 0) {
      try {
        const count = await this.glossaryService.importFromFile(uris[0].fsPath, category);
        this.syncGlossary();
        vscode.window.showInformationMessage(`成功导入 ${count} 条术语到分类「${category}」！`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`导入失败: ${msg}`);
      }
    }
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

  public async handlePdfPagesTextResult(paragraphs: Array<{ id: string; text: string; page: number }>): Promise<void> {
    if (!this.currentExportConfig) {
      return;
    }
    const { untranslatedPolicy, format, documentName } = this.currentExportConfig;
    this.currentExportConfig = null;

    const total = paragraphs.length;
    this.postMessage({
      type: 'export-progress',
      current: 0,
      total,
      stage: 'translating'
    });

    const compiledParagraphs: Array<{ original: string; translated: string; page: number }> = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      let translatedText = '';

      if (para.text.trim()) {
        const cached = this.translationService.getCachedTranslation(para.text);
        if (cached) {
          translatedText = cached;
        } else if (untranslatedPolicy === 'translate') {
          try {
            const res = await this.translationService.translate(para.text);
            translatedText = res.text;
            if (!res.cached) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (err) {
            console.error(`Export translation error for: ${para.text}`, err);
          }
        }
      }

      compiledParagraphs.push({
        original: para.text,
        translated: translatedText,
        page: para.page
      });

      this.postMessage({
        type: 'export-progress',
        current: i + 1,
        total,
        stage: 'translating',
        pageNumber: para.page
      });
    }

    this.postMessage({
      type: 'export-progress',
      current: total,
      total,
      stage: 'compiling'
    });

    let content = '';
    let lastPage = -1;
    for (const para of compiledParagraphs) {
      if (para.page !== lastPage) {
        lastPage = para.page;
        content += `\n\n<!-- Page ${lastPage} -->\n\n`;
      }

      const orig = para.original.trim();
      const trans = para.translated.trim();

      if (!orig) continue;

      if (format === 'bilingual') {
        if (trans) {
          content += `${orig}\n\n${trans}\n\n`;
        } else {
          content += `${orig}\n\n`;
        }
      } else if (format === 'chinese') {
        if (trans) {
          const hashMatch = orig.match(/^(#+)\s+/);
          if (hashMatch) {
            const hashes = hashMatch[1];
            const cleanTrans = trans.replace(/^#+\s+/, '');
            content += `${hashes} ${cleanTrans}\n\n`;
          } else {
            content += `${trans}\n\n`;
          }
        } else {
          content += `${orig}\n\n`;
        }
      } else { // 'markdown' (Bilingual with quotes)
        if (trans) {
          content += `**原文**:\n> ${orig.replace(/\n/g, '\n> ')}\n\n**译文**:\n${trans}\n\n---\n\n`;
        } else {
          content += `**原文**:\n> ${orig.replace(/\n/g, '\n> ')}\n\n`;
        }
      }
    }

    const doc = await vscode.workspace.openTextDocument({
      content: content.trim(),
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
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
