// Configuration types

export interface EngineConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  freeApi?: boolean;
  enabled?: boolean;
  prompt?: string;
}

export interface JournalSource {
  type: 'letpub' | 'crossref' | 'custom';
  customUrl?: string;
}

export interface GeneralSettings {
  cacheMaxSize: number;
  journalEnabled: boolean;
}