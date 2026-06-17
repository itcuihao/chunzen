// All message types for webview ↔ extension host communication

import { GlossaryEntry, JournalInfo, TranslationHistoryEntry, SelectionHighlight } from './models';
import { EngineConfig, GeneralSettings, JournalSource, LayoutConfig, MineruConfig } from './config';

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

export interface PageImageCapturedMessage {
  type: 'page-image-captured';
  pageNumber: number;
  dataUrl: string;
}

export interface PdfPagesTextResultMessage {
  type: 'pdf-pages-text-result';
  paragraphs: Array<{ id: string; text: string; page: number }>;
}

export interface PdfBibliographyExtractedMessage {
  type: 'pdf-bibliography-extracted';
  bibliography: Array<{ key: string; text: string; pageNumber: number }>;
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
  | PageImageCapturedMessage
  | PdfHoverMessage
  | PdfPagesTextResultMessage
  | PdfBibliographyExtractedMessage
  | { type: 'toggle-pdf-fullscreen' };

// ── Extension → Side Panel ──

export interface TranslateResultMessage {
  type: 'translate-result';
  original: string;
  translated: string;
  engine: string;
  cached: boolean;
  cacheSize?: number;
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
  cacheSize?: number;
  layoutConfig: LayoutConfig;
  mineruConfig?: MineruConfig;
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

export interface ExportProgressMessage {
  type: 'export-progress';
  current: number;
  total: number;
  stage: 'extracting' | 'translating' | 'compiling';
  pageNumber?: number;
}

export interface SyncBibliographyMessage {
  type: 'sync-bibliography';
  bibliography: Array<{ key: string; text: string; pageNumber: number }>;
}

export interface AddHighlightMessage {
  type: 'add-highlight';
  id?: string;
  pdfUri: string;
  pageNumber: number;
  paragraphId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'purple';
  note?: string;
}

export interface DeleteHighlightMessage {
  type: 'delete-highlight';
  id: string;
}

export interface UpdateHighlightNoteMessage {
  type: 'update-highlight-note';
  id: string;
  note: string;
}

export interface SyncHighlightsMessage {
  type: 'sync-highlights';
  pdfUri: string;
  highlights: SelectionHighlight[];
}

export interface SetActivePdfMessage {
  type: 'set-active-pdf';
  pdfUri: string;
}

export interface AiExplainMessage {
  type: 'ai-explain';
  text: string;
}

export interface AiExplainResultMessage {
  type: 'ai-explain-result';
  text: string;
  explanation?: string;
  error?: string;
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
  | ExportProgressMessage
  | SyncBibliographyMessage
  | SyncHighlightsMessage
  | SetActivePdfMessage
  | AiExplainResultMessage
  | { type: 'mineru-status'; status: 'idle' | 'parsing' | 'done' | 'failed'; progress?: number; message?: string; error?: string }
  | { type: 'mineru-complete'; markdown: string }
  | { type: 'cache-size-sync'; size: number }
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
  config?: Record<string, string>;
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

export interface ExportDocMessage {
  type: 'export-doc';
  scope: 'read' | 'all' | 'custom';
  customRange?: string;
  untranslatedPolicy: 'english' | 'translate';
  format: 'markdown' | 'chinese' | 'bilingual';
  documentName?: string;
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
  | ExportDocMessage
  | AddHighlightMessage
  | DeleteHighlightMessage
  | UpdateHighlightNoteMessage
  | AiExplainMessage
  | { type: 'clear-cache' }
  | { type: 'clear-history' }
  | { type: 'request-state' }
  | { type: 'refresh-page-text' }
  | { type: 'jump-to-page'; pageNumber: number }
  | { type: 'find-and-jump-to-caption'; query: string }
  | { type: 'trigger-mineru-parse'; pdfUri: string }
  | { type: 'toggle-panel-fullscreen' };
