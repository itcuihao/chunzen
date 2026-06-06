"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationTab = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
const lucide_react_1 = require("lucide-react");
const vscode_1 = require("../vscode");
// @ts-ignore
const marked_1 = require("marked");
const katex_1 = __importDefault(require("katex"));
function renderMathInText(text) {
    let processed = text;
    // Protect display math $$ ... $$
    processed = processed.replace(/\$\$(.+?)\$\$/gs, (match, equation) => {
        try {
            return katex_1.default.renderToString(equation.trim(), { displayMode: true, throwOnError: false });
        }
        catch (e) {
            return match;
        }
    });
    // Protect inline math $ ... $
    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, equation) => {
        try {
            return katex_1.default.renderToString(equation.trim(), { displayMode: false, throwOnError: false });
        }
        catch (e) {
            return match;
        }
    });
    return processed;
}
function protectMathAndCitations(text) {
    const maths = [];
    const citations = [];
    let protectedText = text.replace(/\$\$(.+?)\$\$/gs, (match) => {
        maths.push(match);
        return `[[CZDISPLAYMATH_${maths.length - 1}]]`;
    });
    protectedText = protectedText.replace(/\$([^$\n]+?)\$/g, (match) => {
        maths.push(match);
        return `[[CZINLINEMATH_${maths.length - 1}]]`;
    });
    protectedText = protectedText.replace(/\[\d+(?:\s*[-–,]\s*\d+)*\]/g, (match) => {
        citations.push(match);
        return `[[CZCITATION_${citations.length - 1}]]`;
    });
    return { protectedText, maths, citations };
}
function restoreMathAndCitations(translatedText, maths, citations) {
    let restored = translatedText;
    restored = restored.replace(/\[\[CZDISPLAYMATH_(\d+)\]\]/g, (match, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return maths[idx] !== undefined ? maths[idx] : match;
    });
    restored = restored.replace(/\[\[CZINLINEMATH_(\d+)\]\]/g, (match, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return maths[idx] !== undefined ? maths[idx] : match;
    });
    restored = restored.replace(/\[\[CZCITATION_(\d+)\]\]/g, (match, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return citations[idx] !== undefined ? citations[idx] : match;
    });
    return restored;
}
function restoreMathAndCitationsFallback(translatedText, originalText) {
    const { maths, citations } = protectMathAndCitations(originalText);
    return restoreMathAndCitations(translatedText, maths, citations);
}
function applyHighlightsToMineruText(text, paragraphId, highlights) {
    const paraHighlights = highlights.filter(hl => hl.paragraphId === paragraphId && text.includes(hl.text));
    if (paraHighlights.length === 0)
        return text;
    const sorted = [...paraHighlights].sort((a, b) => b.text.length - a.text.length);
    let result = text;
    for (const hl of sorted) {
        const escapedText = hl.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');
        const colorsMap = {
            yellow: 'bg-amber-100 dark:bg-amber-950/40 border-b-2 border-amber-400/80 text-foreground',
            green: 'bg-emerald-100 dark:bg-emerald-950/40 border-b-2 border-emerald-400/80 text-foreground',
            blue: 'bg-sky-100 dark:bg-sky-950/40 border-b-2 border-sky-400/80 text-foreground',
            purple: 'bg-purple-100 dark:bg-purple-950/40 border-b-2 border-purple-400/80 text-foreground'
        };
        const colorClass = colorsMap[hl.color] || colorsMap.yellow;
        const noteBadge = hl.note ? '<span class="inline-flex items-center ml-0.5 select-none text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-600 rounded px-0.5 font-sans leading-none transform scale-90 origin-left">✍️</span>' : '';
        result = result.replace(regex, `<span class="${colorClass} cursor-pointer hover:opacity-90 transition-all px-0.5 rounded-sm relative inline" data-highlight-id="${hl.id}" title="${hl.note ? `批注: ${hl.note}` : '点击查看/修改高亮'}">${hl.text}${noteBadge}</span>`);
    }
    return result;
}
function applyJumpLinksToMineruText(text, bibliography) {
    if (!text)
        return '';
    const preprocessed = preprocessLinks(text);
    const jumpRegex = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table|图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|((?:图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)/gi;
    return preprocessed.replace(jumpRegex, (match, p1, p2, p3, p4) => {
        if (p1) {
            const keysStr = p1;
            const keys = [];
            const subParts = keysStr.split(',');
            for (const subPart of subParts) {
                const trimmed = subPart.trim();
                if (trimmed.includes('-') || trimmed.includes('–')) {
                    const hyphen = trimmed.includes('-') ? '-' : '–';
                    const [startStr, endStr] = trimmed.split(hyphen);
                    const start = parseInt(startStr.trim(), 10);
                    const end = parseInt(endStr.trim(), 10);
                    if (!isNaN(start) && !isNaN(end)) {
                        const low = Math.min(start, end);
                        const high = Math.max(start, end);
                        for (let i = low; i <= high; i++) {
                            keys.push(String(i));
                        }
                    }
                }
                else {
                    const key = parseInt(trimmed, 10);
                    if (!isNaN(key)) {
                        keys.push(String(key));
                    }
                }
            }
            let rendered = '[';
            keys.forEach((key, idx) => {
                const hasRef = bibliography[key];
                if (idx > 0)
                    rendered += ',';
                if (hasRef) {
                    rendered += `<span class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-mono font-bold px-0.5" data-jump-citation="${key}" title="跳转到文献 [${key}]">${key}</span>`;
                }
                else {
                    rendered += `<span class="text-zinc-600 dark:text-zinc-400 font-mono px-0.5">${key}</span>`;
                }
            });
            rendered += ']';
            return rendered;
        }
        else {
            const query = (p2 || p3 || p4).trim();
            return `<span class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-bold px-0.5" data-jump-caption="${query}" title="跳转到 ${query}">${match}</span>`;
        }
    });
}
function mapHtmlToPlain(html) {
    let plain = '';
    const mapIdx = [];
    let i = 0;
    while (i < html.length) {
        if (html[i] === '<') {
            const closeIdx = html.indexOf('>', i);
            if (closeIdx !== -1) {
                i = closeIdx + 1;
                continue;
            }
        }
        mapIdx.push(i);
        plain += html[i];
        i++;
    }
    mapIdx.push(i);
    return { plainText: plain, mapIdx };
}
function renderFormattedContent(text) {
    if (!text)
        return '';
    const htmlTagSplitRegex = /(<(?:i|sup|sub)>[\s\S]*?<\/(?:i|sup|sub)>)/gi;
    if (!htmlTagSplitRegex.test(text)) {
        return text;
    }
    const parts = text.split(htmlTagSplitRegex);
    return parts.map((part, idx) => {
        const match = part.match(/^<(i|sup|sub)>([\s\S]*?)<\/\1>$/i);
        if (match) {
            const Tag = match[1].toLowerCase();
            const innerContent = match[2];
            return ((0, jsx_runtime_1.jsx)(Tag, { children: renderFormattedContent(innerContent) }, `formatted-${idx}`));
        }
        else {
            return part;
        }
    });
}
function mergeSplitDoi(text) {
    const splitDoiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]*)\s+([-._;()/:A-Z0-9]+)/gi;
    let prevText = text;
    while (true) {
        const nextText = prevText.replace(splitDoiRegex, (match, g1, g2) => {
            const endsWithConnector = /[\/.\-_]$/.test(g1);
            const startsWithConnector = /^[\/.\-_]/.test(g2);
            if (endsWithConnector || startsWithConnector) {
                return g1 + g2;
            }
            return match;
        });
        if (nextText === prevText)
            break;
        prevText = nextText;
    }
    return prevText;
}
function mergeSplitUrl(text) {
    const splitUrlRegex = /\b(https?:\/\/[^\s()<>]+)\s+([^\s()<>]+)/gi;
    let prevText = text;
    while (true) {
        const nextText = prevText.replace(splitUrlRegex, (match, g1, g2) => {
            const endsWithConnector = /[\/.\-_=?&]$/.test(g1);
            const startsWithConnector = /^[\/.\-_=?&]/.test(g2);
            if (endsWithConnector || startsWithConnector) {
                return g1 + g2;
            }
            return match;
        });
        if (nextText === prevText)
            break;
        prevText = nextText;
    }
    return prevText;
}
function preprocessLinks(text) {
    if (!text)
        return '';
    return mergeSplitUrl(mergeSplitDoi(text));
}
function renderTextSegmentWithJumps(text, bibliography) {
    if (!text)
        return '';
    const preprocessed = preprocessLinks(text);
    const { plainText, mapIdx } = mapHtmlToPlain(preprocessed);
    const jumpRegex = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table|图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|((?:图|表)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)|\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F\-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?(?:,\s*|，\s*)\d{4}[a-z]?(?:\s*[;；]\s*)?)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;
    const parts = [];
    let lastPlainIndex = 0;
    let match;
    while ((match = jumpRegex.exec(plainText)) !== null) {
        const matchIndex = match.index;
        const matchEndIndex = jumpRegex.lastIndex;
        const taggedStart = mapIdx[matchIndex];
        const taggedEnd = mapIdx[matchEndIndex];
        const taggedPrevEnd = mapIdx[lastPlainIndex];
        if (taggedStart > taggedPrevEnd) {
            parts.push(renderFormattedContent(preprocessed.substring(taggedPrevEnd, taggedStart)));
        }
        const taggedMatchText = preprocessed.substring(taggedStart, taggedEnd);
        if (match[1]) {
            const citationKeysStr = match[1];
            const keys = [];
            const subParts = citationKeysStr.split(',');
            for (const subPart of subParts) {
                const trimmed = subPart.trim();
                if (trimmed.includes('-') || trimmed.includes('–')) {
                    const hyphen = trimmed.includes('-') ? '-' : '–';
                    const [startStr, endStr] = trimmed.split(hyphen);
                    const start = parseInt(startStr.trim(), 10);
                    const end = parseInt(endStr.trim(), 10);
                    if (!isNaN(start) && !isNaN(end)) {
                        const low = Math.min(start, end);
                        const high = Math.max(start, end);
                        for (let i = low; i <= high; i++) {
                            keys.push(String(i));
                        }
                    }
                }
                else {
                    const key = parseInt(trimmed, 10);
                    if (!isNaN(key)) {
                        keys.push(String(key));
                    }
                }
            }
            parts.push((0, jsx_runtime_1.jsxs)("span", { className: "select-none text-zinc-500 dark:text-zinc-400 font-sans", children: ["[", keys.map((key, idx) => {
                        const hasRef = bibliography[key];
                        const className = hasRef
                            ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-mono font-bold px-0.5"
                            : "text-zinc-600 dark:text-zinc-400 font-mono px-0.5";
                        return ((0, jsx_runtime_1.jsxs)("span", { children: [idx > 0 && ',', (0, jsx_runtime_1.jsx)("span", { className: className, onClick: (e) => {
                                        if (hasRef) {
                                            e.stopPropagation();
                                            window.getSelection()?.removeAllRanges();
                                            (0, vscode_1.postMessage)({
                                                type: 'jump-to-page',
                                                pageNumber: bibliography[key].pageNumber
                                            });
                                        }
                                    }, title: hasRef ? `跳转到文献 [${key}]` : undefined, children: key })] }, idx));
                    }), "]"] }, `citation-${matchIndex}`));
        }
        else if (match[2] || match[3] || match[4]) {
            const figQuery = (match[2] || match[3] || match[4]).trim();
            parts.push((0, jsx_runtime_1.jsx)("span", { className: "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-bold px-0.5", onClick: (e) => {
                    e.stopPropagation();
                    window.getSelection()?.removeAllRanges();
                    (0, vscode_1.postMessage)({
                        type: 'find-and-jump-to-caption',
                        query: figQuery
                    });
                }, title: `跳转到 ${figQuery}`, children: renderFormattedContent(taggedMatchText) }, `fig-${matchIndex}`));
        }
        else if (match[5]) {
            const author = match[5].toLowerCase();
            const year = (match[6] + (match[7] || '')).toLowerCase();
            const key = `${author}-${year}`;
            const hasRef = bibliography[key];
            parts.push((0, jsx_runtime_1.jsx)("span", { className: hasRef
                    ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5"
                    : "text-zinc-600 dark:text-zinc-400 px-0.5", onClick: (e) => {
                    if (hasRef) {
                        e.stopPropagation();
                        window.getSelection()?.removeAllRanges();
                        (0, vscode_1.postMessage)({
                            type: 'jump-to-page',
                            pageNumber: bibliography[key].pageNumber
                        });
                    }
                }, title: hasRef ? `跳转到文献 [${key}]` : undefined, children: renderFormattedContent(taggedMatchText) }, `narrative-${matchIndex}`));
        }
        else if (match[8]) {
            const innerText = match[9];
            const innerStartPlain = matchIndex + match[0].indexOf(innerText);
            const items = innerText.split(/[;；]/);
            const renderedItems = [];
            let currentPlainOffset = innerStartPlain;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemStartPlain = currentPlainOffset;
                const itemEndPlain = itemStartPlain + item.length;
                currentPlainOffset = itemEndPlain + 1;
                const itemMatch = item.match(/\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?(?:,\s*|，\s*)(\d{4})([a-z])?/i);
                if (i > 0) {
                    renderedItems.push('; ');
                }
                const itemTaggedStart = mapIdx[itemStartPlain];
                const itemTaggedEnd = mapIdx[itemEndPlain];
                const itemTaggedText = preprocessed.substring(itemTaggedStart, itemTaggedEnd);
                if (itemMatch) {
                    const author = itemMatch[1].toLowerCase();
                    const year = (itemMatch[2] + (itemMatch[3] || '')).toLowerCase();
                    const key = `${author}-${year}`;
                    const hasRef = bibliography[key];
                    renderedItems.push((0, jsx_runtime_1.jsx)("span", { className: hasRef
                            ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5"
                            : "text-zinc-600 dark:text-zinc-400 px-0.5", onClick: (e) => {
                            if (hasRef) {
                                e.stopPropagation();
                                window.getSelection()?.removeAllRanges();
                                (0, vscode_1.postMessage)({
                                    type: 'jump-to-page',
                                    pageNumber: bibliography[key].pageNumber
                                });
                            }
                        }, title: hasRef ? `跳转到文献 [${key}]` : undefined, children: renderFormattedContent(itemTaggedText.trim()) }, `parenthetical-item-${i}`));
                }
                else {
                    renderedItems.push(renderFormattedContent(itemTaggedText));
                }
            }
            parts.push((0, jsx_runtime_1.jsxs)("span", { children: ["(", renderedItems, ")"] }, `parenthetical-block-${matchIndex}`));
        }
        else if (match[10]) {
            const url = match[10];
            parts.push((0, jsx_runtime_1.jsx)("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans", onClick: (e) => {
                    e.stopPropagation();
                    window.getSelection()?.removeAllRanges();
                }, title: url, children: renderFormattedContent(taggedMatchText) }, `url-${matchIndex}`));
        }
        else if (match[11]) {
            const doi = match[11];
            parts.push((0, jsx_runtime_1.jsx)("a", { href: `https://doi.org/${doi}`, target: "_blank", rel: "noopener noreferrer", className: "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-medium", onClick: (e) => {
                    e.stopPropagation();
                    window.getSelection()?.removeAllRanges();
                }, title: `https://doi.org/${doi}`, children: renderFormattedContent(taggedMatchText) }, `doi-${matchIndex}`));
        }
        lastPlainIndex = jumpRegex.lastIndex;
    }
    const taggedPrevEnd = mapIdx[lastPlainIndex];
    if (taggedPrevEnd < preprocessed.length) {
        parts.push(renderFormattedContent(preprocessed.substring(taggedPrevEnd)));
    }
    return parts.length > 0 ? parts : preprocessed;
}
function renderTextWithHighlightsAndCitations(text, paragraphId, bibliography, highlights, onHighlightClick) {
    if (!text)
        return '';
    const plainText = text.replace(/<[^>]+>/g, '');
    const paraHighlights = highlights.filter(hl => hl.paragraphId === paragraphId && plainText.includes(hl.text));
    if (paraHighlights.length === 0) {
        return renderTextSegmentWithJumps(text, bibliography);
    }
    const sortedHls = [...paraHighlights].sort((a, b) => b.text.length - a.text.length);
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const buildTagInsensitiveRegexStr = (hlText) => {
        const escaped = escapeRegExp(hlText);
        const words = escaped.split(/\s+/);
        const wordPatterns = words.map(w => {
            return w.split('').map(char => escapeRegExp(char)).join('(?:<[^>]+>)*');
        });
        return wordPatterns.join('\\s*(?:<[^>]+>)*\\s*');
    };
    const pattern = new RegExp('(' + sortedHls.map(h => buildTagInsensitiveRegexStr(h.text)).join('|') + ')', 'gi');
    const parts = text.split(pattern);
    const resultNodes = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part)
            continue;
        const matchedHl = sortedHls.find(h => {
            const regex = new RegExp('^' + buildTagInsensitiveRegexStr(h.text) + '$', 'i');
            return regex.test(part);
        });
        if (matchedHl) {
            const colorsMap = {
                yellow: 'bg-amber-100 dark:bg-amber-950/40 border-b-2 border-amber-400/80 text-foreground',
                green: 'bg-emerald-100 dark:bg-emerald-950/40 border-b-2 border-emerald-400/80 text-foreground',
                blue: 'bg-sky-100 dark:bg-sky-950/40 border-b-2 border-sky-400/80 text-foreground',
                purple: 'bg-purple-100 dark:bg-purple-950/40 border-b-2 border-purple-400/80 text-foreground'
            };
            const colorClass = colorsMap[matchedHl.color] || colorsMap.yellow;
            resultNodes.push((0, jsx_runtime_1.jsxs)("span", { className: `${colorClass} cursor-pointer hover:opacity-90 transition-all px-0.5 rounded-sm relative inline group/hl`, onClick: (e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onHighlightClick(matchedHl, rect);
                }, title: matchedHl.note ? `批注: ${matchedHl.note}` : '点击查看/修改高亮', children: [renderFormattedContent(part), matchedHl.note && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center ml-0.5 select-none text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-600 rounded px-0.5 font-sans leading-none transform scale-90 origin-left", children: "\u270D\uFE0F" }))] }, `hl-${matchedHl.id}-${i}`));
        }
        else {
            const jumpedNodes = renderTextSegmentWithJumps(part, bibliography);
            if (Array.isArray(jumpedNodes)) {
                resultNodes.push(...jumpedNodes);
            }
            else {
                resultNodes.push(jumpedNodes);
            }
        }
    }
    return resultNodes.length > 0 ? resultNodes : text;
}
function protectTextWithPlaceholders(text) {
    if (!text)
        return '';
    const preprocessed = preprocessLinks(text);
    const { plainText, mapIdx } = mapHtmlToPlain(preprocessed);
    const unionRegexWithoutHtml = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F\-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?,\s*\d{4}[a-z]?(?:\s*;|，|;|,)?\s*)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;
    const citations = [];
    let match;
    unionRegexWithoutHtml.lastIndex = 0;
    while ((match = unionRegexWithoutHtml.exec(plainText)) !== null) {
        const plainStart = match.index;
        const plainEnd = unionRegexWithoutHtml.lastIndex;
        const taggedStart = mapIdx[plainStart];
        const taggedEnd = mapIdx[plainEnd];
        let type;
        if (match[1])
            type = 'CZNUM';
        else if (match[2] || match[3])
            type = 'CZFIG';
        else if (match[4])
            type = 'CZNAR';
        else if (match[7])
            type = 'CZPAR';
        else if (match[9])
            type = 'CZURL';
        else if (match[10])
            type = 'CZDOI';
        else
            continue;
        citations.push({ type, taggedStart, taggedEnd });
    }
    const htmlTags = [];
    const htmlTagRegex = /<(i|sup|sub)>([\s\S]*?)<\/\1>/gi;
    let htmlMatch;
    while ((htmlMatch = htmlTagRegex.exec(preprocessed)) !== null) {
        const taggedStart = htmlMatch.index;
        const taggedEnd = htmlTagRegex.lastIndex;
        const isInsideCitation = citations.some(c => taggedStart >= c.taggedStart && taggedEnd <= c.taggedEnd);
        if (!isInsideCitation) {
            htmlTags.push({
                taggedStart,
                taggedEnd,
                tag: htmlMatch[1]
            });
        }
    }
    const allMatches = [];
    for (const c of citations) {
        allMatches.push({ type: c.type, taggedStart: c.taggedStart, taggedEnd: c.taggedEnd });
    }
    for (const h of htmlTags) {
        allMatches.push({ type: 'CZHTML', taggedStart: h.taggedStart, taggedEnd: h.taggedEnd });
    }
    allMatches.sort((a, b) => a.taggedStart - b.taggedStart);
    let result = '';
    let lastIdx = 0;
    let refIndex = 0;
    let figIndex = 0;
    let narIndex = 0;
    let parIndex = 0;
    let htmlIndex = 0;
    let urlIndex = 0;
    let doiIndex = 0;
    for (const m of allMatches) {
        result += preprocessed.substring(lastIdx, m.taggedStart);
        if (m.type === 'CZNUM') {
            result += `[[CZNUM_${refIndex++}]]`;
        }
        else if (m.type === 'CZFIG') {
            result += `[[CZFIG_${figIndex++}]]`;
        }
        else if (m.type === 'CZNAR') {
            result += `[[CZNAR_${narIndex++}]]`;
        }
        else if (m.type === 'CZPAR') {
            result += `[[CZPAR_${parIndex++}]]`;
        }
        else if (m.type === 'CZHTML') {
            result += `[[CZHTML_${htmlIndex++}]]`;
        }
        else if (m.type === 'CZURL') {
            result += `[[CZURL_${urlIndex++}]]`;
        }
        else if (m.type === 'CZDOI') {
            result += `[[CZDOI_${doiIndex++}]]`;
        }
        lastIdx = m.taggedEnd;
    }
    result += preprocessed.substring(lastIdx);
    return result;
}
function renderTextWithPlaceholders(translated, para, bibliography, highlights, onHighlightClick) {
    const nums = [];
    const figs = [];
    const nars = [];
    const pars = [];
    const htmls = [];
    const urls = [];
    const dois = [];
    const preprocessedParaText = preprocessLinks(para.text);
    const { plainText, mapIdx } = mapHtmlToPlain(preprocessedParaText);
    const unionRegexWithoutHtml = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\[((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\]|\b((?:Figure|Fig\.|Table)\s*(?:S\d+|s\d+|\d+)(?:\s*[a-zA-Z])?)\b|\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?\s*\((18\d{2}|19\d{2}|20\d{2})([a-z])?\)|(\(((?:[A-Z][a-zA-Z\u00C0-\u017F\-]+(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?,\s*\d{4}[a-z]?(?:\s*;|，|;|,)?\s*)+)\))|\b(https?:\/\/[^\s()<>]+[^\s()<>.,;:!?"'])\b|\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;
    const citations = [];
    let match;
    unionRegexWithoutHtml.lastIndex = 0;
    while ((match = unionRegexWithoutHtml.exec(plainText)) !== null) {
        const plainStart = match.index;
        const plainEnd = unionRegexWithoutHtml.lastIndex;
        const taggedStart = mapIdx[plainStart];
        const taggedEnd = mapIdx[plainEnd];
        let type;
        if (match[1])
            type = 'CZNUM';
        else if (match[2] || match[3])
            type = 'CZFIG';
        else if (match[4])
            type = 'CZNAR';
        else if (match[7])
            type = 'CZPAR';
        else if (match[9])
            type = 'CZURL';
        else if (match[10])
            type = 'CZDOI';
        else
            continue;
        citations.push({ type, taggedStart, taggedEnd, match });
    }
    const htmlTags = [];
    const htmlTagRegex = /<(i|sup|sub)>([\s\S]*?)<\/\1>/gi;
    let htmlMatch;
    while ((htmlMatch = htmlTagRegex.exec(preprocessedParaText)) !== null) {
        const taggedStart = htmlMatch.index;
        const taggedEnd = htmlTagRegex.lastIndex;
        const isInsideCitation = citations.some(c => taggedStart >= c.taggedStart && taggedEnd <= c.taggedEnd);
        if (!isInsideCitation) {
            htmlTags.push({
                taggedStart,
                taggedEnd,
                tag: htmlMatch[1],
                content: htmlMatch[2]
            });
        }
    }
    const allMatches = [];
    for (const c of citations) {
        allMatches.push({ type: c.type, taggedStart: c.taggedStart, taggedEnd: c.taggedEnd, data: c.match });
    }
    for (const h of htmlTags) {
        allMatches.push({ type: 'CZHTML', taggedStart: h.taggedStart, taggedEnd: h.taggedEnd, data: h });
    }
    allMatches.sort((a, b) => a.taggedStart - b.taggedStart);
    for (const m of allMatches) {
        const taggedMatchText = preprocessedParaText.substring(m.taggedStart, m.taggedEnd);
        if (m.type === 'CZNUM') {
            nums.push({ match: taggedMatchText, key: m.data[1] });
        }
        else if (m.type === 'CZFIG') {
            figs.push({ match: taggedMatchText, query: (m.data[2] || m.data[3]).trim() });
        }
        else if (m.type === 'CZNAR') {
            nars.push({ match: taggedMatchText, author: m.data[4], year: m.data[5] + (m.data[6] || '') });
        }
        else if (m.type === 'CZPAR') {
            const innerText = m.data[8];
            const innerStartPlain = m.data.index + m.data[0].indexOf(innerText);
            const itemsPlain = innerText.split(/[;；]/);
            const itemsData = [];
            let currentPlainOffset = innerStartPlain;
            for (const item of itemsPlain) {
                const itemStartPlain = currentPlainOffset;
                const itemEndPlain = itemStartPlain + item.length;
                currentPlainOffset = itemEndPlain + 1;
                const itemTaggedStart = mapIdx[itemStartPlain];
                const itemTaggedEnd = mapIdx[itemEndPlain];
                const itemTaggedText = preprocessedParaText.substring(itemTaggedStart, itemTaggedEnd);
                itemsData.push({
                    text: item,
                    taggedText: itemTaggedText
                });
            }
            pars.push({ match: taggedMatchText, items: itemsData });
        }
        else if (m.type === 'CZHTML') {
            htmls.push({ match: taggedMatchText, tag: m.data.tag, content: m.data.content });
        }
        else if (m.type === 'CZURL') {
            urls.push({ match: taggedMatchText, url: m.data[9] });
        }
        else if (m.type === 'CZDOI') {
            dois.push({ match: taggedMatchText, doi: m.data[10] });
        }
    }
    const placeholderSplitRegex = /(\[\[(?:CZNUM|CZFIG|CZNAR|CZPAR|CZHTML|CZURL|CZDOI)_\d+\]\])/g;
    const parts = translated.split(placeholderSplitRegex);
    const resultNodes = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part)
            continue;
        const placeholderMatch = part.match(/^\[\[(CZNUM|CZFIG|CZNAR|CZPAR|CZHTML|CZURL|CZDOI)_(\d+)\]\]$/);
        if (placeholderMatch) {
            const type = placeholderMatch[1];
            const idx = parseInt(placeholderMatch[2], 10);
            if (type === 'CZHTML') {
                const data = htmls[idx];
                if (data) {
                    const Tag = data.tag.toLowerCase();
                    resultNodes.push((0, jsx_runtime_1.jsx)(Tag, { children: renderFormattedContent(data.content) }, `placeholder-html-${idx}-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
            else if (type === 'CZNUM') {
                const data = nums[idx];
                if (data) {
                    const keysStr = data.key;
                    const keys = [];
                    const subParts = keysStr.split(',');
                    for (const subPart of subParts) {
                        const trimmed = subPart.trim();
                        if (trimmed.includes('-') || trimmed.includes('–')) {
                            const hyphen = trimmed.includes('-') ? '-' : '–';
                            const [startStr, endStr] = trimmed.split(hyphen);
                            const start = parseInt(startStr.trim(), 10);
                            const end = parseInt(endStr.trim(), 10);
                            if (!isNaN(start) && !isNaN(end)) {
                                const low = Math.min(start, end);
                                const high = Math.max(start, end);
                                for (let k = low; k <= high; k++) {
                                    keys.push(String(k));
                                }
                            }
                        }
                        else {
                            const k = parseInt(trimmed, 10);
                            if (!isNaN(k)) {
                                keys.push(String(k));
                            }
                        }
                    }
                    resultNodes.push((0, jsx_runtime_1.jsxs)("span", { className: "select-none text-zinc-500 dark:text-zinc-400 font-sans", children: ["[", keys.map((key, keyIdx) => {
                                const hasRef = bibliography[key];
                                const className = hasRef
                                    ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-mono font-bold px-0.5"
                                    : "text-zinc-600 dark:text-zinc-400 font-mono px-0.5";
                                return ((0, jsx_runtime_1.jsxs)("span", { children: [keyIdx > 0 && ',', (0, jsx_runtime_1.jsx)("span", { className: className, onClick: (e) => {
                                                if (hasRef) {
                                                    e.stopPropagation();
                                                    window.getSelection()?.removeAllRanges();
                                                    (0, vscode_1.postMessage)({
                                                        type: 'jump-to-page',
                                                        pageNumber: bibliography[key].pageNumber
                                                    });
                                                }
                                            }, title: hasRef ? `跳转到文献 [${key}]` : undefined, children: key })] }, keyIdx));
                            }), "]"] }, `placeholder-num-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
            else if (type === 'CZFIG') {
                const data = figs[idx];
                if (data) {
                    resultNodes.push((0, jsx_runtime_1.jsx)("span", { className: "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-bold px-0.5", onClick: (e) => {
                            e.stopPropagation();
                            window.getSelection()?.removeAllRanges();
                            (0, vscode_1.postMessage)({
                                type: 'find-and-jump-to-caption',
                                query: data.query
                            });
                        }, title: `跳转到 ${data.query}`, children: renderFormattedContent(data.match) }, `placeholder-fig-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
            else if (type === 'CZNAR') {
                const data = nars[idx];
                if (data) {
                    const key = `${data.author.toLowerCase()}-${data.year.toLowerCase()}`;
                    const hasRef = bibliography[key];
                    resultNodes.push((0, jsx_runtime_1.jsx)("span", { className: hasRef
                            ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5"
                            : "text-zinc-600 dark:text-zinc-400 px-0.5", onClick: (e) => {
                            if (hasRef) {
                                e.stopPropagation();
                                window.getSelection()?.removeAllRanges();
                                (0, vscode_1.postMessage)({
                                    type: 'jump-to-page',
                                    pageNumber: bibliography[key].pageNumber
                                });
                            }
                        }, title: hasRef ? `跳转到文献 [${key}]` : undefined, children: renderFormattedContent(data.match) }, `placeholder-nar-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
            else if (type === 'CZPAR') {
                const data = pars[idx];
                if (data) {
                    const renderedItems = [];
                    for (let k = 0; k < data.items.length; k++) {
                        const itemObj = data.items[k];
                        const itemMatch = itemObj.text.match(/\b([A-Z][a-zA-Z\u00C0-\u017F\-]+)(?:\s+et\s+al\.|\s+等|\s+and\s+[A-Z][a-zA-Z\u00C0-\u017F\-]+)?(?:,\s*|，\s*)(\d{4})([a-z])?/i);
                        if (k > 0) {
                            renderedItems.push('; ');
                        }
                        if (itemMatch) {
                            const author = itemMatch[1].toLowerCase();
                            const year = (itemMatch[2] + (itemMatch[3] || '')).toLowerCase();
                            const key = `${author}-${year}`;
                            const hasRef = bibliography[key];
                            renderedItems.push((0, jsx_runtime_1.jsx)("span", { className: hasRef
                                    ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold px-0.5"
                                    : "text-zinc-600 dark:text-zinc-400 px-0.5", onClick: (e) => {
                                    if (hasRef) {
                                        e.stopPropagation();
                                        window.getSelection()?.removeAllRanges();
                                        (0, vscode_1.postMessage)({
                                            type: 'jump-to-page',
                                            pageNumber: bibliography[key].pageNumber
                                        });
                                    }
                                }, title: hasRef ? `跳转到文献 [${key}]` : undefined, children: renderFormattedContent(itemObj.taggedText.trim()) }, `parenthetical-item-${k}`));
                        }
                        else {
                            renderedItems.push(renderFormattedContent(itemObj.taggedText));
                        }
                    }
                    resultNodes.push((0, jsx_runtime_1.jsxs)("span", { children: ["(", renderedItems, ")"] }, `placeholder-par-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
            else if (type === 'CZURL') {
                const data = urls[idx];
                if (data) {
                    resultNodes.push((0, jsx_runtime_1.jsx)("a", { href: data.url, target: "_blank", rel: "noopener noreferrer", className: "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans", onClick: (e) => {
                            e.stopPropagation();
                            window.getSelection()?.removeAllRanges();
                        }, title: data.url, children: data.match }, `placeholder-url-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
            else if (type === 'CZDOI') {
                const data = dois[idx];
                if (data) {
                    resultNodes.push((0, jsx_runtime_1.jsx)("a", { href: `https://doi.org/${data.doi}`, target: "_blank", rel: "noopener noreferrer", className: "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-sans font-medium", onClick: (e) => {
                            e.stopPropagation();
                            window.getSelection()?.removeAllRanges();
                        }, title: `https://doi.org/${data.doi}`, children: data.match }, `placeholder-doi-${i}`));
                }
                else {
                    resultNodes.push(part);
                }
            }
        }
        else {
            resultNodes.push(part);
        }
    }
    return resultNodes;
}
const HEADING_RE = /^(?:abstract|introduction|background|methods|materials?\s+and\s+methods?|methodology|results|discussion|conclusion|conclusions|references|acknowledgments?|summary|keywords?|key\s+words|related\s+work|literature\s+review|objectives?|purpose|aims?|scope|table\s+of\s+contents|appendix|supplementary|figure\s+\d|table\s+\d|fig\.\s+\d)/i;
function splitTableCells(text) {
    const normalized = text.replace(/\u00a0/g, ' ').trim();
    if (!normalized)
        return [];
    const tabCells = normalized.split('\t').map(cell => cell.trim()).filter(Boolean);
    if (tabCells.length > 1)
        return tabCells;
    const multiSpaceCells = normalized.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
    if (multiSpaceCells.length > 1)
        return multiSpaceCells;
    return [normalized];
}
function classifyParagraphs(paragraphs) {
    const sizes = paragraphs.map(p => p.fontSize).filter((s) => s !== undefined && s > 0);
    if (sizes.length === 0) {
        return paragraphs.map(() => 'body');
    }
    const sorted = [...sizes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return paragraphs.map(para => {
        // Use blockType from textLayer when available
        if (para.blockType === 'title')
            return 'title';
        if (para.blockType === 'heading')
            return 'heading';
        if (para.blockType === 'authors' || para.blockType === 'table'
            || para.blockType === 'figure-caption' || para.blockType === 'reference')
            return 'small';
        // Fall back to font-size heuristic for body/unknown
        const fs = para.fontSize;
        if (!fs)
            return 'body';
        const ratio = fs / median;
        const text = para.text.trim();
        if (ratio >= 1.5)
            return 'title';
        if (ratio >= 1.15 && text.length < 80)
            return 'heading';
        if (HEADING_RE.test(text) && text.length < 60)
            return 'heading';
        if (ratio < 0.85)
            return 'small';
        return 'body';
    });
}
// ── Role-based style maps ──
const EN_STYLES = {
    title: 'font-serif text-[16px] font-bold text-center leading-[1.4] tracking-wide',
    heading: 'font-serif text-[12px] font-bold leading-[1.5]',
    body: 'font-serif text-[11px] leading-[1.65] text-justify',
    small: 'font-serif text-[9.5px] leading-[1.5] text-secondary-foreground/80',
};
const ZH_STYLES = {
    title: 'font-zhSerif text-[18px] font-bold text-center leading-[1.6] tracking-wider',
    heading: 'font-zhSerif text-[15px] font-bold leading-[1.7]',
    body: 'font-zhSerif text-[14px] font-medium leading-[2.0] tracking-wide text-justify',
    small: 'font-zhSerif text-[12px] leading-[1.7]',
};
const BI_EN_STYLES = {
    title: 'font-serif text-[13px] font-bold text-center leading-[1.4] italic',
    heading: 'font-serif text-[11px] font-bold leading-[1.4] italic',
    body: 'font-serif text-[11px] leading-[1.5] italic text-secondary-foreground',
    small: 'font-serif text-[9.5px] leading-[1.4] italic text-secondary-foreground/60',
};
const BI_ZH_STYLES = {
    title: 'font-zhSerif text-[16px] font-bold text-center leading-[1.6] tracking-wide',
    heading: 'font-zhSerif text-[14px] font-bold leading-[1.8] tracking-wide',
    body: 'font-zhSerif text-[14px] leading-[2.0] font-medium tracking-wide text-foreground',
    small: 'font-zhSerif text-[12px] leading-[1.7] text-secondary-foreground',
};
const PARA_SPACING = {
    title: 'mb-5',
    heading: 'mb-3 mt-4 para-heading',
    body: 'mb-3',
    small: 'mb-2',
};
const ZH_INDENT = {
    title: '',
    heading: '',
    body: 'indent-8',
    small: '',
};
const EN_INDENT = {
    title: '',
    heading: '',
    body: 'indent-4',
    small: '',
};
function isHeadingContinuation(prev, cur) {
    if (!prev)
        return false;
    if (cur.role !== 'heading')
        return false;
    if (cur.skipped)
        return false;
    const prevIsHeadingLike = prev.role === 'heading' || prev.blockType === 'heading';
    if (!prevIsHeadingLike)
        return false;
    const prevText = prev.text.trim();
    const curText = cur.text.trim();
    if (!prevText || !curText)
        return false;
    if (/[.!?;:。！？；：]$/.test(prevText))
        return false;
    if (/^[a-z0-9(]/.test(curText))
        return true;
    if (/^(and|or|of|for|to|in|on|with|without|between|by)\b/i.test(curText))
        return true;
    if (curText.length <= 42)
        return true;
    return false;
}
function isCollapsibleNoiseSkip(para) {
    if (!para?.skipped)
        return false;
    const reason = (para.skipReason || '').toLowerCase();
    if (!reason)
        return false;
    return reason.includes('watermark')
        || reason.includes('http')
        || reason.includes('repeated-noise')
        || reason.includes('table-image');
}
function previousSemanticParagraph(paragraphs, index) {
    for (let i = index - 1; i >= 0; i--) {
        const prev = paragraphs[i];
        if (prev.lineMarker === 'horizontal-rule')
            return undefined;
        if (isCollapsibleNoiseSkip(prev))
            continue;
        return prev;
    }
    return undefined;
}
function getParagraphColumnIndex(para, columnsCount) {
    if (para.columnIndex !== undefined && para.columnIndex >= 0) {
        return Math.min(para.columnIndex, Math.max(columnsCount - 1, 0));
    }
    if (para.section === 'left')
        return 0;
    if (para.section === 'right')
        return Math.min(1, Math.max(columnsCount - 1, 0));
    return -1;
}
function groupParagraphsIntoBlocks(paragraphs, columnsCount) {
    const blocks = [];
    for (const para of paragraphs) {
        const type = getParagraphColumnIndex(para, columnsCount) >= 0 ? 'columns' : 'single';
        if (blocks.length === 0 || blocks[blocks.length - 1].type !== type) {
            blocks.push({ type, paragraphs: [para] });
        }
        else {
            blocks[blocks.length - 1].paragraphs.push(para);
        }
    }
    return blocks;
}
// ── Component ──
const TranslationTab = () => {
    const loading = (0, store_1.useStore)((state) => state.isTranslating);
    const error = (0, store_1.useStore)((state) => state.translationError);
    const currentPageText = (0, store_1.useStore)((state) => state.currentPageText);
    const activeParagraphId = (0, store_1.useStore)((state) => state.activeParagraphId);
    const bibliography = (0, store_1.useStore)((state) => state.bibliography);
    const layoutMode = (0, store_1.useStore)((state) => state.layoutMode);
    const setLayoutMode = (0, store_1.useStore)((state) => state.setLayoutMode);
    const hoverHighlightStyle = (0, store_1.useStore)((state) => state.layoutConfig?.hoverHighlightStyle ?? 'overlay');
    const highlights = (0, store_1.useStore)((state) => state.highlights);
    const activePdfUri = (0, store_1.useStore)((state) => state.activePdfUri);
    const aiExplainResult = (0, store_1.useStore)((state) => state.aiExplainResult);
    const mineruConfig = (0, store_1.useStore)((state) => state.mineruConfig);
    const mineruStatus = (0, store_1.useStore)((state) => state.mineruStatus);
    const mineruProgress = (0, store_1.useStore)((state) => state.mineruProgress);
    const mineruMarkdown = (0, store_1.useStore)((state) => state.mineruMarkdown);
    const mineruError = (0, store_1.useStore)((state) => state.mineruError);
    const [mineruViewActive, setMineruViewActive] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        if (mineruStatus === 'done' && mineruMarkdown) {
            setMineruViewActive(true);
        }
    }, [mineruStatus, !!mineruMarkdown]);
    const mineruPages = (0, react_1.useMemo)(() => {
        if (!mineruMarkdown)
            return [];
        // Split by horizontal rules, page break comments, or page markers
        return mineruMarkdown.split(/\n\s*(?:---|---|---|---|---|---|---|---|---|\*\*\*|<!--\s*page\s*(?:=\s*)?\d+\s*-->)\s*\n/i);
    }, [mineruMarkdown]);
    const mineruParas = (0, react_1.useMemo)(() => {
        if (!currentPageText || mineruPages.length === 0)
            return [];
        const pageMd = mineruPages[currentPageText.pageNumber - 1] || '';
        if (!pageMd.trim())
            return [];
        const rawParas = pageMd.split(/\n\s*\n+/);
        const parsed = [];
        let paraIndex = 0;
        for (const rawText of rawParas) {
            const trimmed = rawText.trim();
            if (!trimmed)
                continue;
            let role = 'body';
            if (trimmed.startsWith('#')) {
                role = 'heading';
            }
            else if (trimmed.startsWith('|')) {
                role = 'table';
            }
            parsed.push({
                id: `mineru-para-${currentPageText.pageNumber}-${paraIndex++}`,
                text: trimmed,
                role,
                originalText: trimmed
            });
        }
        return parsed;
    }, [mineruPages, currentPageText?.pageNumber]);
    const [addingGlossaryParaId, setAddingGlossaryParaId] = (0, react_1.useState)(null);
    const [glossarySource, setGlossarySource] = (0, react_1.useState)('');
    const [glossaryTarget, setGlossaryTarget] = (0, react_1.useState)('');
    const [glossaryCategory, setGlossaryCategory] = (0, react_1.useState)('学术词汇');
    // Local state for highlights, notes, and AI explanation
    const [aiExplanation, setAiExplanation] = (0, react_1.useState)(null);
    const [activeHighlightAction, setActiveHighlightAction] = (0, react_1.useState)(null);
    const [noteEditingHlId, setNoteEditingHlId] = (0, react_1.useState)(null);
    const [noteText, setNoteText] = (0, react_1.useState)('');
    // Sync AI explanation result from global store
    (0, react_1.useEffect)(() => {
        if (aiExplainResult) {
            if (aiExplanation && aiExplanation.text === aiExplainResult.text) {
                setAiExplanation({
                    text: aiExplainResult.text,
                    result: aiExplainResult.explanation,
                    error: aiExplainResult.error,
                    loading: false
                });
            }
        }
    }, [aiExplainResult]);
    const handleAddHighlight = (color) => {
        if (!selectedText || !selectedParaId || !activePdfUri || !currentPageText)
            return;
        (0, vscode_1.postMessage)({
            type: 'add-highlight',
            pdfUri: activePdfUri,
            pageNumber: currentPageText.pageNumber,
            paragraphId: selectedParaId,
            text: selectedText,
            color,
            note: ''
        });
        setBubbleCoords(null);
        window.getSelection()?.removeAllRanges();
    };
    const handleAddNoteFromBubble = () => {
        if (!selectedText || !selectedParaId || !activePdfUri || !currentPageText)
            return;
        const generatedId = Math.random().toString(36).substring(2, 9);
        (0, vscode_1.postMessage)({
            type: 'add-highlight',
            id: generatedId,
            pdfUri: activePdfUri,
            pageNumber: currentPageText.pageNumber,
            paragraphId: selectedParaId,
            text: selectedText,
            color: 'yellow',
            note: ''
        });
        setNoteEditingHlId(generatedId);
        setNoteText('');
        setAddingGlossaryParaId(null);
        setBubbleCoords(null);
        window.getSelection()?.removeAllRanges();
    };
    const handleAiExplainFromBubble = () => {
        if (!selectedText)
            return;
        setAiExplanation({
            text: selectedText,
            loading: true
        });
        (0, vscode_1.postMessage)({
            type: 'ai-explain',
            text: selectedText
        });
        setBubbleCoords(null);
        window.getSelection()?.removeAllRanges();
    };
    const handleDeleteHighlight = (id) => {
        (0, vscode_1.postMessage)({
            type: 'delete-highlight',
            id
        });
        setActiveHighlightAction(null);
    };
    const handleChangeHighlightColor = (id, color) => {
        const hl = highlights.find(h => h.id === id);
        if (!hl)
            return;
        (0, vscode_1.postMessage)({
            type: 'add-highlight',
            id: hl.id,
            pdfUri: hl.pdfUri,
            pageNumber: hl.pageNumber,
            paragraphId: hl.paragraphId,
            text: hl.text,
            color,
            note: hl.note
        });
        setActiveHighlightAction(null);
    };
    const handleHighlightClick = (hl, rect) => {
        const container = document.querySelector('article');
        if (!container)
            return;
        const containerRect = container.getBoundingClientRect();
        setActiveHighlightAction({
            highlight: hl,
            rect: {
                x: rect.left - containerRect.left + rect.width / 2,
                y: rect.top - containerRect.top,
                width: rect.width,
                height: rect.height
            }
        });
    };
    const handleOpenAddGlossary = (para) => {
        const selection = window.getSelection()?.toString().trim() || '';
        let sourceVal = '';
        let targetVal = '';
        if (selection) {
            const isChinese = /[\u4e00-\u9fa5]/.test(selection);
            if (isChinese) {
                targetVal = selection;
            }
            else {
                sourceVal = selection;
            }
        }
        setGlossarySource(sourceVal);
        setGlossaryTarget(targetVal);
        setAddingGlossaryParaId(para.id);
    };
    const renderInlineGlossaryForm = (para) => {
        if (addingGlossaryParaId !== para.id)
            return null;
        const handleSave = () => {
            if (!glossarySource.trim() || !glossaryTarget.trim()) {
                return;
            }
            (0, vscode_1.postMessage)({
                type: 'add-term',
                source: glossarySource.trim(),
                target: glossaryTarget.trim(),
                category: glossaryCategory.trim()
            });
            setAddingGlossaryParaId(null);
            setGlossarySource('');
            setGlossaryTarget('');
        };
        return ((0, jsx_runtime_1.jsxs)("div", { className: "mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-left select-text animate-in slide-in-from-top-2 duration-200 cursor-default", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-[10px] font-bold text-primary mb-2 flex items-center gap-1", children: [(0, jsx_runtime_1.jsx)("span", { children: "\u5F55\u5165\u672F\u8BED\u5E93" }), (0, jsx_runtime_1.jsx)("span", { className: "text-secondary-foreground/50 font-normal", children: "(\u63D0\u793A: \u53CC\u51FB\u9009\u8BCD\u540E\u70B9\u51FB + \u53EF\u81EA\u52A8\u586B\u5145)" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-2 gap-2 mb-2", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { className: "block text-[8px] font-semibold text-secondary-foreground mb-0.5", children: "\u82F1\u6587\u539F\u6587" }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: glossarySource, onChange: (e) => setGlossarySource(e.target.value), placeholder: "e.g. lncRNA", className: "w-full px-2 py-1 text-xs rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text" })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { className: "block text-[8px] font-semibold text-secondary-foreground mb-0.5", children: "\u6C49\u8BED\u8BD1\u6587" }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: glossaryTarget, onChange: (e) => setGlossaryTarget(e.target.value), placeholder: "e.g. \u957F\u94FE\u975E\u7F16\u7801RNA", className: "w-full px-2 py-1 text-xs rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 items-center justify-between mt-1", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex-1 max-w-[120px]", children: (0, jsx_runtime_1.jsx)("input", { type: "text", value: glossaryCategory, onChange: (e) => setGlossaryCategory(e.target.value), placeholder: "\u7C7B\u522B (\u9ED8\u8BA4: \u5B66\u672F\u8BCD\u6C47)", className: "w-full px-2 py-1 text-[10px] rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-1.5", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setAddingGlossaryParaId(null), className: "px-2.5 py-1 text-[10px] font-semibold rounded border border-border hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer", children: "\u53D6\u6D88" }), (0, jsx_runtime_1.jsx)("button", { onClick: handleSave, className: "px-2.5 py-1 text-[10px] font-bold rounded bg-primary text-primary-foreground hover:bg-primary/95 active:scale-95 transition-all duration-150 cursor-pointer", children: "\u786E\u5B9A" })] })] })] }));
    };
    const renderInlineNoteForm = (paraId) => {
        const hlBeingEdited = highlights.find(h => h.paragraphId === paraId && h.id === noteEditingHlId);
        if (!hlBeingEdited)
            return null;
        const handleSaveNote = () => {
            (0, vscode_1.postMessage)({
                type: 'add-highlight',
                id: hlBeingEdited.id,
                pdfUri: hlBeingEdited.pdfUri,
                pageNumber: hlBeingEdited.pageNumber,
                paragraphId: hlBeingEdited.paragraphId,
                text: hlBeingEdited.text,
                color: hlBeingEdited.color,
                note: noteText.trim()
            });
            setNoteEditingHlId(null);
            setNoteText('');
        };
        return ((0, jsx_runtime_1.jsxs)("div", { className: "mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-left select-text animate-in slide-in-from-top-2 duration-200 cursor-default", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-[10px] font-bold text-primary mb-2 flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { children: "\u64B0\u5199\u60F3\u6CD5 / \u6279\u6CE8" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setNoteEditingHlId(null), className: "text-[10px] text-zinc-400 hover:text-zinc-600 bg-transparent border-0 cursor-pointer", children: "\u5173\u95ED" })] }), (0, jsx_runtime_1.jsx)("textarea", { value: noteText, onChange: (e) => setNoteText(e.target.value), placeholder: "\u8F93\u5165\u60A8\u7684\u60F3\u6CD5\u6216\u7B14\u8BB0...", rows: 3, className: "w-full p-2 text-xs rounded border border-border bg-editor-bg text-foreground focus:outline-none focus:border-primary select-text mb-2 resize-none" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-1.5 justify-end", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                setNoteEditingHlId(null);
                                setNoteText('');
                            }, className: "px-2.5 py-1 text-[10px] font-semibold rounded border border-border hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer", children: "\u53D6\u6D88" }), (0, jsx_runtime_1.jsx)("button", { onClick: handleSaveNote, className: "px-2.5 py-1 text-[10px] font-bold rounded bg-primary text-primary-foreground hover:bg-primary/95 active:scale-95 transition-all duration-150 cursor-pointer", children: "\u4FDD\u5B58\u60F3\u6CD5" })] })] }));
    };
    const isMineruActiveView = mineruConfig.enable && mineruStatus === 'done' && mineruMarkdown && mineruViewActive && mineruParas.length > 0;
    const hasMineruTranslations = (0, react_1.useMemo)(() => {
        if (mineruParas.length === 0)
            return false;
        return mineruParas.some(p => !!currentPageText?.translations?.[p.id]);
    }, [mineruParas, currentPageText?.translations]);
    const hasTranslations = !!(currentPageText?.translations && Object.keys(currentPageText.translations).length > 0);
    const pageHasTranslations = isMineruActiveView ? hasMineruTranslations : hasTranslations;
    // Auto-translate on page turn if remembered mode is translation or bilingual
    (0, react_1.useEffect)(() => {
        if (!currentPageText)
            return;
        if ((layoutMode === 'translation' || layoutMode === 'bilingual') && !pageHasTranslations && !loading) {
            handleTranslatePage();
        }
    }, [currentPageText?.pageNumber, layoutMode, pageHasTranslations]);
    const annotatedParagraphs = (0, react_1.useMemo)(() => {
        if (!currentPageText?.paragraphs)
            return [];
        const roles = classifyParagraphs(currentPageText.paragraphs);
        return currentPageText.paragraphs.map((p, i) => ({
            ...p,
            role: roles[i],
        }));
    }, [currentPageText?.paragraphs]);
    const [bubbleCoords, setBubbleCoords] = (0, react_1.useState)(null);
    const [selectedText, setSelectedText] = (0, react_1.useState)('');
    const [selectedParaId, setSelectedParaId] = (0, react_1.useState)(null);
    const handleAddFromBubble = () => {
        if (!selectedText || !selectedParaId)
            return;
        const isChinese = /[\u4e00-\u9fa5]/.test(selectedText);
        if (isChinese) {
            setGlossaryTarget(selectedText);
            setGlossarySource('');
        }
        else {
            setGlossarySource(selectedText);
            setGlossaryTarget('');
        }
        setAddingGlossaryParaId(selectedParaId);
        setBubbleCoords(null);
        window.getSelection()?.removeAllRanges();
    };
    (0, react_1.useEffect)(() => {
        const checkSelection = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                setBubbleCoords(null);
                setSelectedText('');
                return;
            }
            // Check if selecting inside input/textarea
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                setBubbleCoords(null);
                return;
            }
            // Find the anchor node's parent paragraph to know which paragraph is selected
            let node = sel.anchorNode;
            let paraId = null;
            while (node) {
                if (node instanceof HTMLElement && node.dataset.paragraphId) {
                    paraId = node.dataset.paragraphId;
                    break;
                }
                node = node.parentNode;
            }
            const text = sel.toString().trim();
            if (!text) {
                setBubbleCoords(null);
                return;
            }
            try {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const articleEl = document.querySelector('article');
                if (articleEl && paraId) {
                    const articleRect = articleEl.getBoundingClientRect();
                    const relativeX = rect.left - articleRect.left + rect.width / 2;
                    const clampedX = Math.max(50, Math.min(articleRect.width - 50, relativeX));
                    setBubbleCoords({
                        x: clampedX,
                        y: rect.top - articleRect.top - 36
                    });
                    setSelectedText(text);
                    setSelectedParaId(paraId);
                }
                else {
                    setBubbleCoords(null);
                }
            }
            catch (err) {
                setBubbleCoords(null);
            }
        };
        document.addEventListener('mouseup', checkSelection);
        document.addEventListener('keyup', checkSelection);
        return () => {
            document.removeEventListener('mouseup', checkSelection);
            document.removeEventListener('keyup', checkSelection);
        };
    }, [annotatedParagraphs]);
    // Scroll active paragraph into view
    (0, react_1.useEffect)(() => {
        if (activeParagraphId) {
            const elements = document.querySelectorAll(`[data-paragraph-id="${activeParagraphId}"]`);
            if (elements.length > 0) {
                elements[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [activeParagraphId]);
    const handleParagraphHover = (id) => {
        store_1.useStore.setState({ activeParagraphId: id });
        (0, vscode_1.postMessage)({
            type: 'panel-hover',
            id: id || undefined
        });
    };
    const splitChineseSentences = (text) => {
        const results = [];
        const re = /[^。！？]*[。！？]+(?:\s|$)/g;
        let m;
        let last = 0;
        while ((m = re.exec(text)) !== null) {
            results.push(m[0]);
            last = re.lastIndex;
        }
        if (last < text.length) {
            const rest = text.slice(last).trim();
            if (rest)
                results.push(rest);
        }
        return results.filter(s => s.trim().length > 0);
    };
    const alignSentences = (englishSentences, translatedText) => {
        if (!translatedText)
            return [];
        if (!englishSentences || englishSentences.length === 0) {
            return [{ id: '', text: translatedText }];
        }
        const chineseSentences = splitChineseSentences(translatedText);
        if (chineseSentences.length === englishSentences.length) {
            return englishSentences.map((eng, idx) => ({
                id: eng.id,
                text: chineseSentences[idx]
            }));
        }
        if (englishSentences.length === 1) {
            return [{ id: englishSentences[0].id, text: translatedText }];
        }
        return [{ id: englishSentences[0].id, text: translatedText }];
    };
    const renderEnglishParagraph = (para) => {
        if (para.sentences && para.sentences.length > 0) {
            return para.sentences.map((sent) => ((0, jsx_runtime_1.jsxs)("span", { "data-sentence-id": sent.id, className: "translation-tab-sentence", children: [renderTextWithHighlightsAndCitations(sent.text, para.id, bibliography, highlights, handleHighlightClick), ' '] }, sent.id)));
        }
        return renderTextWithHighlightsAndCitations(para.text, para.id, bibliography, highlights, handleHighlightClick);
    };
    const renderChineseParagraph = (para, translation) => {
        if (!translation)
            return '';
        // If translation has CZ placeholders, use renderTextWithPlaceholders
        const hasPlaceholders = /\[\[CZ(NUM|FIG|CZNAR|CZPAR)_\d+\]\]/.test(translation);
        if (hasPlaceholders) {
            return renderTextWithPlaceholders(translation, para, bibliography, highlights, handleHighlightClick);
        }
        const aligned = alignSentences(para.sentences, translation);
        if (aligned.length > 0) {
            return aligned.map((sent) => ((0, jsx_runtime_1.jsx)("span", { "data-sentence-id": sent.id || undefined, className: "translation-tab-sentence", children: renderTextWithHighlightsAndCitations(sent.text, para.id, bibliography, highlights, handleHighlightClick) }, sent.id || para.id)));
        }
        return renderTextWithHighlightsAndCitations(translation, para.id, bibliography, highlights, handleHighlightClick);
    };
    const handleTranslatePage = () => {
        if (!currentPageText)
            return;
        store_1.useStore.setState({ isTranslating: true });
        const isMineruActive = mineruConfig.enable && mineruStatus === 'done' && mineruMarkdown && mineruViewActive && mineruParas.length > 0;
        const translatableParagraphs = isMineruActive
            ? mineruParas.map(para => {
                const { protectedText } = protectMathAndCitations(para.text);
                return { id: para.id, text: protectedText };
            })
            : currentPageText.paragraphs
                .filter(para => !para.skipped && para.lineMarker !== 'horizontal-rule' && !!para.text.trim())
                .map(para => {
                const protectedText = protectTextWithPlaceholders(para.text);
                return { id: para.id, text: protectedText };
            });
        (0, vscode_1.postMessage)({
            type: 'translate-page',
            pageNumber: currentPageText.pageNumber,
            paragraphs: translatableParagraphs
        });
    };
    const handleRefreshText = () => {
        (0, vscode_1.postMessage)({
            type: 'refresh-page-text'
        });
    };
    const handleMineruToggle = () => {
        if (mineruStatus === 'parsing') {
            return;
        }
        if (mineruStatus === 'done') {
            setMineruViewActive(!mineruViewActive);
        }
        else {
            if (activePdfUri) {
                (0, vscode_1.postMessage)({
                    type: 'trigger-mineru-parse',
                    pdfUri: activePdfUri
                });
                store_1.useStore.setState({ mineruStatus: 'parsing', mineruProgress: 0 });
            }
        }
    };
    const paraClass = (para, mode, prevPara) => {
        const role = para.role;
        const styles = mode === 'en' ? EN_STYLES
            : mode === 'zh' ? ZH_STYLES
                : mode === 'bi-en' ? BI_EN_STYLES
                    : BI_ZH_STYLES;
        const indent = (mode === 'en') ? EN_INDENT[role]
            : (mode === 'zh') ? ZH_INDENT[role]
                : '';
        // Add font-bold from PDF data when role doesn't already include bold
        const boldClass = (para.bold && role !== 'title' && role !== 'heading') ? 'font-bold' : '';
        const spacing = (role === 'heading' && isHeadingContinuation(prevPara, para))
            ? 'mb-1'
            : PARA_SPACING[role];
        return `${styles[role]} ${indent} ${boldClass} ${spacing}`;
    };
    const renderTableRow = (id, text, className) => {
        const cells = splitTableCells(text);
        const paraId = id.split('-')[0];
        if (cells.length <= 1) {
            return ((0, jsx_runtime_1.jsx)("p", { className: className, children: renderTextWithHighlightsAndCitations(text, paraId, bibliography, highlights, handleHighlightClick) }, id));
        }
        return ((0, jsx_runtime_1.jsx)("div", { className: `${className} grid gap-x-4 gap-y-1 font-mono`, style: { gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }, children: cells.map((cell, idx) => ((0, jsx_runtime_1.jsx)("span", { className: "block whitespace-pre-wrap break-words", children: renderTextWithHighlightsAndCitations(cell, paraId, bibliography, highlights, handleHighlightClick) }, `${id}-${idx}`))) }, id));
    };
    const wrapHoverableParagraph = (para, child) => {
        return ((0, jsx_runtime_1.jsxs)("div", { "data-paragraph-id": para.id, onMouseEnter: (e) => {
                if (e.buttons === 1)
                    return; // Do not hover while selecting/dragging
                handleParagraphHover(para.id);
            }, onMouseLeave: (e) => {
                if (e.buttons === 1)
                    return; // Do not hover while selecting/dragging
                handleParagraphHover(null);
            }, className: `translation-tab-paragraph relative ${activeParagraphId === para.id ? 'active' : ''}`, children: [child, renderInlineGlossaryForm(para), renderInlineNoteForm(para.id)] }, para.id));
    };
    const renderOriginalParagraphNode = (para, prevPara) => {
        if (para.lineMarker === 'horizontal-rule') {
            return (0, jsx_runtime_1.jsx)("hr", { className: "border-0 border-t border-border/45 my-4" }, para.id);
        }
        if (para.imageDataUrl) {
            return ((0, jsx_runtime_1.jsx)("figure", { className: "mb-4", children: (0, jsx_runtime_1.jsx)("img", { src: para.imageDataUrl, alt: para.imageAlt || 'table image', className: "w-full rounded border border-border/40 shadow-sm" }) }, para.id));
        }
        if (para.skipped) {
            if (isCollapsibleNoiseSkip(para))
                return null;
            const h = Math.max(4, Math.min(220, para.height || para.fontSize || 12));
            return (0, jsx_runtime_1.jsx)("div", { className: "opacity-0 pointer-events-none", style: { height: `${h}px` }, "aria-hidden": true }, para.id);
        }
        const className = paraClass(para, 'en', prevPara);
        if (para.blockType === 'table') {
            return wrapHoverableParagraph(para, renderTableRow(`${para.id}-en`, para.text, className));
        }
        return wrapHoverableParagraph(para, (0, jsx_runtime_1.jsx)("p", { className: className, children: renderEnglishParagraph(para) }));
    };
    const renderTranslatedParagraphNode = (para, prevPara) => {
        if (para.lineMarker === 'horizontal-rule') {
            return (0, jsx_runtime_1.jsx)("hr", { className: "border-0 border-t border-border/45 my-4" }, para.id);
        }
        if (para.imageDataUrl) {
            return ((0, jsx_runtime_1.jsx)("figure", { className: "mb-4", children: (0, jsx_runtime_1.jsx)("img", { src: para.imageDataUrl, alt: para.imageAlt || 'table image', className: "w-full rounded border border-border/40 shadow-sm" }) }, para.id));
        }
        if (para.skipped) {
            if (isCollapsibleNoiseSkip(para))
                return null;
            const h = Math.max(4, Math.min(220, para.height || para.fontSize || 12));
            return (0, jsx_runtime_1.jsx)("div", { className: "opacity-0 pointer-events-none", style: { height: `${h}px` }, "aria-hidden": true }, para.id);
        }
        const className = paraClass(para, 'zh', prevPara);
        const translated = currentPageText.translations?.[para.id] || '';
        if (para.blockType === 'table') {
            return wrapHoverableParagraph(para, renderTableRow(`${para.id}-zh`, translated || para.text, className));
        }
        return wrapHoverableParagraph(para, (0, jsx_runtime_1.jsx)("p", { className: className, children: renderChineseParagraph(para, translated) }));
    };
    const renderBilingualParagraphNode = (para, prevPara) => {
        if (para.lineMarker === 'horizontal-rule') {
            return (0, jsx_runtime_1.jsx)("hr", { className: "border-0 border-t border-border/45 my-4" }, para.id);
        }
        if (para.imageDataUrl) {
            return ((0, jsx_runtime_1.jsx)("figure", { className: "mb-4", children: (0, jsx_runtime_1.jsx)("img", { src: para.imageDataUrl, alt: para.imageAlt || 'table image', className: "w-full rounded border border-border/40 shadow-sm" }) }, para.id));
        }
        if (para.skipped) {
            if (isCollapsibleNoiseSkip(para))
                return null;
            const h = Math.max(4, Math.min(220, para.height || para.fontSize || 12));
            return (0, jsx_runtime_1.jsx)("div", { className: "opacity-0 pointer-events-none", style: { height: `${h}px` }, "aria-hidden": true }, para.id);
        }
        const translation = currentPageText.translations?.[para.id];
        return wrapHoverableParagraph(para, (0, jsx_runtime_1.jsxs)("div", { className: "mb-4 pb-3 border-b border-border/20 last:border-0", children: [para.blockType === 'table'
                    ? renderTableRow(`${para.id}-en`, para.text, `${paraClass(para, 'bi-en', prevPara)} mb-1.5`)
                    : ((0, jsx_runtime_1.jsx)("p", { className: `${paraClass(para, 'bi-en', prevPara)} mb-1.5`, children: renderEnglishParagraph(para) })), translation && (para.blockType === 'table'
                    ? renderTableRow(`${para.id}-zh`, translation, `${paraClass(para, 'bi-zh', prevPara)} mt-1 border-l-2 border-primary/20 pl-3`)
                    : ((0, jsx_runtime_1.jsx)("p", { className: `${paraClass(para, 'bi-zh', prevPara)} mt-1 border-l-2 border-primary/20 pl-3`, children: renderChineseParagraph(para, translation) })))] }));
    };
    const renderColumnBlock = (block, columnsCount, renderPara) => {
        const perColumn = Array.from({ length: columnsCount }, () => []);
        for (const para of block.paragraphs) {
            const col = getParagraphColumnIndex(para, columnsCount);
            if (col >= 0 && col < columnsCount) {
                perColumn[col].push(para);
            }
        }
        return ((0, jsx_runtime_1.jsx)("div", { className: "grid gap-5 w-full", style: { gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }, children: perColumn.map((colParas, colIdx) => ((0, jsx_runtime_1.jsx)("div", { className: colIdx > 0 ? 'flex flex-col border-l border-dashed border-border/40 pl-5' : 'flex flex-col', children: colParas.map((para, idx) => renderPara(para, previousSemanticParagraph(colParas, idx))) }, `col-${colIdx}`))) }));
    };
    // ── Render helpers for each mode ──
    const renderOriginalBlockLayout = () => {
        const hasColumnHints = annotatedParagraphs.some(p => (p.columnIndex !== undefined && p.columnIndex >= 0) || p.section === 'left' || p.section === 'right');
        if (currentPageText.columnsCount > 1 && hasColumnHints) {
            const blocks = groupParagraphsIntoBlocks(annotatedParagraphs, currentPageText.columnsCount);
            return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300 flex flex-col gap-3", children: blocks.map((block, idx) => {
                    if (block.type === 'single') {
                        return ((0, jsx_runtime_1.jsx)("div", { className: "w-full", children: block.paragraphs.map((para, i) => renderOriginalParagraphNode(para, previousSemanticParagraph(block.paragraphs, i))) }, idx));
                    }
                    return (0, jsx_runtime_1.jsx)("div", { children: renderColumnBlock(block, currentPageText.columnsCount, renderOriginalParagraphNode) }, idx);
                }) }));
        }
        return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300", style: {
                columnCount: currentPageText.columnsCount > 1 ? currentPageText.columnsCount : undefined,
                columnGap: '20px',
                columnRule: currentPageText.columnsCount > 1 ? '1px dashed var(--border)' : undefined,
            }, children: annotatedParagraphs.map((para, i) => renderOriginalParagraphNode(para, previousSemanticParagraph(annotatedParagraphs, i))) }));
    };
    const renderTranslationBlockLayout = () => {
        const hasColumnHints = annotatedParagraphs.some(p => (p.columnIndex !== undefined && p.columnIndex >= 0) || p.section === 'left' || p.section === 'right');
        if (currentPageText.columnsCount > 1 && hasColumnHints) {
            const blocks = groupParagraphsIntoBlocks(annotatedParagraphs, currentPageText.columnsCount);
            return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words animate-in fade-in duration-300 flex flex-col gap-4", children: blocks.map((block, idx) => {
                    if (block.type === 'single') {
                        return ((0, jsx_runtime_1.jsx)("div", { className: "w-full", children: block.paragraphs.map((para, i) => renderTranslatedParagraphNode(para, previousSemanticParagraph(block.paragraphs, i))) }, idx));
                    }
                    return (0, jsx_runtime_1.jsx)("div", { children: renderColumnBlock(block, currentPageText.columnsCount, renderTranslatedParagraphNode) }, idx);
                }) }));
        }
        return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words animate-in fade-in duration-300", style: {
                columnCount: currentPageText.columnsCount > 1 ? currentPageText.columnsCount : undefined,
                columnGap: '20px',
                columnRule: currentPageText.columnsCount > 1 ? '1px dashed var(--border)' : undefined,
            }, children: annotatedParagraphs.map((para, i) => renderTranslatedParagraphNode(para, previousSemanticParagraph(annotatedParagraphs, i))) }));
    };
    const renderBilingualBlockLayout = () => {
        const hasColumnHints = annotatedParagraphs.some(p => (p.columnIndex !== undefined && p.columnIndex >= 0) || p.section === 'left' || p.section === 'right');
        if (currentPageText.columnsCount > 1 && hasColumnHints) {
            const blocks = groupParagraphsIntoBlocks(annotatedParagraphs, currentPageText.columnsCount);
            return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words animate-in fade-in duration-300 flex flex-col gap-4", children: blocks.map((block, idx) => {
                    if (block.type === 'single') {
                        return ((0, jsx_runtime_1.jsx)("div", { className: "w-full", children: block.paragraphs.map((para, i) => renderBilingualParagraphNode(para, previousSemanticParagraph(block.paragraphs, i))) }, idx));
                    }
                    return (0, jsx_runtime_1.jsx)("div", { children: renderColumnBlock(block, currentPageText.columnsCount, renderBilingualParagraphNode) }, idx);
                }) }));
        }
        return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words animate-in fade-in duration-300", children: annotatedParagraphs.map((para, i) => renderBilingualParagraphNode(para, previousSemanticParagraph(annotatedParagraphs, i))) }));
    };
    const handleArticleClick = (e) => {
        const target = e.target;
        // Handle highlight clicks
        const hlSpan = target.closest('[data-highlight-id]');
        if (hlSpan) {
            const hlId = hlSpan.getAttribute('data-highlight-id');
            const hl = highlights.find(h => h.id === hlId);
            if (hl) {
                e.stopPropagation();
                const rect = hlSpan.getBoundingClientRect();
                handleHighlightClick(hl, rect);
                return;
            }
        }
        // Handle citation jumps
        const citationSpan = target.closest('[data-jump-citation]');
        if (citationSpan) {
            const key = citationSpan.getAttribute('data-jump-citation');
            const hasRef = bibliography[key];
            if (hasRef) {
                e.stopPropagation();
                window.getSelection()?.removeAllRanges();
                (0, vscode_1.postMessage)({
                    type: 'jump-to-page',
                    pageNumber: bibliography[key].pageNumber
                });
                return;
            }
        }
        // Handle figure jumps
        const captionSpan = target.closest('[data-jump-caption]');
        if (captionSpan) {
            const query = captionSpan.getAttribute('data-jump-caption');
            e.stopPropagation();
            window.getSelection()?.removeAllRanges();
            (0, vscode_1.postMessage)({
                type: 'find-and-jump-to-caption',
                query
            });
            return;
        }
    };
    const renderMineruContent = (text, paraId) => {
        let processed = applyHighlightsToMineruText(text, paraId, highlights);
        processed = applyJumpLinksToMineruText(processed, bibliography);
        processed = renderMathInText(processed);
        const html = marked_1.marked.parse(processed, { async: false });
        return ((0, jsx_runtime_1.jsx)("div", { dangerouslySetInnerHTML: { __html: html }, className: "mineru-markdown-content text-left" }));
    };
    const renderOriginalMineruNode = (para) => {
        return wrapHoverableParagraph({ id: para.id, text: para.originalText, role: para.role === 'table' ? 'small' : para.role }, renderMineruContent(para.originalText, para.id));
    };
    const renderTranslatedMineruNode = (para) => {
        const translationRaw = currentPageText.translations?.[para.id] || '';
        const textToRender = translationRaw
            ? restoreMathAndCitationsFallback(translationRaw, para.originalText)
            : para.originalText;
        return wrapHoverableParagraph({ id: para.id, text: para.originalText, role: para.role === 'table' ? 'small' : para.role }, renderMineruContent(textToRender, para.id));
    };
    const renderBilingualMineruNode = (para) => {
        const translationRaw = currentPageText.translations?.[para.id] || '';
        const textToRender = translationRaw
            ? restoreMathAndCitationsFallback(translationRaw, para.originalText)
            : '';
        return wrapHoverableParagraph({ id: para.id, text: para.originalText, role: para.role === 'table' ? 'small' : para.role }, (0, jsx_runtime_1.jsxs)("div", { className: "mb-4 pb-3 border-b border-border/20 last:border-0 text-left", children: [(0, jsx_runtime_1.jsx)("div", { className: "mb-1.5 italic text-secondary-foreground font-serif", children: renderMineruContent(para.originalText, para.id) }), textToRender && ((0, jsx_runtime_1.jsx)("div", { className: "mt-1 border-l-2 border-primary/20 pl-3 text-foreground font-sans", children: renderMineruContent(textToRender, para.id) }))] }));
    };
    const renderMineruLayout = () => {
        return ((0, jsx_runtime_1.jsx)("div", { className: "select-text selection:bg-accent/30 break-words text-foreground animate-in fade-in duration-300 flex flex-col gap-3 text-left", children: mineruParas.map((para) => {
                if (layoutMode === 'original')
                    return renderOriginalMineruNode(para);
                if (layoutMode === 'translation')
                    return renderTranslatedMineruNode(para);
                return renderBilingualMineruNode(para);
            }) }));
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-4 animate-in fade-in duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex bg-secondary/25 p-0.5 rounded-lg border border-border/40 text-[10px] font-semibold shadow-inner", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setLayoutMode('original'), className: `flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${layoutMode === 'original'
                                    ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                                    : 'text-secondary-foreground hover:text-foreground'}`, children: "\u7EAF\u539F\u6587 (\u82F1\u6587)" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setLayoutMode('translation'), className: `flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${layoutMode === 'translation'
                                    ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                                    : 'text-secondary-foreground hover:text-foreground'}`, children: "\u7EAF\u8BD1\u6587 (\u4E2D\u6587)" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setLayoutMode('bilingual'), className: `flex-1 py-1 rounded text-center cursor-pointer transition-all duration-150 ${layoutMode === 'bilingual'
                                    ? 'bg-primary text-primary-foreground shadow-sm font-bold'
                                    : 'text-secondary-foreground hover:text-foreground'}`, children: "\u53CC\u8BED\u5BF9\u7167" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: handleRefreshText, title: "\u91CD\u65B0\u63D0\u53D6\u5F53\u524D\u9875\u539F\u6587", className: "p-1.5 rounded-lg border border-border/40 bg-secondary/25 text-secondary-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95 transition-all duration-150 cursor-pointer flex-shrink-0", children: (0, jsx_runtime_1.jsx)(lucide_react_1.RefreshCw, { className: "w-3.5 h-3.5" }) })] }), mineruStatus === 'parsing' && ((0, jsx_runtime_1.jsxs)("div", { className: "bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex flex-col gap-1.5 animate-in slide-in-from-top duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center text-[10px] font-bold text-primary", children: [(0, jsx_runtime_1.jsxs)("span", { className: "flex items-center gap-1", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-3 h-3 text-primary animate-pulse" }), "AI \u6B63\u5728\u91CD\u65B0\u6392\u7248\u516C\u5F0F\u4E0E\u8868\u683C..."] }), (0, jsx_runtime_1.jsxs)("span", { children: [mineruProgress, "%"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "w-full bg-secondary h-1 rounded-full overflow-hidden", children: (0, jsx_runtime_1.jsx)("div", { className: "bg-primary h-full transition-all duration-300 rounded-full", style: { width: `${mineruProgress}%` } }) })] })), mineruStatus === 'failed' && ((0, jsx_runtime_1.jsxs)("div", { className: "bg-error/5 border border-error/20 rounded-lg p-2.5 flex flex-col gap-1.5 text-[10px] text-error font-semibold animate-in slide-in-from-top duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { className: "flex items-center gap-1", children: "\u26A0\uFE0F AI \u6392\u7248\u91CD\u6784\u5931\u8D25\uFF0C\u5DF2\u81EA\u52A8\u4F7F\u7528\u6807\u51C6\u6392\u7248" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: handleMineruToggle, className: "text-[9px] underline hover:text-error-hover bg-transparent border-0 cursor-pointer font-bold", children: "\u91CD\u8BD5" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => store_1.useStore.setState({ mineruStatus: 'idle', mineruError: null }), className: "text-[9px] underline hover:text-error-hover bg-transparent border-0 cursor-pointer", children: "\u5FFD\u7565" })] })] }), mineruError && ((0, jsx_runtime_1.jsxs)("div", { className: "text-[9px] opacity-90 font-mono break-all border-t border-error/15 pt-1.5 leading-relaxed", children: [(0, jsx_runtime_1.jsx)("strong", { children: "\u9519\u8BEF\u539F\u7531:" }), " ", mineruError] }))] })), (0, jsx_runtime_1.jsxs)("article", { onClick: handleArticleClick, className: `relative bg-editor-bg border border-border/80 shadow-md rounded-md p-6 min-h-[300px] flex flex-col justify-between transition-all duration-300 ${hoverHighlightStyle === 'bar' ? 'hover-highlight-bar' : 'hover-highlight-overlay'}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center border-b border-border/40 pb-2 mb-4", children: [(0, jsx_runtime_1.jsxs)("span", { className: "text-[8px] font-mono tracking-widest text-secondary-foreground/60 uppercase", children: [layoutMode === 'original' && 'CHUNZEN ACADEMIC READER // ORIGINAL VIEW', layoutMode === 'translation' && 'CHUNZEN ACADEMIC READER // TRANSLATED VIEW', layoutMode === 'bilingual' && 'CHUNZEN ACADEMIC READER // BILINGUAL VIEW', currentPageText && ` (PAGE ${currentPageText.pageNumber})`] }), (0, jsx_runtime_1.jsx)("div", { className: "flex items-center gap-2", children: pageHasTranslations && layoutMode !== 'original' && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded", children: "TRANSLATED" })) })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 flex flex-col justify-start", children: loading ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex-grow flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-300", children: [(0, jsx_runtime_1.jsxs)("div", { className: "relative mb-6", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" }), (0, jsx_runtime_1.jsx)(lucide_react_1.Compass, { className: "w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80" })] }), (0, jsx_runtime_1.jsxs)("h3", { className: "font-zhSerif text-sm font-bold text-foreground mb-1 animate-pulse", children: ["\u6B63\u5728\u7FFB\u8BD1\u7B2C ", currentPageText?.pageNumber || 1, " \u9875"] }), (0, jsx_runtime_1.jsx)("p", { className: "text-[11px] text-secondary-foreground/60 max-w-[220px] leading-relaxed mb-6", children: "\u6B63\u5728\u4F7F\u7528\u9AD8\u7CBE\u5EA6\u5B66\u672F\u7FFB\u8BD1\u5F15\u64CE\u8FDB\u884C\u6574\u9875\u89E3\u6790\u4E0E\u5BF9\u7167\u7FFB\u8BD1\uFF0C\u8BF7\u7A0D\u5019..." }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-3.5 py-2 animate-pulse w-full max-w-xs opacity-40", children: [(0, jsx_runtime_1.jsx)("div", { className: "h-3 bg-secondary/50 rounded w-11/12" }), (0, jsx_runtime_1.jsx)("div", { className: "h-3 bg-secondary/50 rounded w-full" }), (0, jsx_runtime_1.jsx)("div", { className: "h-3 bg-secondary/50 rounded w-4/5" })] })] })) : error ? ((0, jsx_runtime_1.jsx)("div", { className: "p-3.5 rounded bg-error/10 border border-error/20 text-error text-xs leading-relaxed font-mono", children: error })) : currentPageText ? (isMineruActiveView ? (layoutMode === 'original' ? (renderMineruLayout()) : !pageHasTranslations ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center text-center py-12 px-4 animate-in fade-in duration-300", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Languages, { className: "w-12 h-12 mb-4 text-primary/70 stroke-[1.2]" }), (0, jsx_runtime_1.jsx)("h3", { className: "font-zhSerif text-base font-bold text-foreground mb-2", children: "\u6574\u9875\u5B66\u672F\u7FFB\u8BD1 (AI \u6392\u7248)" }), (0, jsx_runtime_1.jsxs)("p", { className: "text-xs text-secondary-foreground/70 max-w-[240px] leading-relaxed mb-6", children: ["\u5DF2\u901A\u8FC7 MinerU \u63D0\u53D6\u7B2C ", currentPageText.pageNumber, " \u9875\u7684\u9AD8\u7CBE\u5EA6\u516C\u5F0F\u4E0E\u8868\u683C\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u5F00\u59CB\u7FFB\u8BD1\u5F53\u524D\u6574\u9875\u5185\u5BB9\u3002"] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleTranslatePage, className: "px-5 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 active:scale-[0.98] rounded-lg shadow-md cursor-pointer transition-all duration-150 inline-flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Languages, { className: "w-3.5 h-3.5" }), "\u7FFB\u8BD1\u5F53\u524D\u9875"] })] })) : (renderMineruLayout())) : (layoutMode === 'original' ? (annotatedParagraphs.length > 0 ? (renderOriginalBlockLayout()) : ((0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center text-center py-10 opacity-70", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.FileCheck, { className: "w-12 h-12 mb-3 text-secondary-foreground/40 stroke-[1.2]" }), (0, jsx_runtime_1.jsx)("h3", { className: "font-zhSerif text-sm font-bold text-foreground mb-1", children: "\u672A\u68C0\u6D4B\u5230\u539F\u6587\u6587\u672C" }), (0, jsx_runtime_1.jsx)("p", { className: "text-[11px] text-secondary-foreground/60 max-w-[200px] leading-relaxed", children: "\u5F53\u524D\u9875\u9762\u672A\u80FD\u6210\u529F\u63D0\u53D6\u5230\u6587\u672C\u6BB5\u843D\u3002" })] }))) : !pageHasTranslations ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center text-center py-12 px-4 animate-in fade-in duration-300", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Languages, { className: "w-12 h-12 mb-4 text-primary/70 stroke-[1.2]" }), (0, jsx_runtime_1.jsx)("h3", { className: "font-zhSerif text-base font-bold text-foreground mb-2", children: "\u6574\u9875\u5B66\u672F\u7FFB\u8BD1" }), (0, jsx_runtime_1.jsxs)("p", { className: "text-xs text-secondary-foreground/70 max-w-[240px] leading-relaxed mb-6", children: ["\u5DF2\u63D0\u53D6\u7B2C ", currentPageText.pageNumber, " \u9875\u7684\u6392\u7248\u539F\u6587\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u5F00\u59CB\u7FFB\u8BD1\u5F53\u524D\u6574\u9875\u5185\u5BB9\u3002"] }), (0, jsx_runtime_1.jsxs)("button", { onClick: handleTranslatePage, className: "px-5 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 active:scale-[0.98] rounded-lg shadow-md cursor-pointer transition-all duration-150 inline-flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Languages, { className: "w-3.5 h-3.5" }), "\u7FFB\u8BD1\u5F53\u524D\u9875"] })] })) : layoutMode === 'translation' ? (renderTranslationBlockLayout()) : (renderBilingualBlockLayout()))) : ((0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center text-center py-10 opacity-70", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.FileCheck, { className: "w-12 h-12 mb-3 text-secondary-foreground/40 stroke-[1.2]" }), (0, jsx_runtime_1.jsx)("h3", { className: "font-zhSerif text-sm font-bold text-foreground mb-1", children: "\u6625\u8749\u5B66\u672F\u8BD1\u7A3F" }), (0, jsx_runtime_1.jsx)("p", { className: "text-[11px] text-secondary-foreground/60 max-w-[200px] leading-relaxed", children: "\u8BF7\u5728\u5DE6\u4FA7 PDF \u7F16\u8F91\u5668\u4E2D\u52A0\u8F7D\u6587\u6863\uFF0C\u4EE5\u81EA\u52A8\u63D0\u53D6\u9875\u9762\u6392\u7248\u5E76\u8FDB\u884C\u7FFB\u8BD1\u3002" })] })) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center border-t border-border/30 pt-2.5 mt-5 text-[8px] font-mono text-secondary-foreground/40", children: [(0, jsx_runtime_1.jsx)("span", { children: "DOCUMENT TRANSLATION SERVICE" }), (0, jsx_runtime_1.jsxs)("span", { children: ["PAGE ", currentPageText?.pageNumber || 1] })] }), bubbleCoords && ((0, jsx_runtime_1.jsxs)("div", { className: "absolute z-[1000] flex items-center bg-zinc-950 text-zinc-100 rounded-full shadow-xl text-[10px] font-bold cursor-pointer transition-all duration-150 transform -translate-x-1/2 scale-100 hover:scale-[1.02] select-none border border-zinc-800 divide-x divide-zinc-800/80 p-0.5", style: {
                            left: `${bubbleCoords.x}px`,
                            top: `${bubbleCoords.y}px`
                        }, onMouseUp: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    handleAddHighlight('yellow');
                                }, title: "\u5212\u7EBF\u9AD8\u4EAE", className: "px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Highlighter, { className: "w-3.5 h-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "\u5212\u7EBF" })] }), (0, jsx_runtime_1.jsxs)("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    handleAddNoteFromBubble();
                                }, title: "\u64B0\u5199\u60F3\u6CD5\u4E0E\u6279\u6CE8", className: "px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.MessageSquareText, { className: "w-3.5 h-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "\u5199\u60F3\u6CD5" })] }), (0, jsx_runtime_1.jsxs)("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    handleAiExplainFromBubble();
                                }, title: "AI \u5B66\u672F\u8BCD\u6C47\u89E3\u91CA", className: "px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-3.5 h-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "AI\u89E3\u91CA" })] }), (0, jsx_runtime_1.jsxs)("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    handleAddFromBubble();
                                }, title: "\u6DFB\u52A0\u5230\u5B66\u672F\u672F\u8BED\u5E93", className: "px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Plus, { className: "w-3.5 h-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "\u8BB0\u672F\u8BED" })] }), (0, jsx_runtime_1.jsxs)("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(selectedText);
                                    setBubbleCoords(null);
                                    window.getSelection()?.removeAllRanges();
                                }, title: "\u590D\u5236\u6240\u9009\u6587\u5B57", className: "px-3 py-1 flex items-center gap-1 text-zinc-300 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer border-0 bg-transparent font-sans", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Copy, { className: "w-3.5 h-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "\u590D\u5236" })] })] })), activeHighlightAction && ((0, jsx_runtime_1.jsxs)("div", { className: "absolute z-[1010] flex flex-col bg-zinc-950 text-zinc-100 rounded-lg shadow-xl text-[10px] font-bold p-2 border border-zinc-800 select-none animate-in fade-in duration-100 font-sans", style: {
                            left: `${activeHighlightAction.rect.x}px`,
                            top: `${activeHighlightAction.rect.y}px`,
                            transform: 'translate(-50%, -100%)',
                            marginTop: '-10px'
                        }, onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("div", { className: "flex gap-2 justify-center mb-1.5 pb-1.5 border-b border-zinc-800/80", children: ['yellow', 'green', 'blue', 'purple'].map(color => ((0, jsx_runtime_1.jsx)("button", { onClick: () => handleChangeHighlightColor(activeHighlightAction.highlight.id, color), className: `w-3.5 h-3.5 rounded-full border transition-all cursor-pointer ${color === 'yellow' ? 'bg-amber-400 border-amber-500' :
                                        color === 'green' ? 'bg-emerald-400 border-emerald-500' :
                                            color === 'blue' ? 'bg-sky-400 border-sky-500' :
                                                'bg-purple-400 border-purple-500'} ${activeHighlightAction.highlight.color === color ? 'scale-125 ring-2 ring-zinc-100' : 'hover:scale-110'}` }, color))) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-1.5 items-center", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: () => {
                                            setNoteEditingHlId(activeHighlightAction.highlight.id);
                                            setNoteText(activeHighlightAction.highlight.note || '');
                                            setActiveHighlightAction(null);
                                        }, className: "px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 cursor-pointer flex items-center gap-1 border-0", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.MessageSquareText, { className: "w-2.5 h-2.5" }), (0, jsx_runtime_1.jsx)("span", { children: "\u60F3\u6CD5" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleDeleteHighlight(activeHighlightAction.highlight.id), className: "px-2 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800/40 rounded text-red-200 cursor-pointer flex items-center justify-center", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Trash2, { className: "w-2.5 h-2.5" }) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setActiveHighlightAction(null), className: "px-1.5 py-1 bg-zinc-900 hover:bg-zinc-800 rounded text-zinc-400 cursor-pointer border-0 flex items-center justify-center", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-2.5 h-2.5" }) })] })] })), aiExplanation && ((0, jsx_runtime_1.jsxs)("div", { className: "fixed bottom-0 left-0 right-0 z-[1030] bg-zinc-950 text-zinc-100 border-t border-zinc-800 shadow-2xl p-4 animate-in slide-in-from-bottom duration-300 rounded-t-xl select-text", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between border-b border-zinc-800 pb-2 mb-2", children: [(0, jsx_runtime_1.jsxs)("span", { className: "text-xs font-bold text-primary flex items-center gap-1.5 font-sans", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-3.5 h-3.5 text-primary animate-pulse" }), " \u6625\u8749 AI \u5B66\u672F\u91CA\u4E49"] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setAiExplanation(null), className: "text-zinc-400 hover:text-zinc-100 bg-transparent border-0 cursor-pointer p-1", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-3.5 h-3.5" }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "max-h-40 overflow-y-auto mb-3", children: [(0, jsx_runtime_1.jsxs)("p", { className: "text-[10px] text-zinc-400 italic mb-2 font-serif border-l-2 border-zinc-800 pl-2", children: ["\u539F\u6587: \"", aiExplanation.text, "\""] }), aiExplanation.loading ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 py-4 justify-center", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-4 h-4 rounded-full border border-primary/20 border-t-primary animate-spin" }), (0, jsx_runtime_1.jsx)("span", { className: "text-xs text-zinc-400 font-sans animate-pulse", children: "AI \u6B63\u5728\u6DF1\u5EA6\u5206\u6790\u4E2D..." })] })) : aiExplanation.error ? ((0, jsx_runtime_1.jsx)("div", { className: "text-red-400 text-xs py-2 font-mono", children: aiExplanation.error })) : ((0, jsx_runtime_1.jsx)("div", { className: "text-[11.5px] leading-relaxed font-serif whitespace-pre-wrap", children: aiExplanation.result }))] }), !aiExplanation.loading && !aiExplanation.error && ((0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 justify-end border-t border-zinc-900 pt-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                            navigator.clipboard.writeText(aiExplanation.result || '');
                                        }, className: "px-2.5 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 cursor-pointer border-0 font-sans", children: "\u590D\u5236\u91CA\u4E49" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                            const text = aiExplanation.text;
                                            const explanation = aiExplanation.result || '';
                                            setGlossarySource(text);
                                            setGlossaryTarget(explanation.slice(0, 50));
                                            setAddingGlossaryParaId(selectedParaId || '');
                                            setAiExplanation(null);
                                        }, className: "px-2.5 py-1 text-[10px] bg-primary text-primary-foreground hover:bg-primary/95 rounded cursor-pointer font-bold border-0 font-sans", children: "\u8BB0\u672F\u8BED" })] }))] }))] })] }));
};
exports.TranslationTab = TranslationTab;
//# sourceMappingURL=TranslationTab.js.map