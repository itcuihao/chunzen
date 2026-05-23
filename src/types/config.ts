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
  type: 'letpub' | 'ablesci' | 'crossref' | 'custom';
  customUrl?: string;
}

export interface GeneralSettings {
  cacheMaxSize?: number;
  journalEnabled?: boolean;
  journalSource?: JournalSource;
  layout?: LayoutConfig;
}

export interface LayoutConfig {
  useModel: boolean;
  modelEndpoint: string;
  timeoutMs: number;
}
