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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const PdfEditorProvider_1 = require("./pdfEditor/PdfEditorProvider");
const SidePanelProvider_1 = require("./sidePanel/SidePanelProvider");
const translationService_1 = require("./services/translationService");
const journalService_1 = require("./services/journalService");
const glossaryService_1 = require("./services/glossaryService");
const historyService_1 = require("./services/historyService");
const configService_1 = require("./services/configService");
function activate(context) {
    console.log('春蝉插件已激活');
    // 初始化服务
    const translationService = new translationService_1.TranslationService(context);
    const journalService = new journalService_1.JournalService();
    const glossaryService = new glossaryService_1.GlossaryService(context);
    const historyService = new historyService_1.HistoryService(context);
    const configService = new configService_1.ConfigService();
    const sidePanel = new SidePanelProvider_1.SidePanelProvider(context, translationService, glossaryService, historyService, configService);
    // 注册 PDF 自定义编辑器
    const pdfProvider = new PdfEditorProvider_1.PdfEditorProvider(context, translationService, journalService, sidePanel, historyService, configService);
    sidePanel.onTranslatePageRequested = async (pageNumber, paragraphs) => {
        await pdfProvider.translateActivePage(pageNumber, paragraphs);
    };
    sidePanel.onGetPdfPagesTextRequested = (scope, customRange) => {
        pdfProvider.getPdfPagesText(scope, customRange);
    };
    sidePanel.onRefreshPageTextRequested = async () => {
        await pdfProvider.refreshActivePageText();
    };
    sidePanel.onPanelHoverRequested = async (id) => {
        pdfProvider.hoverActivePageElement(id);
    };
    sidePanel.onLayoutConfigChanged = async () => {
        pdfProvider.syncLayoutConfigToAllViewers();
        await pdfProvider.refreshActivePageText();
    };
    sidePanel.onJumpToPageRequested = (pageNumber) => {
        pdfProvider.jumpToActivePage(pageNumber);
    };
    sidePanel.onFindAndJumpToCaptionRequested = (query) => {
        pdfProvider.findAndJumpToCaption(query);
    };
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(PdfEditorProvider_1.PdfEditorProvider.viewType, pdfProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    }));
    // 注册命令：打开翻译面板
    context.subscriptions.push(vscode.commands.registerCommand('chunzen.openSidePanel', () => {
        sidePanel.show();
    }));
    // 注册命令：用春蝉 PDF 阅读器打开 PDF 文件
    context.subscriptions.push(vscode.commands.registerCommand('chunzen.openPdf', (uri) => {
        let targetUri = uri;
        if (!targetUri && vscode.window.activeTextEditor) {
            targetUri = vscode.window.activeTextEditor.document.uri;
        }
        if (!targetUri) {
            vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'PDF files': ['pdf'] }
            }).then(uris => {
                if (uris && uris.length > 0) {
                    vscode.commands.executeCommand('vscode.openWith', uris[0], PdfEditorProvider_1.PdfEditorProvider.viewType);
                }
            });
            return;
        }
        vscode.commands.executeCommand('vscode.openWith', targetUri, PdfEditorProvider_1.PdfEditorProvider.viewType);
    }));
    // 注册命令：清除缓存
    context.subscriptions.push(vscode.commands.registerCommand('chunzen.clearCache', () => {
        translationService.clearCache();
        sidePanel.syncCacheSize();
    }));
    // 注册命令：显示已配置的翻译引擎
    context.subscriptions.push(vscode.commands.registerCommand('chunzen.configureEngines', () => {
        const engines = translationService.getConfiguredEngines();
        if (engines.length === 0) {
            vscode.window.showWarningMessage('春蝉：尚未配置任何翻译引擎。请在设置中填入翻译 API Key。', '打开设置').then(choice => {
                if (choice === '打开设置') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'chunzen.translation');
                }
            });
        }
        else {
            vscode.window.showInformationMessage(`春蝉：已配置的翻译引擎：${engines.join('、')}`);
        }
    }));
    // 注册命令：自动识别并截图当前页图像区域
    context.subscriptions.push(vscode.commands.registerCommand('chunzen.captureFigureScreenshot', async () => {
        await pdfProvider.captureActiveFigureScreenshot();
    }));
    // 启动提示
    const engines = translationService.getConfiguredEngines();
    if (engines.length === 0) {
        vscode.window.showInformationMessage('春蝉已就绪！请配置翻译 API Key 以启用翻译功能。', '配置翻译引擎').then(choice => {
            if (choice === '配置翻译引擎') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'chunzen.translation');
            }
        });
    }
}
function deactivate() {
    console.log('春蝉插件已停用');
}
//# sourceMappingURL=extension.js.map