import * as vscode from 'vscode';
import { ExtToPanelMessage, PanelToExtMessage } from '../types/messages';
import { JournalInfo } from '../types/models';
import { getNonce } from '../utils/nonce';
import { TranslationService } from '../services/translationService';
import { GlossaryService } from '../services/glossaryService';
import { HistoryService } from '../services/historyService';
import { ConfigService } from '../services/configService';
import { HighlightService } from '../services/highlightService';
import { LayoutConfig } from '../types/config';
import { MineruCoordinator } from './mineruCoordinator';
import { buildExplainSystemPrompt, parseExplainOutput } from '../services/engines/llmPrompt';
import { getEngines } from '../services/engines/registry';
import type { AiExplainResultMessage } from '../types/messages';

type AiExplainPayload = Pick<AiExplainResultMessage, 'translation' | 'explanation' | 'notice'>;

export class SidePanelProvider {
  public static readonly viewType = 'chunzen.sidePanel';
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private translationService: TranslationService;
  private glossaryService: GlossaryService;
  private historyService: HistoryService;
  private configService: ConfigService;
  private highlightService: HighlightService;
  private layoutTerminal: vscode.Terminal | undefined;
  private mineru: MineruCoordinator;

  public onTranslatePageRequested?: (pageNumber: number, paragraphs: Array<{ id: string; text: string }>) => Promise<void>;
  public onGetPdfPagesTextRequested?: (scope: 'read' | 'all' | 'custom', customRange?: string) => void;
  public onRefreshPageTextRequested?: () => Promise<void>;
  public onPanelHoverRequested?: (id?: string) => Promise<void>;
  public onLayoutConfigChanged?: (layoutConfig: LayoutConfig) => Promise<void> | void;
  public onJumpToPageRequested?: (pageNumber: number) => void;
  public onFindAndJumpToCaptionRequested?: (query: string) => void;

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
  private lastBibliography?: Array<{ key: string; text: string; pageNumber: number }>;
  private activePdfUri?: string;

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
    this.highlightService = new HighlightService(context);
    this.mineru = new MineruCoordinator(
      () => this.configService.getMineruConfig(),
      msg => this.postMessage(msg),
      () => this.activePdfUri
    );

