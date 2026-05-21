import { signal } from '@preact/signals';
import { TranslationHistoryEntry } from '../../../types/models';

export const currentTranslation = signal<{
  original: string;
  translated: string;
  engine: string;
  cached: boolean;
} | null>(null);

export const translationHistory = signal<TranslationHistoryEntry[]>([]);

export const isTranslating = signal(false);

export const translationError = signal('');