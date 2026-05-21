// All message types for webview ↔ extension host communication

import { GlossaryEntry, JournalInfo, TranslationHistoryEntry } from './models';
import { EngineConfig, GeneralSettings, JournalSource } from './config';

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

export type PdfViewerToExtMessage =
  | ReadyMessage
  | SentenceHoverMessage
  | SentenceClickMessage
  | TextSelectMessage
  | DoiFoundMessage;

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

export type ExtToPanelMessage =
  | TranslateResultMessage
  | TranslateErrorMessage
  | UpdateJournalMessage
  | InitStateMessage
  | EnginesStatusMessage
  | EngineTestResultMessage
  | GlossarySyncMessage
  | HistorySyncMessage
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
}

export interface UpdateTermMessage {
  type: 'update-term';
  id: string;
  source: string;
  target: string;
}

export interface DeleteTermMessage {
  type: 'delete-term';
  id: string;
}

export interface ImportGlossaryMessage {
  type: 'import-glossary';
  filePath: string;
}

export interface ExportTranslationsMessage {
  type: 'export-translations';
  format: 'markdown' | 'bilingual';
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
  | ExportTranslationsMessage
  | { type: 'clear-cache' }
  | { type: 'clear-history' }
  | { type: 'request-state' };