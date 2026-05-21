import { signal } from '@preact/signals';
import { GlossaryEntry } from '../../../types/models';

export const glossaryTerms = signal<GlossaryEntry[]>([]);

export const glossaryFilter = signal('');

export const editingTermId = signal<string | null>(null);