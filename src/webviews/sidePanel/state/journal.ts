import { signal } from '@preact/signals';
import { JournalInfo } from '../../../types/models';

export const journalInfo = signal<JournalInfo | null>(null);