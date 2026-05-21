import { JournalInfo } from '../types';

/**
 * 期刊信息查询服务
 * 数据来源：LetPub（www.letpub.com.cn） — 免费公开数据
 */
export class JournalService {
  // 内存缓存（期刊名 → 信息）
  private cache = new Map<string, JournalInfo>();

  /**
   * 按期刊名或 ISSN 查询期刊信息
   */
  async query(journalNameOrIssn: string): Promise<JournalInfo | undefined> {
    const key = journalNameOrIssn.trim().toLowerCase();
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const info = await this.fetchFromLetpub(journalNameOrIssn);
      if (info) {
        this.cache.set(key, info);
      }
      return info;
    } catch (err) {
      console.warn('LetPub 查询失败:', err);
      return undefined;
    }
  }

  private async fetchFromLetpub(query: string): Promise<JournalInfo | undefined> {
    // LetPub 查询接口
    const url = `https://www.letpub.com.cn/index.php?page=journalapp&view=query&journalname=${encodeURIComponent(query)}&journalissn=&searchname=Search`;

    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://www.letpub.com.cn/index.php?page=journalapp'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      throw new Error(`LetPub 请求失败: ${resp.status}`);
    }

    const html = await resp.text();
    return this.parseLetpubHtml(html, query);
  }

  private parseLetpubHtml(html: string, originalQuery: string): JournalInfo | undefined {
    // 解析 LetPub 表格结果
    // 典型结构：<tr> 包含期刊名、ISSN、IF、中科院分区、JCR 分区等

    // 检测是否有结果
    if (html.includes('没有找到') || html.includes('No results')) {
      return undefined;
    }

    const info: JournalInfo = { name: originalQuery };

    // 提取期刊名（第一个结果行）
    const nameMatch = html.match(/<td[^>]*>\s*<a[^>]*>([^<]{5,100})<\/a>\s*<\/td>/);
    if (nameMatch) {
      info.name = nameMatch[1].trim();
    }

    // 提取 ISSN（格式：XXXX-XXXX）
    const issnMatch = html.match(/(\d{4}-\d{3}[\dX])/);
    if (issnMatch) {
      info.issn = issnMatch[1];
    }

    // 提取影响因子（IF）
    const ifMatch = html.match(/影响因子[^>]*>([0-9.]+)/);
    if (!ifMatch) {
      // 英文版
      const ifMatch2 = html.match(/Impact Factor[^>]*>\s*([0-9.]+)/i);
      if (ifMatch2) info.impactFactor = ifMatch2[1];
    } else {
      info.impactFactor = ifMatch[1];
    }

    // 如果上面的匹配失败，尝试更宽松的 IF 提取
    if (!info.impactFactor) {
      const ifLoose = html.match(/>\s*(\d+\.\d+)\s*<\/td>/);
      if (ifLoose) {
        info.impactFactor = ifLoose[1];
      }
    }

    // 提取中科院分区
    const casPatterns = [
      /中科院[^>]*>[^<]*([一二三四]区)/,
      /CAS[^>]*>[^<]*([一二三四]区)/i,
      /(大类|小类)[^>]*>[^<]*([一二三四]区)/
    ];
    for (const p of casPatterns) {
      const m = html.match(p);
      if (m) {
        info.casRanking = m[m.length - 1];
        break;
      }
    }

    // 提取 JCR 分区 Q1~Q4
    const jcrMatch = html.match(/Q([1-4])/);
    if (jcrMatch) {
      info.jcrRanking = `Q${jcrMatch[1]}`;
    }

    // 提取预警信息
    if (html.includes('预警')) {
      info.warning = html.includes('正常') ? '正常' : '预警';
    }

    return info;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
