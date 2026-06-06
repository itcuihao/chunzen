"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoiResolver = void 0;
const fetch_1 = require("../utils/fetch");
/**
 * DOI 元数据解析器
 * 使用 CrossRef API 和 OpenAlex API 将 DOI 解析为期刊 ISSN 和名称，以及论文发布年份、作者及机构等元数据
 */
class DoiResolver {
    /**
     * 将 DOI 解析为期刊和论文元数据
     */
    static async resolveDoi(doi) {
        const cleanedDoi = doi.trim();
        if (!cleanedDoi)
            return {};
        try {
            console.log(`[ChunZen] 尝试通过 CrossRef 解析 DOI: ${cleanedDoi}`);
            const info = await this.fetchFromCrossRef(cleanedDoi);
            if (info.issn || info.journalName || info.firstAuthor) {
                return info;
            }
        }
        catch (err) {
            console.warn(`[ChunZen] CrossRef 解析失败, 尝试备用接口 OpenAlex:`, err);
        }
        try {
            console.log(`[ChunZen] 尝试通过 OpenAlex 解析 DOI: ${cleanedDoi}`);
            const info = await this.fetchFromOpenAlex(cleanedDoi);
            if (info.issn || info.journalName || info.firstAuthor) {
                return info;
            }
        }
        catch (err) {
            console.warn(`[ChunZen] OpenAlex 解析失败:`, err);
        }
        return {};
    }
    static async fetchFromCrossRef(doi) {
        const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
        const resp = await (0, fetch_1.customFetch)(url, {
            headers: {
                'User-Agent': 'ChunZenAcademicReader/1.0 (mailto:chunzen@example.com)'
            },
            signal: AbortSignal.timeout(5000)
        });
        if (!resp.ok) {
            throw new Error(`CrossRef response error: ${resp.status}`);
        }
        const data = (await resp.json());
        if (data.status === 'ok' && data.message) {
            const msg = data.message;
            const journalNames = msg['container-title'] || [];
            const issns = msg['ISSN'] || [];
            const res = {
                issn: issns[0],
                journalName: journalNames[0],
                paperSource: 'crossref'
            };
            // Publish Year
            const publishedPrint = msg['published-print'] || {};
            const publishedOnline = msg['published-online'] || {};
            const created = msg['created'] || {};
            const printYear = publishedPrint['date-parts']?.[0]?.[0];
            const onlineYear = publishedOnline['date-parts']?.[0]?.[0];
            const createdYear = created['date-parts']?.[0]?.[0];
            const year = printYear || onlineYear || createdYear;
            if (year) {
                res.publishYear = String(year);
            }
            // Authors and Affiliations
            const authors = msg['author'] || [];
            if (authors.length > 0) {
                // First Author
                const first = authors[0];
                res.firstAuthor = first ? `${first.given || ''} ${first.family || ''}`.trim() : undefined;
                if (first && Array.isArray(first.affiliation) && first.affiliation.length > 0) {
                    res.firstAuthorAffiliation = first.affiliation[0]?.name;
                }
                // Last Author
                const last = authors[authors.length - 1];
                res.lastAuthor = last ? `${last.given || ''} ${last.family || ''}`.trim() : undefined;
                if (last && Array.isArray(last.affiliation) && last.affiliation.length > 0) {
                    res.lastAuthorAffiliation = last.affiliation[0]?.name;
                }
            }
            return res;
        }
        return {};
    }
    static async fetchFromOpenAlex(doi) {
        const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`;
        const resp = await (0, fetch_1.customFetch)(url, {
            headers: {
                'User-Agent': 'ChunZenAcademicReader/1.0 (mailto:chunzen@example.com)'
            },
            signal: AbortSignal.timeout(5000)
        });
        if (!resp.ok) {
            throw new Error(`OpenAlex response error: ${resp.status}`);
        }
        const data = (await resp.json());
        const res = {
            paperSource: 'openalex'
        };
        const source = data.primary_location?.source;
        if (source) {
            const journalName = source.display_name;
            const issns = source.issn || [];
            res.issn = source.issn_l || issns[0];
            res.journalName = journalName;
        }
        // Publish Year
        if (data.publication_year) {
            res.publishYear = String(data.publication_year);
        }
        // Authors and Affiliations
        const authorships = data.authorships || [];
        if (authorships.length > 0) {
            const first = authorships.find((a) => a.author_position === 'first') || authorships[0];
            const last = authorships.find((a) => a.author_position === 'last') || authorships[authorships.length - 1];
            if (first?.author?.display_name) {
                res.firstAuthor = first.author.display_name;
                if (Array.isArray(first.institutions) && first.institutions.length > 0) {
                    res.firstAuthorAffiliation = first.institutions[0]?.display_name;
                }
                else if (first.raw_affiliation_string) {
                    res.firstAuthorAffiliation = first.raw_affiliation_string;
                }
            }
            if (last?.author?.display_name) {
                res.lastAuthor = last.author.display_name;
                if (Array.isArray(last.institutions) && last.institutions.length > 0) {
                    res.lastAuthorAffiliation = last.institutions[0]?.display_name;
                }
                else if (last.raw_affiliation_string) {
                    res.lastAuthorAffiliation = last.raw_affiliation_string;
                }
            }
        }
        return res;
    }
}
exports.DoiResolver = DoiResolver;
//# sourceMappingURL=doiResolver.js.map