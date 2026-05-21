import { signal } from '@preact/signals';

export type TabId = 'translation' | 'journal' | 'glossary' | 'settings';

export const activeTab = signal<TabId>('translation');