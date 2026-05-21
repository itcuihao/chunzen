import { FunctionComponent } from 'preact';
import { activeTab, TabId } from '../state/ui';
import { ExportButton } from './ExportButton';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'translation', label: '翻译' },
  { id: 'journal', label: '期刊信息' },
  { id: 'glossary', label: '术语表' },
  { id: 'settings', label: '设置' }
];

export const TabBar: FunctionComponent = () => {
  return (
    <nav class="tab-bar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          class={`tab-btn ${activeTab.value === tab.id ? 'active' : ''}`}
          onClick={() => activeTab.value = tab.id}
        >
          {tab.label}
        </button>
      ))}
      <ExportButton />
    </nav>
  );
};