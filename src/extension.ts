import * as vscode from 'vscode';
import { PdfEditorProvider } from './pdfEditor/PdfEditorProvider';
import { SidePanelProvider } from './sidePanel/SidePanelProvider';
import { TranslationService } from './services/translationService';
import { JournalService } from './services/journalService';
import { GlossaryService } from './services/glossaryService';
import { HistoryService } from './services/historyService';
import { ConfigService } from './services/configService';

export function activate(context: vscode.ExtensionContext) {
  console.log('春蝉插件已激活');

  // 初始化服务
  const translationService = new TranslationService(context);
  const journalService = new JournalService();
  const glossaryService = new GlossaryService(context);
  const historyService = new HistoryService(context);
  const configService = new ConfigService();
  const sidePanel = new SidePanelProvider(
    context,
    translationService,
    glossaryService,
    historyService,
    configService
  );

  // 注册 PDF 自定义编辑器
  const pdfProvider = new PdfEditorProvider(
    context,
    translationService,
    journalService,
    sidePanel,
    historyService,
    configService
  );

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

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PdfEditorProvider.viewType,
      pdfProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );

  // 注册命令：打开翻译面板
  context.subscriptions.push(
    vscode.commands.registerCommand('chunzen.openSidePanel', () => {
      sidePanel.show();
    })
  );

  // 注册命令：用春蝉 PDF 阅读器打开 PDF 文件
  context.subscriptions.push(
    vscode.commands.registerCommand('chunzen.openPdf', (uri?: vscode.Uri) => {
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
            vscode.commands.executeCommand('vscode.openWith', uris[0], PdfEditorProvider.viewType);
          }
        });
        return;
      }
      vscode.commands.executeCommand('vscode.openWith', targetUri, PdfEditorProvider.viewType);
    })
  );

  // 注册命令：清除缓存
  context.subscriptions.push(
    vscode.commands.registerCommand('chunzen.clearCache', () => {
      translationService.clearCache();
      sidePanel.syncCacheSize();
    })
  );

  // 注册命令：显示已配置的翻译引擎
  context.subscriptions.push(
    vscode.commands.registerCommand('chunzen.configureEngines', () => {
      const engines = translationService.getConfiguredEngines();
      if (engines.length === 0) {
        vscode.window.showWarningMessage(
          '春蝉：尚未配置任何翻译引擎。请在设置中填入翻译 API Key。',
          '打开设置'
        ).then(choice => {
          if (choice === '打开设置') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'chunzen.translation'
            );
          }
        });
      } else {
        vscode.window.showInformationMessage(
          `春蝉：已配置的翻译引擎：${engines.join('、')}`
        );
      }
    })
  );

  // 注册命令：自动识别并截图当前页图像区域
  context.subscriptions.push(
    vscode.commands.registerCommand('chunzen.captureFigureScreenshot', async () => {
      await pdfProvider.captureActiveFigureScreenshot();
    })
  );

  // 启动提示
  const engines = translationService.getConfiguredEngines();
  if (engines.length === 0) {
    vscode.window.showInformationMessage(
      '春蝉已就绪！请配置翻译 API Key 以启用翻译功能。',
      '配置翻译引擎'
    ).then(choice => {
      if (choice === '配置翻译引擎') {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'chunzen.translation'
        );
      }
    });
  }
}

export function deactivate() {
  console.log('春蝉插件已停用');
}