    vscode.window.onDidCloseTerminal((terminal) => {
      if (this.layoutTerminal === terminal) {
        this.layoutTerminal = undefined;
      }
    }, undefined, this.context.subscriptions);
  }

  setActivePdf(uri: vscode.Uri): void {
    const uriStr = uri.toString();
    if (this.activePdfUri !== uriStr) {
      this.activePdfUri = uriStr;
      this.postMessage({
        type: 'set-active-pdf',
        pdfUri: uriStr
      });
      this.syncHighlights();
      this.mineru.parse(uriStr);
    }
  }

  syncHighlights(): void {
    if (this.activePdfUri) {
      this.postMessage({
        type: 'sync-highlights',
        pdfUri: this.activePdfUri,
        highlights: this.highlightService.getForPdf(this.activePdfUri)
      });
    }
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two, true);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      SidePanelProvider.viewType,
      '春蝉 — 翻译 & 期刊信息',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist')
        ],
        retainContextWhenHidden: true
      }
    );

    const iconUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
    this.panel.iconPath = { light: iconUri, dark: iconUri };
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg: PanelToExtMessage) => this.handleMessage(msg),
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async handleMessage(msg: PanelToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'toggle-panel-fullscreen':
        if (this.panel) {
          this.panel.reveal(vscode.ViewColumn.Two);
          await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
        }
        break;
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
        await this.handleTestEngine(msg.engineName, msg.config);
        break;
      case 'list-engine-models':
        await this.handleListEngineModels(msg.engineName, msg.config);
        break;
      case 'set-engine-priority':
        await this.configService.saveEnginePriority(msg.priority);
        break;
      case 'save-engine-config':
        await this.configService.saveEngineConfig(msg.engineName, msg.config);
        // 回传实际写入的值（保存时会 trim/校验），表单才能反映真实生效的配置
        this.sendInitState();
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
        if (this.activePdfUri) {
          const mineruConfig = this.configService.getMineruConfig();
          if (mineruConfig.enable) {
            this.mineru.parse(this.activePdfUri);
          } else {
            this.postMessage({
              type: 'mineru-status',
              status: 'idle'
            });
          }
        }
        break;
      case 'trigger-mineru-parse': {
        if (msg.pdfUri) {
          this.mineru.parse(msg.pdfUri, true);
        }
        break;
      }
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
      case 'add-highlight':
        this.highlightService.add({
          id: msg.id,
          pdfUri: msg.pdfUri,
          pageNumber: msg.pageNumber,
          paragraphId: msg.paragraphId,
          text: msg.text,
          color: msg.color,
          note: msg.note
        });
        this.syncHighlights();
        break;
      case 'delete-highlight':
        this.highlightService.delete(msg.id);
        this.syncHighlights();
        break;
      case 'update-highlight-note':
        this.highlightService.updateNote(msg.id, msg.note);
        this.syncHighlights();
        break;
      case 'ai-explain':
        try {
          const payload = await this.handleAiExplain(msg.text);
          this.postMessage({
            type: 'ai-explain-result',
            text: msg.text,
            ...payload
          });
        } catch (err) {
          this.postMessage({
            type: 'ai-explain-result',
            text: msg.text,
            error: err instanceof Error ? err.message : String(err)
          });
        }
        break;
      case 'panel-hover':
        console.log('[Extension] SidePanelProvider received panel-hover from side panel webview with id:', msg.id);
        await this.onPanelHoverRequested?.(msg.id);
        break;
      case 'jump-to-page':
        this.onJumpToPageRequested?.(msg.pageNumber);
        break;
      case 'find-and-jump-to-caption':
        this.onFindAndJumpToCaptionRequested?.(msg.query);
        break;
    }
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

  syncBibliography(bibliography: Array<{ key: string; text: string; pageNumber: number }>): void {
    this.lastBibliography = bibliography;
    this.postMessage({
      type: 'sync-bibliography',
      bibliography
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
      layoutConfig: this.configService.getLayoutConfig(),
      mineruConfig: this.configService.getMineruConfig()
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
    if (this.lastBibliography) {
      this.postMessage({
        type: 'sync-bibliography',
        bibliography: this.lastBibliography
      });
    }
    if (this.activePdfUri) {
      this.postMessage({
        type: 'set-active-pdf',
        pdfUri: this.activePdfUri
      });
      this.syncHighlights();
      this.mineru.parse(this.activePdfUri);
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

  private async handleTestEngine(engineName: string, tempConfig?: Record<string, string>): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.translationService.translateWithEngine(engineName, 'test sentence', tempConfig);
      this.postMessage({
        type: 'engine-test-result',
        engineName,
        profileId: tempConfig?.profileId,
        success: true,
        message: `翻译成功：${result}`,
        elapsedMs: Date.now() - startedAt
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 请求地址与处置建议来自引擎的结构化错误，直接透传给设置页
      const requestUrl = (err as { requestUrl?: string })?.requestUrl;
      const hint = (err as { hint?: string })?.hint;
      const status = (err as { status?: number })?.status;

      // 翻译失败且判像是模型名的问题时，主动去拉一次真实模型列表。
      // 模型 ID 带大小写、版本号、中转前缀（zai-org/GLM-5.3-Flash），
      // 让用户照文档手抄必错；这里直接把可用名字端到设置页上。
      const availableModels = await this.fetchModelsForModelError(engineName, status, msg, tempConfig);

      this.postMessage({
        type: 'engine-test-result',
        engineName,
        profileId: tempConfig?.profileId,
        success: false,
        message: msg,
        hint,
        requestUrl,
        elapsedMs: Date.now() - startedAt,
        availableModels: availableModels.length > 0 ? availableModels : undefined,
        modelListHint: availableModels.length > 0
          ? `模型名可能不对，该服务当前可用 ${availableModels.length} 个模型，点一下即可填入`
          : undefined
      });
    }
  }

  /**
   * 翻译报错后补一次模型列表。只在这条错误确实指向模型名时发起，
   * 避免用户配错地址时又白等一次 20s 的 /models 请求。
   */
  private async fetchModelsForModelError(
    engineName: string,
    status: number | undefined,
    detail: string | undefined,
    tempConfig?: Record<string, string>
  ): Promise<string[]> {
    try {
      const engine = getEngines().find((e) => e.name === engineName);
      if (!engine?.diagnose || !engine.isModelNameError?.(status, detail)) {
        return [];
      }
      const rawTimeout = tempConfig?.timeoutMs;
      const timeoutMs = rawTimeout !== undefined && rawTimeout !== '' && Number.isFinite(Number(rawTimeout))
        ? Math.min(Number(rawTimeout), 20000)
        : 20000;
      const result = await engine.diagnose(tempConfig?.baseUrl, tempConfig?.apiKey, timeoutMs);
      return result.ok ? result.models ?? [] : [];
    } catch {
      return [];
    }
  }

  private async handleListEngineModels(engineName: string, tempConfig?: Record<string, string>): Promise<void> {
    const engine = getEngines().find((e) => e.name === engineName);
    if (!engine?.diagnose) {
      this.postMessage({
        type: 'engine-models',
        engineName,
        ok: false,
        models: [],
        message: '该引擎不支持拉取模型列表'
      });
      return;
    }
    const rawTimeout = tempConfig?.timeoutMs;
    const timeoutMs = rawTimeout !== undefined && rawTimeout !== '' && Number.isFinite(Number(rawTimeout))
      ? Number(rawTimeout)
      : undefined;
    const result = await engine.diagnose(tempConfig?.baseUrl, tempConfig?.apiKey, timeoutMs);
    this.postMessage({
      type: 'engine-models',
      engineName,
      profileId: tempConfig?.profileId,
      ok: result.ok,
      models: result.models ?? [],
      message: result.message,
      hint: result.hint,
      requestUrl: result.requestUrl
    });
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
    const { untranslatedPolicy, format } = this.currentExportConfig;
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

  private async handleAiExplain(text: string): Promise<AiExplainPayload> {
    let llmError: unknown;
    try {
      const prompt = buildExplainSystemPrompt(this.glossaryService.getMatchingTerms(text));
      const explainProfileId = this.configService.getTranslationConfig().openai.explainProfileId;
      const raw = await this.translationService.completeWithLlm(
        prompt,
        text,
        explainProfileId ? { profileId: explainProfileId } : undefined
      );
      if (raw) {
        const parsed = parseExplainOutput(raw);
        if (parsed.translation || parsed.explanation) return parsed;
      }
    } catch (err) {
      llmError = err;
    }

    // 无可用大模型或调用失败：降级到机器翻译，只给译文，并单独给出提示
    try {
      const transResult = await this.translationService.translate(text);
      const notice = llmError
        ? `大模型调用失败（${llmError instanceof Error ? llmError.message : String(llmError)}），请检查 Base URL、API Key 与网络/代理设置。已降级为机器翻译。`
        : '未配置大模型接口，仅提供机器翻译。在设置中配置 OpenAI 兼容接口后可获得学术释义。';
      return { translation: transResult.text, notice };
    } catch (transErr) {
      if (llmError) throw llmError;
      throw new Error('未配置大模型接口，且机器翻译不可用: ' + (transErr instanceof Error ? transErr.message : String(transErr)));
    }
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
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
             font-src https://fonts.gstatic.com https://cdn.jsdelivr.net;
             img-src ${webview.cspSource} blob: data: https:;
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${panelCssUri}">
  <!--
    KaTeX 与 Inter 都用 media="print" + load 事件切成 all 的方式加载：
    <link rel="stylesheet"> 会阻塞首次渲染，而 webview 里这两个请求常常要
    1–3 秒（国内访问 Google Fonts 更久）。media="print" 让浏览器判定为不渲染
    的样式表从而不阻塞，加载完成后再切回 all；失败就保持 media="print"，
    公式退化成普通文本而不是白屏。
  -->
  <link id="katex-link" rel="stylesheet" media="print"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <link id="font-link" rel="stylesheet" media="print"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Noto+Serif+SC:wght@400;500&amp;display=swap">
  <title>春蝉面板</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    // 同 PdfEditorProvider：media="print" 不阻塞首帧，下载完再切 all。
    ['katex-link', 'font-link'].forEach(function (id) {
      var link = document.getElementById(id);
      if (!link) return;
      // 缓存命中时 load 可能已错过；link.sheet 非 null 表示已解析完成。
      var done = false;
      var flip = function () { if (!done) { done = true; link.media = 'all'; } };
      if (link.sheet) { flip(); return; }
      link.addEventListener('load', flip);
    });
  </script>
  <script nonce="${nonce}" src="${panelJsUri}"></script>
</body>
</html>`;
  }
}
