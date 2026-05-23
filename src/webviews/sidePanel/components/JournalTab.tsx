import { FunctionComponent } from 'react';
import { useStore } from '../store';
import { Award, AlertTriangle, TrendingUp, BookOpen, ExternalLink, Hash, ShieldCheck, Compass, Percent, Clock, Building, Send, Calendar, User, UserCheck } from 'lucide-react';

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
        {info.journalSource && (
          <div className="mt-4 pt-2.5 border-t border-border/30 text-[9px] text-secondary-foreground/45 flex items-center justify-between font-sans">
            <span>期刊与分区数据源</span>
            <a 
              href={info.url || (info.journalSource === 'ablesci' ? 'https://www.ablesci.com/journal' : 'https://www.letpub.com.cn')} 
              target="_blank" 
              rel="noreferrer" 
              className="font-bold text-accent hover:underline inline-flex items-center gap-0.5"
            >
              {info.journalSource === 'ablesci' ? '科研通 (AbleSci)' : 'LetPub'}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
      </section>

      {/* Paper Metadata Section */}
      {(info.publishYear || info.firstAuthor || info.lastAuthor) && (
        <section className="glass-panel rounded-lg overflow-hidden border border-border bg-card/10 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
            <BookOpen className="w-3.5 h-3.5 text-secondary-foreground" />
            <span className="text-[10px] font-semibold tracking-wider text-secondary-foreground uppercase">论文基本信息</span>
          </div>
          <div className="p-3.5 flex flex-col gap-3 text-xs text-foreground">
            {info.publishYear && (
              <div className="flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-accent/80 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">发表年份</div>
                  <div className="font-semibold mt-0.5">{info.publishYear} 年</div>
                </div>
              </div>
            )}
            
            {info.firstAuthor && (
              <div className="flex items-start gap-2.5">
                <User className="w-4 h-4 text-accent/80 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">第一作者</div>
                  <div className="font-semibold mt-0.5 select-text">{info.firstAuthor}</div>
                  {info.firstAuthorAffiliation && (
                    <div className="text-[10px] text-secondary-foreground/75 mt-0.5 bg-secondary/30 border border-border/30 rounded px-1.5 py-0.5 inline-block leading-snug select-text">
                      {info.firstAuthorAffiliation}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {info.lastAuthor && (
              <div className="flex items-start gap-2.5">
                <UserCheck className="w-4 h-4 text-accent/80 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">通讯作者 (末位)</div>
                  <div className="font-semibold mt-0.5 select-text">{info.lastAuthor}</div>
                  {info.lastAuthorAffiliation && (
                    <div className="text-[10px] text-secondary-foreground/75 mt-0.5 bg-secondary/30 border border-border/30 rounded px-1.5 py-0.5 inline-block leading-snug select-text">
                      {info.lastAuthorAffiliation}
                    </div>
                  )}
                </div>
              </div>
            )}
            {info.paperSource && (
              <div className="mt-1 pt-2 border-t border-border/20 text-[9px] text-secondary-foreground/45 flex items-center justify-between uppercase font-sans">
                <span>数据来源</span>
                <a 
                  href={info.paperSource === 'openalex' ? 'https://openalex.org/' : 'https://www.crossref.org/'} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="font-bold tracking-wider text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  {info.paperSource}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Deep Metrics Section */}
      {(info.selfCitationRate || info.publicationPeriod || info.reviewSpeed || info.acceptanceRate || info.publisher || info.submissionUrl) && (
        <section className="glass-panel rounded-lg overflow-hidden border border-border bg-card/10 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card">
            <TrendingUp className="w-3.5 h-3.5 text-secondary-foreground" />
            <span className="text-[10px] font-semibold tracking-wider text-secondary-foreground uppercase">期刊详情指标</span>
          </div>
          <div className="p-3.5 flex flex-col gap-3 text-xs">
            {/* Grid for small metrics */}
            <div className="grid grid-cols-2 gap-2.5">
              {info.selfCitationRate && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/20 border border-border/40">
                  <Percent className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" />
                  <div>
                    <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">自引率</div>
                    <div className="font-semibold text-foreground mt-0.5">{info.selfCitationRate}</div>
                  </div>
                </div>
              )}
              {info.acceptanceRate && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/20 border border-border/40">
                  <Award className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" />
                  <div>
                    <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">录用比例</div>
                    <div className="font-semibold text-foreground mt-0.5">{info.acceptanceRate}</div>
                  </div>
                </div>
              )}
              {info.reviewSpeed && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/20 border border-border/40 col-span-2">
                  <Clock className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" />
                  <div>
                    <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">审稿周期</div>
                    <div className="font-semibold text-foreground mt-0.5">{info.reviewSpeed}</div>
                  </div>
                </div>
              )}
              {info.publicationPeriod && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/20 border border-border/40">
                  <Clock className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" />
                  <div>
                    <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">出版周期</div>
                    <div className="font-semibold text-foreground mt-0.5">{info.publicationPeriod}</div>
                  </div>
                </div>
              )}
              {info.publisher && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/20 border border-border/40 col-span-2">
                  <Building className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" />
                  <div>
                    <div className="text-[9px] text-secondary-foreground/60 uppercase tracking-wider font-semibold">出版商</div>
                    <div className="font-semibold text-foreground mt-0.5">{info.publisher}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Submission Link Button */}
            {info.submissionUrl && (
              <div className="mt-1 pt-2 border-t border-border/20">
                <a
                  href={info.submissionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 text-accent font-medium transition-all text-xs text-center"
                >
                  <Send className="w-3 h-3" />
                  访问投稿系统
                </a>
              </div>
            )}
            {info.journalSource && (
              <div className="mt-1 pt-2 border-t border-border/20 text-[9px] text-secondary-foreground/45 flex items-center justify-between font-sans">
                <span>数据来源</span>
                <a 
                  href={info.url || (info.journalSource === 'ablesci' ? 'https://www.ablesci.com/journal' : 'https://www.letpub.com.cn')} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="font-bold text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  {info.journalSource === 'ablesci' ? '科研通 (AbleSci)' : 'LetPub'}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

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