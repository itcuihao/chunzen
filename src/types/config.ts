// Configuration types

export type JournalSourceType = 'ablesci' | 'letpub';

export interface JournalSource {
  type: JournalSourceType;
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
  hoverHighlightStyle: 'overlay' | 'bar';
  theme: 'auto' | 'dark' | 'light';
  renderScale: 'auto' | 'balanced' | 'high';
}

export interface MineruConfig {
  enable: boolean;
  apiType: 'agent' | 'standard';
  token: string;
}
