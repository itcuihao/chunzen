// Data models shared across extension and webviews

export interface TranslationResult {
  text: string;
  engine: string;
  cached: boolean;
}

export interface TranslationEngine {
  name: string;
  displayName: string;
  isConfigured(): boolean;
  translate(text: string, sourceLang?: string, targetLang?: string): Promise<string>;
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
}

export interface GlossaryEntry {
  id: string;
  source: string;
  target: string;
}

export interface TranslationHistoryEntry {
  original: string;
  translated: string;
  engine: string;
  timestamp: number;
}