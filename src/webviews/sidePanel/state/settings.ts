import { signal } from '@preact/signals';

export type EngineStatus = {
  name: string;
  displayName: string;
  configured: boolean;
};

export interface EngineConfigFields {
  apiKey?: string;
  appId?: string;
  secretKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  freeApi?: boolean;
  enabled?: boolean;
  prompt?: string;
  url?: string;
  headers?: string;
  bodyTemplate?: string;
  responsePath?: string;
}

export const engineStatuses = signal<EngineStatus[]>([]);

export const enginePriority = signal<string[]>([]);

export const engineConfigs = signal<Record<string, EngineConfigFields>>({});

export const journalSource = signal<{ type: string }>({ type: 'letpub' });

export const cacheMaxSize = signal(500);

export const testResults = signal<Record<string, { success: boolean; message: string } | null>>({});