import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { glossaryTerms, glossaryFilter, editingTermId } from '../state/glossary';
import { postMessage } from '../vscode';
import { GlossaryEntry } from '../../../types/models';

export const GlossaryTab: FunctionComponent = () => {
  const [showEditor, setShowEditor] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  const filtered = glossaryTerms.value.filter(t =>
    glossaryFilter.value === '' ||
    t.source.toLowerCase().includes(glossaryFilter.value.toLowerCase()) ||
    t.target.includes(glossaryFilter.value)
  );

  const editingTerm = editingTermId.value
    ? glossaryTerms.value.find(t => t.id === editingTermId.value)
    : undefined;

  const handleAdd = () => {
    if (!source.trim() || !target.trim()) return;
    if (editingTerm) {
      postMessage({ type: 'update-term', id: editingTerm.id, source: source.trim(), target: target.trim() });
      editingTermId.value = null;
    } else {
      postMessage({ type: 'add-term', source: source.trim(), target: target.trim() });
    }
    setSource('');
    setTarget('');
    setShowEditor(false);
  };

  const handleEdit = (term: GlossaryEntry) => {
    editingTermId.value = term.id;
    setSource(term.source);
    setTarget(term.target);
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    postMessage({ type: 'delete-term', id });
  };

  const handleCancel = () => {
    editingTermId.value = null;
    setSource('');
    setTarget('');
    setShowEditor(false);
  };

  return (
    <div class="tab-panel glossary-tab">
      <div class="glossary-toolbar">
        <input
          type="text"
          class="glossary-search"
          placeholder="搜索术语..."
          value={glossaryFilter.value}
          onInput={e => glossaryFilter.value = (e.target as HTMLInputElement).value}
        />
        <button class="btn btn-primary" onClick={() => setShowEditor(true)}>
          + 添加
        </button>
      </div>

      {showEditor && (
        <div class="glossary-editor">
          <input
            type="text"
            placeholder="英文术语"
            value={source}
            onInput={e => setSource((e.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            placeholder="中文翻译"
            value={target}
            onInput={e => setTarget((e.target as HTMLInputElement).value)}
          />
          <div class="editor-actions">
            <button class="btn btn-primary" onClick={handleAdd}>
              {editingTerm ? '更新' : '添加'}
            </button>
            <button class="btn btn-secondary" onClick={handleCancel}>取消</button>
          </div>
        </div>
      )}

      <div class="glossary-list">
        {filtered.length === 0 ? (
          <p class="empty-state">
            {glossaryTerms.value.length === 0 ? '暂无术语，点击添加' : '无匹配结果'}
          </p>
        ) : (
          filtered.map(term => (
            <div key={term.id} class="glossary-item">
              <div class="glossary-term">
                <span class="term-source">{term.source}</span>
                <span class="term-arrow">&rarr;</span>
                <span class="term-target">{term.target}</span>
              </div>
              <div class="glossary-actions">
                <button class="btn-icon" title="编辑" onClick={() => handleEdit(term)}>&#9998;</button>
                <button class="btn-icon" title="删除" onClick={() => handleDelete(term.id)}>&#10005;</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};