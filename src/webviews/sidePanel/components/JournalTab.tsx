import { FunctionComponent } from 'react';
import { useStore } from '../store';
import { Award, AlertTriangle, TrendingUp, BookOpen, ExternalLink, Hash, ShieldCheck, Compass } from 'lucide-react';

export const JournalTab: FunctionComponent = () => {
  const info = useStore((state) => state.journalInfo);

  if (!info) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-secondary-foreground/60 animate-in fade-in duration-200">
        <Compass className="w-10 h-10 mb-3 opacity-40 text-accent/50 animate-spin" style={{ animationDuration: '6s' }} />
        <p className="text-xs italic">打开 PDF 后自动显示期刊信息</p>
      </div>
    );
  }

  const isWarning = info.warning && info.warning !== '正常';

  const getCasColorClass = (rank: string) => {
    if (rank.includes('一')) return 'bg-success/10 border-success/30 text-success shadow-[0_0_8px_rgba(72,187,120,0.1)]';
    if (rank.includes('二')) return 'bg-warning/10 border-warning/30 text-warning';
    if (rank.includes('三')) return 'bg-warning/10 border-warning/30 text-warning';
    return 'bg-secondary border-border text-secondary-foreground';
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      {/* Journal Title & Details Card */}
      <section className={`glass-panel rounded-lg overflow-hidden border p-5 transition-all duration-300 hover:shadow-md ${
        isWarning 
          ? 'border-error/40 bg-error/5 warning-card-pulse' 
          : 'border-border bg-card/20'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-sans font-bold text-base leading-snug tracking-tight text-foreground select-text">
            {info.name}
          </h3>
          {isWarning ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-error/20 border border-error/40 text-error shadow-warningGlow animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              {info.warning}
            </div>
          ) : (
            info.warning === '正常' && (
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/10 border border-success/30 text-success">
                <ShieldCheck className="w-3 h-3" />
                正常收录
              </div>
            )
          )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          {info.impactFactor && (
            <div className="flex flex-col p-3 rounded-lg border border-border bg-secondary/30 relative overflow-hidden group hover:border-accent/30 transition-colors">
              <div className="flex items-center gap-1.5 text-secondary-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-accent" />
                <span className="text-[10px] font-medium tracking-wider uppercase">影响因子</span>
              </div>
              <span className="text-xl font-bold text-foreground mt-1 tracking-tight select-text">
                {info.impactFactor}
              </span>
              <div className="absolute right-[-10px] bottom-[-10px] opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="w-16 h-16 text-accent" />
              </div>
            </div>
          )}

          {info.jcrRanking && (
            <div className="flex flex-col p-3 rounded-lg border border-border bg-secondary/30 relative overflow-hidden group hover:border-accent/30 transition-colors">
              <div className="flex items-center gap-1.5 text-secondary-foreground">
                <Award className="w-3.5 h-3.5 text-[var(--badge-jcr-text)]" />
                <span className="text-[10px] font-medium tracking-wider uppercase">JCR 分区</span>
              </div>
              <span className="text-xl font-bold text-[var(--badge-jcr-text)] mt-1 tracking-tight select-text">
                {info.jcrRanking}
              </span>
              <div className="absolute right-[-10px] bottom-[-10px] opacity-5 group-hover:opacity-10 transition-opacity">
                <Award className="w-16 h-16 text-[var(--badge-jcr-text)]" />
              </div>
            </div>
          )}
        </div>

        {/* CAS Rankings */}
        {(info.casRanking || info.casSubRanking) && (
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/30">
            {info.casRanking && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${getCasColorClass(info.casRanking)}`}>
                中科院大类: {info.casRanking}
              </span>
            )}
            {info.casSubRanking && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${getCasColorClass(info.casSubRanking)}`}>
                中科院小类: {info.casSubRanking}
              </span>
            )}
          </div>
        )}
      </section>

      {/* Metadata Section */}
      {(info.issn || info.doi) && (
        <section className="glass-panel rounded-lg overflow-hidden border border-border bg-card/10">
          <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
            <BookOpen className="w-3.5 h-3.5 text-secondary-foreground" />
            <span className="text-[10px] font-semibold tracking-wider text-secondary-foreground uppercase">元数据</span>
          </div>
          <div className="p-3.5 flex flex-col gap-2 font-mono text-xs text-secondary-foreground">
            {info.issn && (
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 opacity-60" />
                <span className="font-semibold select-all">ISSN: {info.issn}</span>
              </div>
            )}
            {info.doi && (
              <div className="flex items-start gap-2 select-text">
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 opacity-60 flex-shrink-0" />
                <div className="flex-1 break-all leading-normal">
                  <span className="text-secondary-foreground/60 mr-1">DOI:</span>
                  <a 
                    href={`https://doi.org/${info.doi}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-accent hover:underline inline-flex items-center gap-0.5 font-semibold"
                  >
                    {info.doi}
                    <ExternalLink className="w-3 h-3 inline opacity-70" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};