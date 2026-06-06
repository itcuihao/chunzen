import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { PDFDocument } from 'pdf-lib';
import { MineruConfig } from '../types/config';
import { customFetch } from '../utils/fetch';

export class MineruService {
  private async slicePdf(pdfPath: string, maxPages: number): Promise<string> {
    try {
      const fileBuffer = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pageCount = pdfDoc.getPageCount();

      if (pageCount <= maxPages) {
        return pdfPath;
      }

      const subPdfDoc = await PDFDocument.create();
      const pagesToCopy = Array.from({ length: Math.min(pageCount, maxPages) }, (_, i) => i);
      const copiedPages = await subPdfDoc.copyPages(pdfDoc, pagesToCopy);
      copiedPages.forEach((page: any) => subPdfDoc.addPage(page));

      const subPdfBytes = await subPdfDoc.save();
      const tempDir = os.tmpdir();
      const slicedPdfPath = path.join(tempDir, `sliced_${Date.now()}_${path.basename(pdfPath)}`);
      fs.writeFileSync(slicedPdfPath, subPdfBytes);
      return slicedPdfPath;
    } catch (err: any) {
      console.warn('[ChunZen] pdf-lib 截取 PDF 页面失败，回退到原文件:', err.message);
      return pdfPath;
    }
  }

  /**
   * Parse a PDF file using MinerU API (Agent or Standard modes)
   * @param pdfPath Local file path or remote URL
   * @param config Mineru configuration settings
   * @param onProgress Callback for status updates
   */
  async parsePdf(
    pdfPath: string,
    config: MineruConfig,
    onProgress: (status: 'parsing', progress: number, message: string) => void
  ): Promise<string> {
    const isUrl = /^(https?:\/\/)/i.test(pdfPath);
    const fileName = path.basename(pdfPath);
    
    const apiType = config.apiType || 'agent';
    const token = config.token || '';

    if (apiType === 'standard' && !token) {
      throw new Error('Standard 精准解析模式下必须填入 API Token！请在侧边栏“设置”中配置。');
    }

    if (apiType === 'agent') {
      return this.parseWithAgent(pdfPath, isUrl, fileName, onProgress);
    } else {
      return this.parseWithStandard(pdfPath, isUrl, fileName, token, onProgress);
    }
  }

