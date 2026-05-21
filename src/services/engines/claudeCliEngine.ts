import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TranslationEngine } from '../../types';

const execFileAsync = promisify(execFile);

/**
 * Claude CLI 翻译引擎（使用 claude -p 命令）
 */
export class ClaudeCliEngine implements TranslationEngine {
  name = 'claudeCli';
  displayName = 'Claude CLI';

  isConfigured(): boolean {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.claudeCli');
    return cfg.get<boolean>('enabled', false);
  }

  async translate(text: string): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('chunzen.translation.claudeCli');
    const enabled = cfg.get<boolean>('enabled', false);
    const prompt = cfg.get<string>('prompt', '将以下学术英文翻译为中文，只输出译文：');

    if (!enabled) {
      throw new Error('Claude CLI 未启用');
    }

    const fullPrompt = `${prompt}\n\n${text}`;

    try {
      const { stdout } = await execFileAsync('claude', ['-p', fullPrompt], {
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });
      return stdout.trim();
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'ENOENT') {
        throw new Error('未找到 claude 命令，请确认已安装 Claude CLI');
      }
      throw new Error(`Claude CLI 执行失败: ${error.message}`);
    }
  }
}
