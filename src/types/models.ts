// Data models shared across extension and webviews

export interface TranslationResult {
  text: string;
  engine: string;
  cached: boolean;
}

export interface TranslationEngine {
  name: string;
  displayName: string;
  /** 为 true 时引擎自行通过 prompt 应用术语表，无需本地后处理 */
  usesGlossaryPrompt?: boolean;
  isConfigured(): boolean;
  /** 仅大模型类引擎实现：以任意 system prompt 完成一次对话（用于 AI 释义等非翻译场景） */
  complete?(systemPrompt: string, userText: string, configOverride?: Record<string, any>): Promise<string>;
  translate(text: string, sourceLang?: string, targetLang?: string, glossary?: GlossaryEntry[], configOverride?: Record<string, any>): Promise<string>;
}

export interface JournalInfo {
  name: string;
  issn?: string;
  eissn?: string;
  impactFactor?: string;
  casRanking?: string;
  casSubRanking?: string;
  jcrRanking?: string;
  warning?: string;
  doi?: string;
  url?: string;
  publisher?: string;
  country?: string;
  selfCitationRate?: string;
  submissionUrl?: string;
  publicationPeriod?: string;
  reviewSpeed?: string;
  acceptanceRate?: string;
  publishYear?: string;
  firstAuthor?: string;
  firstAuthorAffiliation?: string;
  lastAuthor?: string;
  lastAuthorAffiliation?: string;
  journalSource?: 'ablesci' | 'letpub';
  paperSource?: 'crossref' | 'openalex';
}

export interface GlossaryEntry {
  id: string;
  source: string;
  target: string;
  category?: string;
}

export interface TranslationHistoryEntry {
  original: string;
  translated: string;
  engine: string;
  timestamp: number;
}

export interface SelectionHighlight {
  id: string;
  pdfUri: string;
  pageNumber: number;
  paragraphId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'purple';
  note?: string;
  createdAt: number;
}