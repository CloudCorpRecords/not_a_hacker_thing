import { useGetPortfolioSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Activity, Clock, AlertTriangle, FileText, ChevronRight, XCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export function Overview() {
  const { data: summary, isLoading, error, refetch } = useGetPortfolioSummary();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex-1 p-6 md:p-10 flex flex-col gap-6 animate-in fade-in duration-300">
        <div className="space-y-2">
          <div className="h-10 w-64 bg-muted rounded-md animate-pulse"></div>
          <div className="h-4 w-96 bg-muted/50 rounded-md animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-card border border-border/50 rounded-lg animate-pulse" />)}
        </div>
        <div className="h-64 bg-card border border-border/50 rounded-lg mt-4 animate-pulse"></div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex-1 p-10 flex flex-col items-center justify-center text-center">
        <AlertTriangle size={48} className="text-destructive mb-4 opacity-80" />
        <h2 className="text-2xl font-serif text-foreground mb-2">Portfolio Data Unavailable</h2>
        <p className="text-muted-foreground text-sm max-w-md mb-6">We could not load the latest portfolio telemetry. The API may be unavailable or there was a connection error.</p>
        <button onClick={() => refetch()} className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          Retry Connection
        </button>
      </div>
    );
  }

  const projects = summary.projects;
  const totalReviewBacklog = projects.reduce((acc, p) => acc + p.reviewBacklog, 0);
  const totalRefusals = projects.reduce((acc, p) => acc + p.refusalCount, 0);
  const totalTodayActivity = projects.reduce((acc, p) => acc + p.todayActivityCount, 0);
  const totalAttentionSites = projects.reduce((acc, p) => acc + p.attentionSiteCount, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <header className="flex-none p-6 md:p-10 pb-4 border-b border-border/60 bg-card/30 backdrop-blur shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-serif text-4xl tracking-tight text-foreground leading-none">Portfolio</h1>
              <span className="px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20 text-[10px] font-mono uppercase tracking-wider">Confirmed</span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm flex items-center gap-2">
              <Clock size={14} /> Data as of {format(new Date(summary.asOf), "PPpp")}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-7xl mx-auto w-full">
        {/* Top level metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-5 bg-card border border-border/50 rounded-lg shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-2 font-mono text-[10px] uppercase tracking-wider">
               <Activity size={14} /> Today's Activity
            </div>
            <div className="text-3xl font-serif text-foreground">{totalTodayActivity}</div>
          </div>
          <div className="p-5 bg-card border border-secondary/30 rounded-lg shadow-sm bg-secondary/5">
            <div className="flex items-center gap-2 text-secondary mb-2 font-mono text-[10px] uppercase tracking-wider">
              <FileText size={14} /> Pending Review
            </div>
            <div className="text-3xl font-serif text-secondary">{totalReviewBacklog}</div>
          </div>
          <div className="p-5 bg-card border border-destructive/20 rounded-lg shadow-sm bg-destructive/5">
            <div className="flex items-center gap-2 text-destructive mb-2 font-mono text-[10px] uppercase tracking-wider">
              <XCircle size={14} /> Refused Items
            </div>
            <div className="text-3xl font-serif text-destructive">{totalRefusals}</div>
          </div>
          <div className="p-5 bg-card border border-accent/20 rounded-lg shadow-sm bg-accent/5">
            <div className="flex items-center gap-2 text-accent mb-2 font-mono text-[10px] uppercase tracking-wider">
              <AlertTriangle size={14} /> Attention Sites
            </div>
            <div className="text-3xl font-serif text-accent">{totalAttentionSites}</div>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border/60 rounded-lg bg-card/30">
            <h3 className="text-lg font-serif mb-2">No Active Projects</h3>
            <p className="text-sm text-muted-foreground">There are currently no projects in the portfolio.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl border-b border-border/60 pb-2 mb-4">Operations Control</h2>
            <div className="grid grid-cols-1 gap-4">
              {projects.map((p) => {
                const hasAttention = p.attentionSiteCount > 0 || p.reviewBacklog > 0 || p.refusalCount > 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => setLocation(`/projects/${p.id}`)}
                    className={cn(
                      "group bg-card border rounded-lg p-5 cursor-pointer transition-all hover:shadow-md",
                      hasAttention ? "border-secondary/40 hover:border-secondary" : "border-border/60 hover:border-primary/40"
                    )}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-serif leading-none group-hover:text-primary transition-colors">{p.name}</h3>
                          {p.reviewBacklog > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-secondary/15 text-secondary text-[10px] font-mono uppercase border border-secondary/20">
                              {p.reviewBacklog} Review
                            </span>
                          )}
                          {p.refusalCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-mono uppercase border border-destructive/20">
                              {p.refusalCount} Refused
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex gap-3">
                          <span>{p.location}</span>
                          <span>•</span>
                          <span>{p.client}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono">
                         <div className="text-right">
                           <div className="text-muted-foreground uppercase tracking-wider">Freshness</div>
                           <div className="text-foreground">{p.lastConfirmedAt ? formatDistanceToNow(new Date(p.lastConfirmedAt), { addSuffix: true }) : 'No confirmed data'}</div>
                         </div>
                         <div className="text-right">
                           <div className="text-muted-foreground uppercase tracking-wider">Lag</div>
                           <div className={cn("text-foreground", p.lag.averageDays && p.lag.averageDays > 2 && "text-destructive")}>
                             {p.lag.averageDays ? `${p.lag.averageDays.toFixed(1)}d` : '-'}
                           </div>
                         </div>
                         <ChevronRight size={20} className="text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </div>
                    </div>

                    {p.workTypeProgress.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-border/40">
                        {p.workTypeProgress.map(wt => (
                          <div key={wt.workTypeId} className="flex justify-between items-center bg-muted/20 p-2 rounded">
                            <div className="text-xs font-medium text-foreground truncate pr-2">{wt.name}</div>
                            <div className="text-[10px] font-mono shrink-0 flex items-center gap-1">
                               <span className="text-primary font-bold">{wt.confirmed}</span>
                               <span className="text-muted-foreground">/ {wt.planned} {wt.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-border/40 text-xs font-mono text-muted-foreground italic">
                        No production plans established
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
