import { FunctionComponent } from 'preact';
import { journalInfo } from '../state/journal';

export const JournalTab: FunctionComponent = () => {
  const info = journalInfo.value;

  if (!info) {
    return (
      <div class="tab-panel journal-tab">
        <div class="empty-state">打开 PDF 后自动显示期刊信息</div>
      </div>
    );
  }

  const casClass = (rank: string) => {
    if (rank.includes('一')) return 'badge-cas-1';
    if (rank.includes('二')) return 'badge-cas-2';
    if (rank.includes('三')) return 'badge-cas-3';
    return 'badge-cas-4';
  };

  return (
    <div class="tab-panel journal-tab">
      <section class="panel-section">
        <h3 class="journal-name">{escapeHtml(info.name)}</h3>
        <div class="journal-badges">
          {info.impactFactor && (
            <span class="journal-badge badge-if">IF {info.impactFactor}</span>
          )}
          {info.casRanking && (
            <span class={`journal-badge ${casClass(info.casRanking)}`}>
              中科院 {info.casRanking}
            </span>
          )}
          {info.casSubRanking && (
            <span class={`journal-badge ${casClass(info.casSubRanking)}`}>
              小类 {info.casSubRanking}
            </span>
          )}
          {info.jcrRanking && (
            <span class="journal-badge badge-jcr">JCR {info.jcrRanking}</span>
          )}
          {info.warning && (
            <span class={`journal-badge ${info.warning === '正常' ? 'badge-ok' : 'badge-warning'}`}>
              {info.warning}
            </span>
          )}
        </div>
      </section>

      {(info.issn || info.doi) && (
        <>
          <div class="section-divider" />
          <section class="panel-section journal-meta">
            {info.issn && <p class="journal-doi">ISSN: {info.issn}</p>}
            {info.doi && (
              <p class="journal-doi">
                DOI: <a href={`https://doi.org/${info.doi}`} title="在浏览器打开">{info.doi}</a>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}