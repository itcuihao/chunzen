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
const nonce_1 = require("../utils/nonce");
class SidePanelProvider {
    static viewType = 'chunzen.sidePanel';
    panel;
    context;
    translationService;
    glossaryService;
    historyService;
    configService;
    constructor(context, translationService, glossaryService, historyService, configService) {
        this.context = context;
        this.translationService = translationService;
        this.glossaryService = glossaryService;
        this.historyService = historyService;
        this.configService = configService;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }
        this.panel = vscode.window.createWebviewPanel(SidePanelProvider.viewType, '春蝉 — 翻译 & 期刊信息', vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ],
            retainContextWhenHidden: true
        });
        this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.webview.onDidReceiveMessage(async (msg) => {
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
                case 'import-glossary':
                    vscode.window.showInformationMessage('术语导入功能即将推出');
                    break;
                case 'export-translations':
                    await this.handleExport(msg.format);
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
        this.panel?.webview.postMessage(msg);
    }
    updateTranslation(original, translated, engine, cached) {
        this.postMessage({ type: 'translate-result', original, translated, engine, cached });
    }
    updateJournal(info) {
        this.postMessage({ type: 'update-journal', info });
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
            journalSource: { type: 'letpub' },
            cacheMaxSize: this.configService.getCacheConfig().maxSize
        });
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
            const result = await this.translationService.translate('test sentence');
            this.postMessage({
                type: 'engine-test-result',
                engineName,
                success: true,
                message: `test: ${result.text}`
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
exports.SidePanelProvider = SidePanelProvider;
//# sourceMappingURL=SidePanelProvider.js.map