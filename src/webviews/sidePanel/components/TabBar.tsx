import { FunctionComponent } from 'react';
import { useStore, TabId } from '../store';
import { ExportButton } from './ExportButton';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'translation', label: '翻译' },
  { id: 'journal', label: '期刊信息' },
  { id: 'glossary', label: '术语表' },
  { id: 'settings', label: '设置' }
];

export const TabBar: FunctionComponent = () => {
  const activeTab = useStore((state) => state.activeTab);
  const setActiveTab = useStore((state) => state.setActiveTab);

  return (
    <nav className="flex items-center justify-between border-b border-border bg-background px-3 py-1 flex-shrink-0 z-10 shadow-sm">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-semibold rounded-md transition-all duration-200 relative ${
                isActive
                  ? 'text-primary bg-secondary'
                  : 'text-secondary-foreground hover:text-foreground hover:bg-secondary-hover/50'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      <ExportButton />
    </nav>
  );
};