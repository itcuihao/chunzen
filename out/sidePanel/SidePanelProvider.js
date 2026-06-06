"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidePanelProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const nonce_1 = require("../utils/nonce");
const fetch_1 = require("../utils/fetch");
const highlightService_1 = require("../services/highlightService");
const mineruService_1 = require("../services/mineruService");
class SidePanelProvider {
    static viewType = 'chunzen.sidePanel';
    panel;
    context;
    translationService;
    glossaryService;
    historyService;
    configService;
    highlightService;
    layoutTerminal;
    mineruService = new mineruService_1.MineruService();
    mineruCache = new Map();
    activeMineruTaskUri = null;
    onTranslatePageRequested;
    onGetPdfPagesTextRequested;
    onRefreshPageTextRequested;
    onPanelHoverRequested;
    onLayoutConfigChanged;
    onJumpToPageRequested;
    onFindAndJumpToCaptionRequested;
    currentExportConfig = null;
    lastPageText = null;
    lastJournalInfo = null;
    lastBibliography;
    activePdfUri;
    constructor(context, translationService, glossaryService, historyService, configService) {
        this.context = context;
        this.translationService = translationService;
        this.glossaryService = glossaryService;
        this.historyService = historyService;
        this.configService = configService;
        this.highlightService = new highlightService_1.HighlightService(context);
        vscode.window.onDidCloseTerminal((terminal) => {
            if (this.layoutTerminal === terminal) {
                this.layoutTerminal = undefined;
            }
        }, undefined, this.context.subscriptions);
    }
    setActivePdf(uri) {
        const uriStr = uri.toString();
        if (this.activePdfUri !== uriStr) {
            this.activePdfUri = uriStr;
            this.postMessage({
                type: 'set-active-pdf',
                pdfUri: uriStr
            });
            this.syncHighlights();
            this.triggerMineruParse(uriStr);
        }
    }
    async triggerMineruParse(uriStr, force = false) {
        const config = this.configService.getMineruConfig();
        if (!config.enable && !force)
            return;
        if (force) {
            this.activeMineruTaskUri = null;
            this.mineruCache.delete(uriStr);
        }
        if (this.mineruCache.has(uriStr)) {
            const cachedMd = this.mineruCache.get(uriStr);
            this.postMessage({
                type: 'mineru-complete',
                markdown: cachedMd
            });
            return;
        }
        if (this.activeMineruTaskUri === uriStr) {
            return;
        }
        this.activeMineruTaskUri = uriStr;
        this.postMessage({
            type: 'mineru-status',
            status: 'parsing',
            progress: 0,
            message: '正在初始化 MinerU AI 解析...'
        });
        try {
            const uri = vscode.Uri.parse(uriStr);
            let targetPath = uri.fsPath;
            if (uri.scheme !== 'file') {
                targetPath = uri.toString();
            }
            const apiType = config.apiType || 'agent';
            const token = config.token || '';
            // If standard mode is enabled, token exists, and local file size is <= 10MB, run dual-path progressive parsing
            const runDual = apiType === 'standard' && token && uri.scheme === 'file' && fs.existsSync(targetPath) && (fs.statSync(targetPath).size / (1024 * 1024) <= 10);
            if (runDual) {
                console.log(`[ChunZen] 启动“渐进式双路解析”机制: 同时并发请求 Agent (免Token极速版) 与 Standard (VLM高精度版)`);
                let agentCompleted = false;
                let standardCompleted = false;
                // Route 1: Free Agent API (Fast preview)
                const agentPromise = this.mineruService.parsePdf(targetPath, { ...config, apiType: 'agent' }, (status, progress, message) => {
                    if (!standardCompleted) {
                        this.postMessage({
                            type: 'mineru-status',
                            status: 'parsing',
                            progress: Math.min(60, Math.round(progress * 0.6)), // Scale down agent progress
                            message: `[极速通道] ${message}`
                        });
                    }
                }).then(markdown => {
                    agentCompleted = true;
                    if (!standardCompleted) {
                        console.log(`[ChunZen] 极速通道 (Agent API) 率先解析完成，渲染临时 AI 增强视图`);
                        this.mineruCache.set(uriStr, markdown);
                        this.postMessage({
                            type: 'mineru-complete',
                            markdown
                        });
                    }
                }).catch(err => {
                    console.warn('[ChunZen] 极速通道 (Agent API) 失败，继续等待精度通道...', err.message);
                });
                // Route 2: Standard API (High precision VLM)
                const standardPromise = this.mineruService.parsePdf(targetPath, config, (status, progress, message) => {
                    this.postMessage({
                        type: 'mineru-status',
                        status: 'parsing',
                        progress,
                        message: `[精度通道] ${message}`
                    });
                }).then(markdown => {
                    standardCompleted = true;
                    console.log(`[ChunZen] 精度通道 (Standard VLM) 解析完成，自动无缝覆盖升级为最高质量版面`);
                    this.mineruCache.set(uriStr, markdown);
                    this.postMessage({
                        type: 'mineru-complete',
                        markdown
                    });
                }).catch(err => {
                    standardCompleted = true;
                    console.error('[ChunZen] 精度通道 (Standard VLM) 失败:', err);
                    if (!agentCompleted) {
                        this.postMessage({
                            type: 'mineru-status',
                            status: 'failed',
                            error: err.message || '精度通道解析失败'
                        });
                    }
                });
                Promise.allSettled([agentPromise, standardPromise]).finally(() => {
                    if (this.activeMineruTaskUri === uriStr) {
                        this.activeMineruTaskUri = null;
                    }
                });
            }
            else {
                // Single path execution
                console.log(`[ChunZen] 启动 MinerU 单路解析 (${apiType} 模式)`);
                const markdown = await this.mineruService.parsePdf(targetPath, config, (status, progress, message) => {
                    this.postMessage({
                        type: 'mineru-status',
                        status: 'parsing',
                        progress,
                        message
                    });
                });
                this.mineruCache.set(uriStr, markdown);
                if (this.activePdfUri === uriStr) {
                    this.postMessage({
                        type: 'mineru-complete',
                        markdown
                    });
                }
                if (this.activeMineruTaskUri === uriStr) {
                    this.activeMineruTaskUri = null;
                }
            }
        }
        catch (err) {
            console.error('[ChunZen] MinerU 解析出错:', err);
            if (this.activePdfUri === uriStr) {
                this.postMessage({
                    type: 'mineru-status',
                    status: 'failed',
                    error: err.message || '未知错误'
                });
            }
            if (this.activeMineruTaskUri === uriStr) {
                this.activeMineruTaskUri = null;
            }
        }
    }
    syncHighlights() {
        if (this.activePdfUri) {
            this.postMessage({
                type: 'sync-highlights',
                pdfUri: this.activePdfUri,
                highlights: this.highlightService.getForPdf(this.activePdfUri)
            });
        }
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two, true);
            return;
        }
        this.panel = vscode.window.createWebviewPanel(SidePanelProvider.viewType, '春蝉 — 翻译 & 期刊信息', { viewColumn: vscode.ViewColumn.Two, preserveFocus: true }, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ],
            retainContextWhenHidden: true
        });
        const iconUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
        this.panel.iconPath = { light: iconUri, dark: iconUri };
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.webview.onDidReceiveMessage(async (msg) => {
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
                        }
                        else {
                            this.stopLayoutEndpoint();
                        }
                    }
                    await this.onLayoutConfigChanged?.(this.configService.getLayoutConfig());
                    if (this.activePdfUri) {
                        const mineruConfig = this.configService.getMineruConfig();
                        if (mineruConfig.enable) {
                            this.triggerMineruParse(this.activePdfUri);
                        }
                        else {
                            this.postMessage({
                                type: 'mineru-status',
                                status: 'idle'
                            });
                        }
                    }
                    break;
                case 'trigger-mineru-parse': {
                    const mineruCfg = this.configService.getMineruConfig();
                    if (!mineruCfg.enable) {
                        const cfg = vscode.workspace.getConfiguration('chunzen.mineru');
                        await cfg.update('enable', true, vscode.ConfigurationTarget.Global);
                        this.sendInitState();
                    }
                    if (msg.pdfUri) {
                        this.triggerMineruParse(msg.pdfUri, true);
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
                        const explanation = await this.handleAiExplain(msg.text);
                        this.postMessage({
                            type: 'ai-explain-result',
                            text: msg.text,
                            explanation
                        });
                    }
                    catch (err) {
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
        }, undefined, this.context.subscriptions);
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }
    isVisible() {
        return !!this.panel;
    }
    postMessage(msg) {
        if (msg.type === 'pdf-hover') {
            console.log('[Extension] SidePanelProvider postMessage (pdf-hover): forwarding to sidePanel webview panel with id:', msg.id);
        }
        if (this.panel) {
            this.panel.webview.postMessage(msg);
        }
        else {
            console.warn(`[Extension] SidePanelProvider postMessage: panel is undefined. Message type: ${msg.type} was not posted.`);
        }
    }
    updateTranslation(original, translated, engine, cached) {
        this.postMessage({
            type: 'translate-result',
            original,
            translated,
            engine,
            cached,
            cacheSize: this.translationService.getCacheSize()
        });
    }
    syncCacheSize() {
        const size = this.translationService.getCacheSize();
        this.postMessage({ type: 'cache-size-sync', size });
    }
    updateJournal(info) {
        this.lastJournalInfo = info;
        this.postMessage({ type: 'update-journal', info });
    }
    syncPageText(pageNumber, paragraphs, columnsCount, translations) {
        this.lastPageText = { pageNumber, paragraphs, columnsCount, translations };
        this.postMessage({
            type: 'sync-page-text',
            pageNumber,
            paragraphs,
            columnsCount,
            translations
        });
    }
    syncPageTranslation(pageNumber, translations) {
        this.postMessage({
            type: 'sync-page-translation',
            pageNumber,
            translations
        });
    }
    syncBibliography(bibliography) {
        this.lastBibliography = bibliography;
        this.postMessage({
            type: 'sync-bibliography',
            bibliography
        });
    }
    showLoading(message) {
        this.postMessage({ type: 'loading', message });
    }
    showError(message) {
        this.postMessage({ type: 'error', message });
    }
    clear() {
        this.postMessage({ type: 'clear' });
    }
    sendInitState() {
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
            this.triggerMineruParse(this.activePdfUri);
        }
    }
    syncGlossary() {
        this.postMessage({
            type: 'glossary-sync',
            terms: this.glossaryService.getAll()
        });
    }
    syncHistory() {
        this.postMessage({
            type: 'history-sync',
            history: this.historyService.getAll()
        });
    }
    dispose() {
        this.panel?.dispose();
    }
    async handleTestEngine(engineName) {
        try {
            const result = await this.translationService.translateWithEngine(engineName, 'test sentence');
            this.postMessage({
                type: 'engine-test-result',
                engineName,
                success: true,
                message: `test: ${result}`
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.postMessage({
                type: 'engine-test-result',
                engineName,
                success: false,
                message: msg
            });
        }
    }
    async handleExport(format) {
        const history = this.historyService.getAll();
        if (history.length === 0) {
            vscode.window.showInformationMessage('没有可导出的翻译记录');
            return;
        }
        let content;
        if (format === 'markdown') {
            content = history.map(h => `**原文** — ${h.engine}\n\n> ${h.original}\n\n${h.translated}\n\n---\n`).join('\n');
        }
        else {
            content = history.map(h => `${h.original}\n${h.translated}\n\n`).join('');
        }
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: format === 'markdown' ? 'markdown' : 'plaintext'
        });
        await vscode.window.showTextDocument(doc);
    }
    async handleImportGlossary(defaultCategory) {
        let category = defaultCategory;
        if (!category) {
            const selected = await vscode.window.showQuickPick(['计算机与人工智能', '生物医学', '化学', '物理学', '通用学术', '其他'], {
                placeHolder: '选择导入术语的默认学科分类'
            });
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
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`导入失败: ${msg}`);
            }
        }
    }
    async ensureLayoutEndpointStarted() {
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
    stopLayoutEndpoint() {
        if (!this.layoutTerminal)
            return;
        this.layoutTerminal.dispose();
        this.layoutTerminal = undefined;
        vscode.window.showInformationMessage('已停止本地版面服务。');
    }
    async handlePdfPagesTextResult(paragraphs) {
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
        const compiledParagraphs = [];
        for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];
            let translatedText = '';
            if (para.text.trim()) {
                const cached = this.translationService.getCachedTranslation(para.text);
                if (cached) {
                    translatedText = cached;
                }
                else if (untranslatedPolicy === 'translate') {
                    try {
                        const res = await this.translationService.translate(para.text);
                        translatedText = res.text;
                        if (!res.cached) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                    catch (err) {
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
            if (!orig)
                continue;
            if (format === 'bilingual') {
                if (trans) {
                    content += `${orig}\n\n${trans}\n\n`;
                }
                else {
                    content += `${orig}\n\n`;
                }
            }
            else if (format === 'chinese') {
                if (trans) {
                    const hashMatch = orig.match(/^(#+)\s+/);
                    if (hashMatch) {
                        const hashes = hashMatch[1];
                        const cleanTrans = trans.replace(/^#+\s+/, '');
                        content += `${hashes} ${cleanTrans}\n\n`;
                    }
                    else {
                        content += `${trans}\n\n`;
                    }
                }
                else {
                    content += `${orig}\n\n`;
                }
            }
            else { // 'markdown' (Bilingual with quotes)
                if (trans) {
                    content += `**原文**:\n> ${orig.replace(/\n/g, '\n> ')}\n\n**译文**:\n${trans}\n\n---\n\n`;
                }
                else {
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
    async handleAiExplain(text) {
        const config = this.configService.getTranslationConfig();
        const apiKey = config.openai.apiKey;
        const baseUrl = config.openai.baseUrl;
        const model = config.openai.model;
        if (!apiKey) {
            try {
                const transResult = await this.translationService.translate(text);
                return `💡 [提示] 请在设置中配置 **OpenAI 兼容接口**，以获得大模型驱动的深度学术释义。以下为机器翻译结果：\n\n${transResult.text}`;
            }
            catch (err) {
                throw new Error('未配置 OpenAI 接口，且机器翻译不可用: ' + (err instanceof Error ? err.message : String(err)));
            }
        }
        const systemPrompt = "你是一个资深的学术论文导师。请用中文简明扼要地解释用户提供的学术词汇、术语或句子，指出其在论文中的含义、背景以及常见的学术用途。要求回答清晰、专业、直白，字数控制在150字以内。";
        const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
        try {
            const resp = await (0, fetch_1.customFetch)(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ],
                    temperature: 0.3,
                    max_tokens: 1024
                }),
                signal: AbortSignal.timeout(30000)
            });
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`请求失败 ${resp.status}: ${errText.slice(0, 200)}`);
            }
            const data = (await resp.json());
            if (data.error) {
                throw new Error(`接口错误: ${data.error.message}`);
            }
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('返回了空的结果');
            }
            return content.trim();
        }
        catch (err) {
            try {
                const transResult = await this.translationService.translate(text);
                return `⚠️ [API 错误: ${err instanceof Error ? err.message : String(err)}]\n\n已自动为您降级到机器翻译：\n\n${transResult.text}`;
            }
            catch (transErr) {
                throw err;
            }
        }
    }
    getHtml(webview) {
        const panelJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'panel.js'));
        const panelCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'panel.css'));
        const nonce = (0, nonce_1.getNonce)();
        return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
             font-src https://fonts.gstatic.com https://cdn.jsdelivr.net;
             script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${panelCssUri}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
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
exports.SidePanelProvider = SidePanelProvider;
//# sourceMappingURL=SidePanelProvider.js.map