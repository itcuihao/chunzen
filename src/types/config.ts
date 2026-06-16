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
  mineru?: MineruConfig;
}

export interface LayoutConfig {
  useModel: boolean;
  modelEndpoint: string;
  timeoutMs: number;
  hoverHighlightStyle: 'overlay' | 'bar';
  theme: 'auto' | 'dark' | 'light';
  renderScale: 'auto' | 'balanced' | 'high';
}

export interface MineruConfig {
  enable: boolean;
  apiType: 'agent' | 'standard';
  token: string;
}
