// All message types for webview ↔ extension host communication

import { GlossaryEntry, JournalInfo, TranslationHistoryEntry } from './models';
import { EngineConfig, GeneralSettings, JournalSource, LayoutConfig } from './config';

// ── PDF Viewer → Extension ──

export interface ReadyMessage { type: 'ready'; }

export interface SentenceHoverMessage {
  type: 'sentence-hover';
  sentenceId: string;
  text: string;
}

export interface SentenceClickMessage {
  type: 'sentence-click';
  sentenceId: string;
  text: string;
}

export interface TextSelectMessage {
  type: 'text-select';
  text: string;
}

export interface DoiFoundMessage {
  type: 'doi-found';
  doi?: string;
  issn?: string;
  journal?: string;
}

export interface TranslatePageParagraphsMessage {
  type: 'translate-page-paragraphs';
  pageNumber: number;
  paragraphs: Array<{ id: string; text: string }>;
}

export interface PdfHoverMessage {
  type: 'pdf-hover';
  id?: string;
}

export interface PageTextLoadedMessage {
  type: 'page-text-loaded';
  pageNumber: number;
  paragraphs: Array<{
    id: string;
    text: string;
    section?: 'header' | 'left' | 'right' | 'footer' | 'full';
    columnIndex?: number;
    sentences?: Array<{ id: string; text: string }>;
    fontSize?: number;
    height?: number;
    bold?: boolean;
    blockType?: string;
    skipped?: boolean;
    skipReason?: string;
    lineMarker?: 'horizontal-rule' | 'table-image' | 'figure-image';
    ruleX1?: number;
    ruleX2?: number;
    imageDataUrl?: string;
    imageAlt?: string;
  }>;
  columnsCount: number;
  translations?: Array<{ id: string; translatedText: string }>;
}

export interface FigureScreenshotCapturedMessage {
  type: 'figure-screenshot-captured';
  pageNumber: number;
  dataUrl: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FigureScreenshotErrorMessage {
  type: 'figure-screenshot-error';
  pageNumber: number;
  reason: string;
}

export type PdfViewerToExtMessage =
  | ReadyMessage
  | SentenceHoverMessage
  | SentenceClickMessage
  | TextSelectMessage
  | DoiFoundMessage
  | TranslatePageParagraphsMessage
  | PageTextLoadedMessage
  | FigureScreenshotCapturedMessage
  | FigureScreenshotErrorMessage
  | PdfHoverMessage;

// ── Extension → Side Panel ──

export interface TranslateResultMessage {
  type: 'translate-result';
  original: string;
  translated: string;
  engine: string;
  cached: boolean;
}

export interface TranslateErrorMessage {
  type: 'translate-error';
  message: string;
}

export interface UpdateJournalMessage {
  type: 'update-journal';
  info: JournalInfo;
}

export interface InitStateMessage {
  type: 'init-state';
  glossary: GlossaryEntry[];
  history: TranslationHistoryEntry[];
  engines: Array<{ name: string; displayName: string; configured: boolean }>;
  priority: string[];
  journalSource: JournalSource;
  cacheMaxSize: number;
  layoutConfig: LayoutConfig;
  engineConfigs: Record<string, Record<string, string>>;
}

export interface EnginesStatusMessage {
  type: 'engines-status';
  engines: Array<{ name: string; displayName: string; configured: boolean }>;
}

export interface EngineTestResultMessage {
  type: 'engine-test-result';
  engineName: string;
  success: boolean;
  message: string;
}

export interface GlossarySyncMessage {
  type: 'glossary-sync';
  terms: GlossaryEntry[];
}

export interface HistorySyncMessage {
  type: 'history-sync';
  history: TranslationHistoryEntry[];
}

export interface SyncPageTextMessage {
  type: 'sync-page-text';
  pageNumber: number;
  paragraphs: Array<{
    id: string;
    text: string;
    section?: 'header' | 'left' | 'right' | 'footer' | 'full';
    columnIndex?: number;
    sentences?: Array<{ id: string; text: string }>;
    fontSize?: number;
    height?: number;
    bold?: boolean;
    blockType?: string;
    skipped?: boolean;
    skipReason?: string;
    lineMarker?: 'horizontal-rule' | 'table-image' | 'figure-image';
    ruleX1?: number;
    ruleX2?: number;
    imageDataUrl?: string;
    imageAlt?: string;
  }>;
  columnsCount: number;
  translations?: Array<{ id: string; translatedText: string }>;
}

export interface SyncPageTranslationMessage {
  type: 'sync-page-translation';
  pageNumber: number;
  translations: Array<{ id: string; translatedText: string }>;
}

export type ExtToPanelMessage =
  | TranslateResultMessage
  | TranslateErrorMessage
  | UpdateJournalMessage
  | InitStateMessage
  | EnginesStatusMessage
  | EngineTestResultMessage
  | GlossarySyncMessage
  | HistorySyncMessage
  | SyncPageTextMessage
  | SyncPageTranslationMessage
  | PdfHoverMessage
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string }
  | { type: 'clear' };

// ── Side Panel → Extension ──

export interface SaveEngineConfigMessage {
  type: 'save-engine-config';
  engineName: string;
  config: Record<string, string>;
}

export interface TestEngineMessage {
  type: 'test-engine';
  engineName: string;
}

export interface SetEnginePriorityMessage {
  type: 'set-engine-priority';
  priority: string[];
}

export interface SaveGeneralSettingsMessage {
  type: 'save-general-settings';
  settings: GeneralSettings;
}

export interface AddTermMessage {
  type: 'add-term';
  source: string;
  target: string;
  category?: string;
}

export interface UpdateTermMessage {
  type: 'update-term';
  id: string;
  source: string;
  target: string;
  category?: string;
}

export interface DeleteTermMessage {
  type: 'delete-term';
  id: string;
}

export interface ImportGlossaryMessage {
  type: 'import-glossary';
  defaultCategory?: string;
}

export interface RestoreDefaultGlossaryMessage {
  type: 'restore-default-glossary';
}

export interface ExportTranslationsMessage {
  type: 'export-translations';
  format: 'markdown' | 'bilingual';
}

export interface TranslatePageMessage {
  type: 'translate-page';
  pageNumber: number;
  paragraphs: Array<{ id: string; text: string }>;
}

export interface PanelHoverMessage {
  type: 'panel-hover';
  id?: string;
}

export type PanelToExtMessage =
  | SaveEngineConfigMessage
  | TestEngineMessage
  | SetEnginePriorityMessage
  | SaveGeneralSettingsMessage
  | AddTermMessage
  | UpdateTermMessage
  | DeleteTermMessage
  | ImportGlossaryMessage
  | RestoreDefaultGlossaryMessage
  | ExportTranslationsMessage
  | TranslatePageMessage
  | PanelHoverMessage
  | { type: 'clear-cache' }
  | { type: 'clear-history' }
  | { type: 'request-state' }
  | { type: 'refresh-page-text' };
