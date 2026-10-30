import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExtToPanelMessage } from '../types/messages';
import { MineruConfig } from '../types/config';
import { MineruService } from '../services/mineruService';

/**
 * MinerU 解析调度 — 管理解析缓存与进行中任务，并把进度推送给侧边栏。
 * 功能当前整体停用（入口已从 UI 移除），逻辑保留以便恢复。
 */
export class MineruCoordinator {
  private mineruService = new MineruService();
  private mineruCache = new Map<string, string>();
  private activeMineruTaskUri: string | null = null;

  constructor(
    private getConfig: () => MineruConfig,
    private post: (msg: ExtToPanelMessage) => void,
    private getActivePdfUri: () => string | undefined
  ) {}

  async parse(uriStr: string, force: boolean = false): Promise<void> {
    const config = this.getConfig();
    if (!config.enable && !force) return;

    if (force) {
      this.activeMineruTaskUri = null;
      this.mineruCache.delete(uriStr);
    }

    if (this.mineruCache.has(uriStr)) {
      const cachedMd = this.mineruCache.get(uriStr)!;
      this.post({
        type: 'mineru-complete',
        markdown: cachedMd
      });
      return;
    }

    if (this.activeMineruTaskUri === uriStr) {
      return;
    }

    this.activeMineruTaskUri = uriStr;
    this.post({
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
        const agentPromise = this.mineruService.parsePdf(
          targetPath,
          { ...config, apiType: 'agent' },
          (status, progress, message) => {
            if (!standardCompleted) {
              this.post({
                type: 'mineru-status',
                status: 'parsing',
                progress: Math.min(60, Math.round(progress * 0.6)), // Scale down agent progress
                message: `[极速通道] ${message}`
              });
            }
          }
        ).then(markdown => {
          agentCompleted = true;
          if (!standardCompleted) {
            console.log(`[ChunZen] 极速通道 (Agent API) 率先解析完成，渲染临时 AI 增强视图`);
            this.mineruCache.set(uriStr, markdown);
            this.post({
              type: 'mineru-complete',
              markdown
            });
          }
        }).catch(err => {
          console.warn('[ChunZen] 极速通道 (Agent API) 失败，继续等待精度通道...', err.message);
        });

        // Route 2: Standard API (High precision VLM)
        const standardPromise = this.mineruService.parsePdf(
          targetPath,
          config,
          (status, progress, message) => {
            this.post({
              type: 'mineru-status',
              status: 'parsing',
              progress,
              message: `[精度通道] ${message}`
            });
          }
        ).then(markdown => {
          standardCompleted = true;
          console.log(`[ChunZen] 精度通道 (Standard VLM) 解析完成，自动无缝覆盖升级为最高质量版面`);
          this.mineruCache.set(uriStr, markdown);
          this.post({
            type: 'mineru-complete',
            markdown
          });
        }).catch(err => {
          standardCompleted = true;
          console.error('[ChunZen] 精度通道 (Standard VLM) 失败:', err);
          if (!agentCompleted) {
            this.post({
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

      } else {
        // Single path execution
        console.log(`[ChunZen] 启动 MinerU 单路解析 (${apiType} 模式)`);
        const markdown = await this.mineruService.parsePdf(
          targetPath,
          config,
          (status, progress, message) => {
            this.post({
              type: 'mineru-status',
              status: 'parsing',
              progress,
              message
            });
          }
        );

        this.mineruCache.set(uriStr, markdown);
        if (this.getActivePdfUri() === uriStr) {
          this.post({
            type: 'mineru-complete',
            markdown
          });
        }
        if (this.activeMineruTaskUri === uriStr) {
          this.activeMineruTaskUri = null;
        }
      }

    } catch (err: any) {
      console.error('[ChunZen] MinerU 解析出错:', err);
      if (this.getActivePdfUri() === uriStr) {
        this.post({
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
}