  private async parseWithAgent(
    pdfPath: string,
    isUrl: boolean,
    fileName: string,
    onProgress: (status: 'parsing', progress: number, message: string) => void
  ): Promise<string> {
    onProgress('parsing', 5, '正在向 MinerU Agent 提交解析任务...');
    let taskId = '';
    let targetUploadPath = pdfPath;
    let isSliced = false;

    if (!isUrl) {
      onProgress('parsing', 7, '自动优化解析范围 (免费版截取前 5 页)...');
      targetUploadPath = await this.slicePdf(pdfPath, 5);
      isSliced = targetUploadPath !== pdfPath;
    }

    try {
      const maxRetries = 3;
      if (isUrl) {
        let response;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            response = await customFetch('https://mineru.net/api/v1/agent/parse/url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: pdfPath,
                language: 'ch',
                enable_table: true,
                is_ocr: false,
                enable_formula: true
              })
            });
            if (response.ok) break;
          } catch (e) {
            if (attempt === maxRetries) throw e;
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        if (!response || !response.ok) {
          throw new Error(`MinerU Agent 接口提交失败: ${response ? response.status : '网络错误'}`);
        }

        const res = (await response.json()) as any;
        if (res.code !== 0) {
          throw new Error(`MinerU Agent 接口返回错误: ${res.msg}`);
        }
        taskId = res.data.task_id;
      } else {
        // Local file upload
        onProgress('parsing', 10, '申请文件上传链接...');
        let response;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            response = await customFetch('https://mineru.net/api/v1/agent/parse/file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file_name: path.basename(targetUploadPath),
                language: 'ch',
                enable_table: true,
                is_ocr: false,
                enable_formula: true
              })
            });
            if (response.ok) break;
          } catch (e) {
            if (attempt === maxRetries) throw e;
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        if (!response || !response.ok) {
          throw new Error(`MinerU Agent 接口提交失败: ${response ? response.status : '网络错误'}`);
        }

        const res = (await response.json()) as any;
        if (res.code !== 0) {
          throw new Error(`MinerU Agent 接口返回错误: ${res.msg}`);
        }

        taskId = res.data.task_id;
        const uploadUrl = res.data.file_url;

        onProgress('parsing', 15, '正在读取本地 PDF 文件...');
        const fileBuffer = fs.readFileSync(targetUploadPath);

        onProgress('parsing', 20, '正在上传 PDF 文件到云端...');
        let uploadResponse;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            uploadResponse = await customFetch(uploadUrl, {
              method: 'PUT',
              body: fileBuffer
            });
            if (uploadResponse.ok) break;
          } catch (e) {
            if (attempt === maxRetries) throw e;
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        if (!uploadResponse || !uploadResponse.ok) {
          throw new Error(`文件上传失败: ${uploadResponse ? uploadResponse.status : '网络错误'}`);
        }
      }

      return await this.pollAgentTask(taskId, onProgress);
    } finally {
      if (isSliced && fs.existsSync(targetUploadPath)) {
        try {
          fs.unlinkSync(targetUploadPath);
        } catch (e) {
          console.error('清理临时 PDF 文件失败:', e);
        }
      }
    }
  }

  private async pollAgentTask(
    taskId: string,
    onProgress: (status: 'parsing', progress: number, message: string) => void
  ): Promise<string> {
    const maxRetries = 120; // Allow polling up to ~6 minutes
    const intervalMs = 3000;
    onProgress('parsing', 30, '云端解析排队中...');

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      const response = await customFetch(`https://mineru.net/api/v1/agent/parse/${taskId}`);
      if (!response.ok) continue;

      const res = (await response.json()) as any;
      if (res.code !== 0) {
        throw new Error(`查询解析状态返回错误: ${res.msg}`);
      }

      const state = res.data.state;
      if (state === 'done') {
        onProgress('parsing', 95, '正在下载高精度 Markdown 结果...');
        const mdUrl = res.data.markdown_url;
        let mdResponse;
        try {
          mdResponse = await customFetch(mdUrl);
        } catch (fetchErr: any) {
          throw new Error(`下载 Markdown 结果网络连接失败。请检查您的网络或代理是否能正常访问域名 cdn-mineru.openxlab.org.cn。原因: ${fetchErr.message}`);
        }

        if (!mdResponse.ok) {
          throw new Error(`下载 Markdown 结果失败: ${mdResponse.status} ${mdResponse.statusText}`);
        }
        return await mdResponse.text();
      } else if (state === 'failed') {
        throw new Error(`云端解析失败: ${res.data.err_msg || '未知错误'}`);
      } else if (state === 'running') {
        onProgress('parsing', 60 + Math.min(30, i * 2), '云端正在进行 AI 格式化重构中...');
      } else if (state === 'pending') {
        onProgress('parsing', 35 + Math.min(20, i * 1.5), '云端解析排队中...');
      } else if (state === 'uploading') {
        onProgress('parsing', 25, '文件传输中...');
      }
    }

    throw new Error('云端解析超时，请稍后重试');
  }

  private async parseWithStandard(
    pdfPath: string,
    isUrl: boolean,
    fileName: string,
    token: string,
    onProgress: (status: 'parsing', progress: number, message: string) => void
  ): Promise<string> {
    onProgress('parsing', 5, '正在提交 Standard 解析任务...');
    let taskId = '';
    let batchId = '';

    if (isUrl) {
      const response = await customFetch('https://mineru.net/api/v4/extract/task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: pdfPath,
          model_version: 'vlm'
        })
      });

      if (!response.ok) {
        throw new Error(`MinerU Standard 接口提交失败: ${response.status} ${response.statusText}`);
      }

      const res = (await response.json()) as any;
      if (res.code !== 0) {
        throw new Error(`MinerU Standard 接口返回错误: ${res.msg}`);
      }
      taskId = res.data.task_id;
    } else {
      // Local file upload in standard mode
      onProgress('parsing', 10, '申请 Standard 文件上传链接...');
      const response = await customFetch('https://mineru.net/api/v4/file-urls/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          files: [
            { name: fileName, data_id: 'chunzen_pdf_' + Date.now() }
          ],
          model_version: 'vlm'
        })
      });

      if (!response.ok) {
        throw new Error(`Standard 接口申请上传失败: ${response.status} ${response.statusText}`);
      }

      const res = (await response.json()) as any;
      if (res.code !== 0) {
        throw new Error(`Standard 接口申请返回错误: ${res.msg}`);
      }

      batchId = res.data.batch_id;
      const uploadUrl = res.data.file_urls[0];

      onProgress('parsing', 15, '正在读取本地 PDF 文件...');
      const fileBuffer = fs.readFileSync(pdfPath);

      onProgress('parsing', 20, '正在上传 PDF 文件 (Standard Mode)...');
      const uploadResponse = await customFetch(uploadUrl, {
        method: 'PUT',
        body: fileBuffer
      });

      if (!uploadResponse.ok) {
        throw new Error(`Standard 文件上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }
    }

    if (isUrl) {
      return this.pollStandardTask(taskId, token, onProgress);
    } else {
      return this.pollStandardBatch(batchId, token, onProgress);
    }
  }

  private async pollStandardTask(
    taskId: string,
    token: string,
    onProgress: (status: 'parsing', progress: number, message: string) => void
  ): Promise<string> {
    const maxRetries = 120;
    const intervalMs = 3000;
    onProgress('parsing', 30, '云端 Standard 解析排队中...');

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      const response = await customFetch(`https://mineru.net/api/v4/extract/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) continue;

      const res = (await response.json()) as any;
      if (res.code !== 0) {
        throw new Error(`查询解析状态返回错误: ${res.msg}`);
      }

      const state = res.data.state;
      if (state === 'done') {
        onProgress('parsing', 90, '正在下载结果压缩包并重构排版...');
        const zipUrl = res.data.full_zip_url;
        return this.downloadAndUnzip(zipUrl);
      } else if (state === 'failed') {
        throw new Error(`Standard 解析失败: ${res.data.err_msg || '未知错误'}`);
      } else if (state === 'running') {
        const progress = res.data.extract_progress;
        const pageText = progress 
          ? ` (已解析 ${progress.extracted_pages}/${progress.total_pages} 页)`
          : '';
        onProgress('parsing', 60 + Math.min(25, i * 2), `云端 Standard 正在解析中${pageText}...`);
      } else if (state === 'pending') {
        onProgress('parsing', 35 + Math.min(20, i * 1.5), '云端 Standard 解析排队中...');
      }
    }

    throw new Error('Standard 云端解析超时');
  }

  private async pollStandardBatch(
    batchId: string,
    token: string,
    onProgress: (status: 'parsing', progress: number, message: string) => void
  ): Promise<string> {
    const maxRetries = 120;
    const intervalMs = 3000;
    onProgress('parsing', 30, '云端 Standard 批处理排队中...');

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      const response = await customFetch(`https://mineru.net/api/v4/extract-results/batch/${batchId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) continue;

      const res = (await response.json()) as any;
      if (res.code !== 0) {
        throw new Error(`查询批处理状态返回错误: ${res.msg}`);
      }

      const result = res.data.extract_result[0];
      if (!result) continue;

      const state = result.state;
      if (state === 'done') {
        onProgress('parsing', 90, '正在下载结果压缩包并重构排版...');
        const zipUrl = result.full_zip_url;
        return this.downloadAndUnzip(zipUrl);
      } else if (state === 'failed') {
        throw new Error(`Standard 批解析失败: ${result.err_msg || '未知错误'}`);
      } else if (state === 'running') {
        const progress = result.extract_progress;
        const pageText = progress 
          ? ` (已解析 ${progress.extracted_pages}/${progress.total_pages} 页)`
          : '';
        onProgress('parsing', 60 + Math.min(25, i * 2), `云端 Standard 正在解析中${pageText}...`);
      } else if (state === 'pending') {
        onProgress('parsing', 35 + Math.min(20, i * 1.5), '云端 Standard 解析排队中...');
      }
    }

    throw new Error('Standard 批解析超时');
  }

  private async downloadAndUnzip(zipUrl: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempZipPath = path.join(tempDir, `mineru_${Date.now()}.zip`);

    try {
      let response;
      try {
        response = await customFetch(zipUrl);
      } catch (fetchErr: any) {
        throw new Error(`下载 ZIP 结果文件网络连接失败。请检查您的网络或代理是否能正常访问域名 cdn-mineru.openxlab.org.cn。原因: ${fetchErr.message}`);
      }

      if (!response.ok) {
        throw new Error(`无法下载 ZIP 结果文件: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(tempZipPath, Buffer.from(buffer));

      return new Promise<string>((resolve, reject) => {
        // macOS handles unzip command directly, extracting only the full.md contents to stdout
        exec(`unzip -p "${tempZipPath}" "*full.md"`, { maxBuffer: 1024 * 1024 * 25 }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`解压 full.md 失败: ${error.message}. stderr: ${stderr}`));
          } else {
            resolve(stdout);
          }
        });
      });
    } finally {
      try {
        if (fs.existsSync(tempZipPath)) {
          fs.unlinkSync(tempZipPath);
        }
      } catch (err) {
        console.error('清理临时 ZIP 文件失败:', err);
      }
    }
  }
}
