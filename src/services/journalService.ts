import { JournalInfo } from '../types';
import { customFetch } from '../utils/fetch';

/**
 * 期刊信息查询服务
 * 支持数据源：科研通 (AbleSci)、LetPub — 并支持双向自动灾备容灾
 */
export class JournalService {
  // 内存缓存（数据源:查询词 → 信息）
  private cache = new Map<string, JournalInfo>();

  /**
   * 按期刊名或 ISSN 查询期刊信息，优先使用设定的 source，出错或查无时自动 fallback
   */
  async query(journalNameOrIssn: string, preferredSource: 'ablesci' | 'letpub' = 'ablesci'): Promise<JournalInfo | undefined> {
    const queryStr = journalNameOrIssn.trim();
    if (!queryStr) return undefined;

    const cacheKey = `${preferredSource}:${queryStr.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    console.log(`[ChunZen] 查询期刊信息: "${queryStr}", 首选数据源: ${preferredSource}`);

    try {
      let info: JournalInfo | undefined;
      if (preferredSource === 'ablesci') {
        info = await this.fetchFromAblesci(queryStr);
      } else {
        info = await this.fetchFromLetpub(queryStr);
      }

      if (info) {
        this.cache.set(cacheKey, info);
        return info;
      }
    } catch (err) {
      console.warn(`[ChunZen] 首选数据源 ${preferredSource} 查询异常:`, err);
    }

    // 容灾机制：首选失败或无结果，尝试备用数据源
    const fallbackSource = preferredSource === 'ablesci' ? 'letpub' : 'ablesci';
    const fallbackCacheKey = `${fallbackSource}:${queryStr.toLowerCase()}`;
    
    if (this.cache.has(fallbackCacheKey)) {
      return this.cache.get(fallbackCacheKey);
    }

    console.log(`[ChunZen] 尝试备用数据源: ${fallbackSource}`);
    try {
      let info: JournalInfo | undefined;
      if (fallbackSource === 'ablesci') {
        info = await this.fetchFromAblesci(queryStr);
      } else {
        info = await this.fetchFromLetpub(queryStr);
      }

      if (info) {
        this.cache.set(fallbackCacheKey, info);
        // 也同步存入首选的缓存，防止下次重复请求
        this.cache.set(cacheKey, info);
        return info;
      }
    } catch (err) {
      console.warn(`[ChunZen] 备用数据源 ${fallbackSource} 查询也异常:`, err);
    }

    return undefined;
  }

  /**
   * 从 科研通 (AbleSci) 查询
   */
  private async fetchFromAblesci(query: string): Promise<JournalInfo | undefined> {
    const url = `https://www.ablesci.com/journal/index?keywords=${encodeURIComponent(query)}`;
    console.log(`[ChunZen] 请求科研通: ${url}`);
    
    const resp = await customFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://www.ablesci.com/journal'
      },
      signal: AbortSignal.timeout(35000)
    });

    if (!resp.ok) {
      throw new Error(`科研通请求失败: ${resp.status}`);
    }

    const html = await resp.text();
    const result = this.parseAblesciHtml(html, query);
    if (!result) return undefined;

    const { info, detailId } = result;
    info.url = detailId
      ? `https://www.ablesci.com/journal/detail?id=${detailId}`
      : url;

    if (detailId) {
      try {
        const detailUrl = `https://www.ablesci.com/journal/detail?id=${detailId}`;
        console.log(`[ChunZen] 请求科研通详情页: ${detailUrl}`);
        const detailResp = await customFetch(detailUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            Referer: url
          },
          signal: AbortSignal.timeout(20000)
        });

        if (detailResp.ok) {
          const detailHtml = await detailResp.text();
          this.parseAblesciDetailPage(detailHtml, info);
        } else {
          console.warn(`[ChunZen] 科研通详情页请求失败: ${detailResp.status}`);
        }
      } catch (err) {
        console.warn(`[ChunZen] 科研通详情页查询异常:`, err);
      }
    }

    return info;
  }

  /**
   * 从 LetPub 查询
   */
  private async fetchFromLetpub(query: string): Promise<JournalInfo | undefined> {
    const isIssn = /^\d{4}-\d{3}[\dX]$/i.test(query);
    const url = isIssn
      ? `https://www.letpub.com.cn/index.php?page=journalapp&view=query&journalname=&journalissn=${encodeURIComponent(query)}&searchname=Search`
      : `https://www.letpub.com.cn/index.php?page=journalapp&view=query&journalname=${encodeURIComponent(query)}&journalissn=&searchname=Search`;
    
    console.log(`[ChunZen] 请求LetPub: ${url}`);

    const resp = await customFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://www.letpub.com.cn/index.php?page=journalapp'
      },
      signal: AbortSignal.timeout(35000)
    });

    if (!resp.ok) {
      throw new Error(`LetPub 请求失败: ${resp.status}`);
    }

    const html = await resp.text();
    const info = this.parseLetpubHtml(html, query);
    if (info) {
      info.url = url;
    }
    return info;
  }

  /**
   * 解析科研通 HTML 页面
   */
  private parseAblesciHtml(html: string, originalQuery: string): { info: JournalInfo; detailId?: string } | undefined {
    if (html.includes('没有找到') || html.includes('No results') || !html.includes('search-results')) {
      return undefined;
    }

    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) return undefined;

    const rowMatch = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    if (!rowMatch) return undefined;

    const rowContent = rowMatch[1];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cols: string[] = [];
    let m;
    while ((m = tdRegex.exec(rowContent)) !== null) {
      cols.push(m[1].trim());
    }

    if (cols.length < 5) return undefined;

    const info: JournalInfo = { name: originalQuery };

    // Col 0: 期刊名称
    const fullNameMatch = cols[0].match(/class="journal-fullname"[^>]*>([\s\S]*?)<\/span>/i);
    if (fullNameMatch) {
      info.name = fullNameMatch[1].replace(/<[^>]+>/g, '').trim();
    } else {
      const linkMatch = cols[0].match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      info.name = linkMatch ? linkMatch[1].replace(/<[^>]+>/g, '').trim() : cols[0].replace(/<[^>]+>/g, '').trim();
    }

    // Col 1: ISSN
    info.issn = cols[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();

    // Col 2: 影响因子
    const ifSpanMatch = cols[2].match(/<span>([0-9.]+)/i);
    if (ifSpanMatch) {
      info.impactFactor = ifSpanMatch[1];
    } else {
      const rawText = cols[2].replace(/<[^>]+>/g, '').trim();
      const cleanIf = rawText.match(/^[0-9.]+/);
      info.impactFactor = cleanIf ? cleanIf[0] : rawText;
    }

    // Col 3: 新锐分区 大类
    const majorNum = cols[3].match(/class="cas-category-num"[^>]*>([\s\S]*?)<\/span>/i);
    const majorName = cols[3].match(/class="cas-category-name"[^>]*>([\s\S]*?)<\/span>/i);
    if (majorNum && majorName) {
      info.casRanking = `${majorNum[1].trim()} ${majorName[1].trim()}`;
    } else {
      info.casRanking = cols[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    // Col 4: 新锐分区 小类
    const minorNum = cols[4].match(/class="cas-category-num"[^>]*>([\s\S]*?)<\/span>/i);
    const minorName = cols[4].match(/class="cas-category-name"[^>]*>([\s\S]*?)<\/span>/i);
    if (minorNum && minorName) {
      info.casSubRanking = `${minorNum[1].trim()} ${minorName[1].trim()}`;
    } else {
      info.casSubRanking = cols[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    // Col 5: JCR分区
    if (cols.length >= 6) {
      const jcrMatch = cols[5].match(/Q[1-4]/i);
      if (jcrMatch) {
        info.jcrRanking = jcrMatch[0].toUpperCase();
      } else {
        info.jcrRanking = cols[5].replace(/<[^>]+>/g, '').trim();
      }
    }

    info.warning = '正常';
    info.journalSource = 'ablesci';

    const idMatch = rowContent.match(/detail\?id=([a-zA-Z0-9_-]+)/i);
    const detailId = idMatch ? idMatch[1] : undefined;

    return { info, detailId };
  }

  /**
   * 解析科研通详情页 HTML 并提取深度指标
   */
  private parseAblesciDetailPage(html: string, info: JournalInfo): void {
    const selfCitationMatch = html.match(/<td>\s*自引率\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (selfCitationMatch) {
      info.selfCitationRate = selfCitationMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    const submissionMatch = html.match(/<td>\s*投稿网址\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (submissionMatch) {
      const hrefMatch = submissionMatch[1].match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        info.submissionUrl = hrefMatch[1].trim();
      }
    }

    const publisherMatch = html.match(/<td>\s*出版商\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (publisherMatch) {
      info.publisher = publisherMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    const periodMatch = html.match(/<td>\s*出版周期\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (periodMatch) {
      info.publicationPeriod = periodMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    const reviewMatch = html.match(/<td>\s*平均审稿周期\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (reviewMatch) {
      let text = reviewMatch[1].replace(/<[^>]+>/g, '\n').trim();
      text = text.replace(/网友分享经验[：:]\s*/g, '').replace(/\n+/g, ' ').trim();
      info.reviewSpeed = text;
    }

    const acceptanceMatch = html.match(/<td>\s*平均录用比例\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (acceptanceMatch) {
      let text = acceptanceMatch[1].replace(/<[^>]+>/g, '\n').trim();
      text = text.replace(/网友分享经验[：:]\s*/g, '').replace(/\n+/g, ' ').trim();
      info.acceptanceRate = text;
    }
  }

  /**
   * 解析 LetPub HTML 页面
   */
  private parseLetpubHtml(html: string, originalQuery: string): JournalInfo | undefined {
    if (html.includes('没有找到') || html.includes('No results')) {
      return undefined;
    }

    const info: JournalInfo = { name: originalQuery };

    // 提取期刊名（第一个结果行）
    const nameMatch = html.match(/<td[^>]*>\s*<a[^>]*>([^<]{5,100})<\/a>\s*<\/td>/);
    if (nameMatch) {
      info.name = nameMatch[1].trim();
    }

    // 提取 ISSN
    const issnMatch = html.match(/(\d{4}-\d{3}[\dX])/);
    if (issnMatch) {
      info.issn = issnMatch[1];
    }

    // 提取影响因子
    const ifMatch = html.match(/影响因子[^>]*>([0-9.]+)/);
    if (!ifMatch) {
      const ifMatch2 = html.match(/Impact Factor[^>]*>\s*([0-9.]+)/i);
      if (ifMatch2) info.impactFactor = ifMatch2[1];
    } else {
      info.impactFactor = ifMatch[1];
    }

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

    info.journalSource = 'letpub';
    return info;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
