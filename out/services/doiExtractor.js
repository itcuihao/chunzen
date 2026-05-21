"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoiExtractor = void 0;
/**
 * DOI / ISSN / 期刊名提取器
 * 从 PDF 首页文字中识别论文元数据
 */
class DoiExtractor {
    // DOI 正则：10.xxxx/xxx
    static DOI_REGEX = /\b(10\.\d{4,9}\/[^\s"<>{}|\\^`\[\]]+)/gi;
    // ISSN 正则：XXXX-XXXX
    static ISSN_REGEX = /\b(\d{4}-\d{3}[\dX])\b/gi;
    static extractDoi(text) {
        const matches = text.match(this.DOI_REGEX);
        if (!matches)
            return undefined;
        // 清理末尾标点
        return matches[0].replace(/[.,;)\]]+$/, '');
    }
    static extractIssn(text) {
        const matches = text.match(this.ISSN_REGEX);
        return matches ? [...new Set(matches)] : [];
    }
    /**
     * 从 PDF 首页文字尝试提取期刊名
     * 策略：寻找常见期刊名模式（通常在论文顶部，格式如 "Nature Methods" 等）
     */
    static extractJournalName(text) {
        // 取前 500 字符，通常期刊名在此范围内
        const head = text.slice(0, 500);
        // 尝试匹配常见期刊名格式
        const patterns = [
            /(?:Journal of|Proceedings of|IEEE|ACM|Nature|Science|Cell|PNAS|PLOS)\s+[\w\s]+/i,
            /(?:^|\n)([A-Z][A-Za-z\s&]+(?:Journal|Review|Letters|Reports|Communications|Transactions|Proceedings))/m,
        ];
        for (const pattern of patterns) {
            const match = head.match(pattern);
            if (match) {
                return match[0].trim().replace(/\s+/g, ' ');
            }
        }
        return undefined;
    }
    /**
     * 综合提取：返回 DOI、ISSN 列表、可能的期刊名
     */
    static extract(text) {
        return {
            doi: this.extractDoi(text),
            issns: this.extractIssn(text),
            journal: this.extractJournalName(text)
        };
    }
}
exports.DoiExtractor = DoiExtractor;
//# sourceMappingURL=doiExtractor.js.map