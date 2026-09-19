import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import {
  ArrowLeft, FileText, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, XCircle, Download, Eye
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import {
  useGetControlRoom,
  getGetControlRoomQueryKey,
  useListConfirmedFacts,
  getListConfirmedFactsQueryKey,
  getEvidenceManifest
} from "@workspace/api-client-react";
import type { ProductionItem } from "@workspace/api-client-react";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FactDrilldownDialog } from "@/components/FactDrilldownDialog";

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0", 10);

  const { data: controlRoom, isLoading, error } = useGetControlRoom(projectId, {
    query: { enabled: !!projectId, queryKey: getGetControlRoomQueryKey(projectId) }
  });

  const { data: confirmedFacts } = useListConfirmedFacts(projectId, {
    query: { enabled: !!projectId, queryKey: getListConfirmedFactsQueryKey(projectId) }
  });

  const [selectedFactId, setSelectedFactId] = useState<number | null>(null);
  const [workTypeFilter, setWorkTypeFilter] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const filteredFacts = useMemo(() => {
    if (!confirmedFacts) return [];
    if (workTypeFilter === null) return confirmedFacts;
    return confirmedFacts.filter(f => f.workTypeId === workTypeFilter);
  }, [confirmedFacts, workTypeFilter]);

  if (isLoading) {
    return (
      <div className="flex-1 p-10 flex flex-col items-center justify-center animate-pulse gap-4">
         <div className="h-12 w-64 bg-muted rounded-md" />
         <div className="h-4 w-48 bg-muted/50 rounded-md" />
      </div>
    );
  }

  if (error || !controlRoom) {
    return (
      <div className="flex-1 p-10 flex flex-col items-center justify-center text-center">
        <AlertTriangle size={48} className="text-destructive mb-4 opacity-80" />
        <h2 className="text-2xl font-serif text-foreground mb-2">Control Room Unavailable</h2>
        <Link href="/" className="text-primary hover:underline text-sm font-medium">Return to Portfolio</Link>
      </div>
    );
  }

  const { project, workTypeProgress, reviewBacklog, refusalBacklog, sites, lag, evidenceCoverage, derivedMetrics } = controlRoom;

  const handleExportEvidence = async () => {
    try {
      setIsExporting(true);
      toast.info("Generating evidence pack...", { id: "export-toast" });
      const manifest = await getEvidenceManifest(projectId);

      const escapeHtml = (unsafe: string | null | undefined) => {
        if (!unsafe) return '';
        return unsafe
          .toString()
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Evidence Pack: ${escapeHtml(manifest.project.name)}</title>
          <style>
            body { font-family: monospace; line-height: 1.5; padding: 2rem; max-w-5xl; margin: 0 auto; color: #1a1a1a; }
            h1, h2, h3 { font-family: serif; font-weight: normal; }
            .claim { border: 1px solid #ccc; padding: 1rem; margin-bottom: 2rem; border-radius: 4px; }
            .meta { font-size: 0.9em; color: #666; margin-bottom: 1rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9em; }
            th, td { border: 1px solid #eee; padding: 0.5rem; text-align: left; }
            th { background: #f9f9f9; }
            .evidence { margin-top: 1rem; padding: 1rem; background: #fafafa; border-radius: 4px; }
            .hash { font-size: 0.8em; word-break: break-all; color: #888; }
            .status-confirmed { color: #166534; font-weight: bold; }
            .status-refused { color: #991b1b; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Evidence Manifest</h1>
          <div class="meta">
             <p>Project: ${escapeHtml(manifest.project.name)} (ID: ${manifest.project.id})</p>
             <p>Generated: ${escapeHtml(format(new Date(manifest.asOf), 'PPpp'))}</p>
          </div>

          <h2>Adjudicated Claims</h2>
          ${manifest.claims.map(c => `
             <div class="claim">
               <h3>Fact ID: ${c.productionItem.id} <span class="status-${escapeHtml(c.productionItem.status)}">[${escapeHtml(c.productionItem.status)}]</span></h3>
               <div class="meta">
                 Capture Date: ${escapeHtml(format(new Date(c.capture.workDate), 'PP'))}<br>
                 Quantity: ${escapeHtml(c.productionItem.quantity)} ${escapeHtml(c.productionItem.unit)}<br>
                 External ID: ${escapeHtml(c.productionItem.externalId)}
               </div>

               <h4>Chain of Custody</h4>
               <table>
                 <thead><tr><th>Time</th><th>Actor</th><th>Decision</th><th>Notes</th></tr></thead>
                 <tbody>
                   ${c.decisions.map(d => `
                     <tr>
                       <td>${escapeHtml(format(new Date(d.createdAt), 'PP p'))}</td>
                       <td>${escapeHtml(d.actor)}</td>
                       <td>${escapeHtml(d.decision)}</td>
                       <td>${escapeHtml(d.reason) || '-'}</td>
                     </tr>
                   `).join('')}
                 </tbody>
               </table>

               <h4>Supporting Evidence</h4>
               ${c.evidence.map(e => `
                 <div class="evidence">
                   <div><strong>Type:</strong> ${escapeHtml(e.kind)} | <strong>Captured:</strong> ${escapeHtml(format(new Date(e.capturedAt), 'PP p'))}</div>
                   <div class="hash">SHA-256: ${escapeHtml(e.sha256)}</div>
                   <div><strong>Retention:</strong> ${e.retentionUntil ? escapeHtml(format(new Date(e.retentionUntil), 'PP')) : 'Indefinite'}</div>
                   ${e.checks.length > 0 ? `
                     <h5>Deterministic Checks</h5>
                     <ul>
                       ${e.checks.map(check => `<li>[${check.passed ? 'PASS' : 'FAIL'}] ${escapeHtml(check.message)} (${escapeHtml(check.code)})</li>`).join('')}
                     </ul>
                   ` : ''}
                 </div>
               `).join('')}
             </div>
          `).join('')}
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-pack-${projectId}-${format(new Date(), 'yyyyMMdd-HHmm')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Evidence pack downloaded", { id: "export-toast" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate evidence pack", { id: "export-toast" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <header className="flex-none p-6 border-b border-border/60 bg-card/30 backdrop-blur shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-center text-xs font-mono text-muted-foreground hover:text-foreground mb-2 transition-colors">
              <ArrowLeft size={12} className="mr-1" />
              BACK TO PORTFOLIO
            </Link>
            <h1 className="text-3xl font-serif leading-tight">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
              <span>{project.location}</span>
              <span>•</span>
              <span>{project.client}</span>
              <span>•</span>
              <span className="text-primary font-medium">As of {format(new Date(controlRoom.asOf), 'HH:mm')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportEvidence}
              disabled={isExporting}
              className="bg-background border border-border/60 text-foreground hover:bg-muted/50 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={14} />
              {isExporting ? 'Packaging...' : 'Export Evidence'}
            </button>
            <Link href={`/projects/${project.id}/evidence`} className="bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary hover:text-secondary-foreground px-4 py-1.5 rounded font-mono uppercase tracking-wider text-xs transition-colors shadow-sm whitespace-nowrap flex items-center gap-2">
              <Eye size={14} />
              Adjudicate
              {reviewBacklog.length > 0 && (
                <span className="bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded text-[9px]">{reviewBacklog.length}</span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Work Type Progress */}
          <section>
            <h2 className="font-serif text-2xl border-b border-border/60 pb-2 mb-4">Confirmed Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workTypeProgress.map(wt => (
                <button
                  key={wt.workTypeId}
                  onClick={() => setWorkTypeFilter(workTypeFilter === wt.workTypeId ? null : wt.workTypeId)}
                  className={cn(
                    "bg-card border p-4 rounded-lg shadow-sm text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                    workTypeFilter === wt.workTypeId ? "border-primary ring-1 ring-primary" : "border-border/60 hover:border-primary/40"
                  )}
                >
                  <div className="text-sm font-medium mb-3 flex items-center justify-between">
                    <span>{wt.name}</span>
                    {workTypeFilter === wt.workTypeId && <span className="text-[10px] font-mono bg-primary text-primary-foreground px-1.5 py-0.5 rounded">FILTERED</span>}
                  </div>
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-3xl font-serif text-primary leading-none">{wt.confirmed}</div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">/ {wt.planned} {wt.unit} Sold</div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                    <div
                      className={cn("h-full", (wt.ratio || 0) > 1 ? "bg-accent" : "bg-primary")}
                      style={{ width: `${Math.min(100, (wt.ratio || 0) * 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center pt-3 border-t border-border/40">
                    <div className="bg-secondary/10 text-secondary p-1 rounded flex flex-col justify-center">
                      <div className="font-medium text-xs">{wt.statusQuantities.waitingTotal !== '0' && wt.statusQuantities.waitingTotal !== '0.00' ? wt.statusQuantities.waitingTotal : '-'}</div>
                      <div className="uppercase opacity-70">Waiting</div>
                    </div>
                    <div className="bg-destructive/10 text-destructive p-1 rounded flex flex-col justify-center">
                      <div className="font-medium text-xs">{wt.statusQuantities.refused !== '0' && wt.statusQuantities.refused !== '0.00' ? wt.statusQuantities.refused : '-'}</div>
                      <div className="uppercase opacity-70">Refused</div>
                    </div>
                    <div className="bg-muted text-muted-foreground p-1 rounded flex flex-col justify-center">
                      <div className="font-medium text-xs">{(Number(wt.statusQuantities.captured) + Number(wt.statusQuantities.queued)) > 0 ? (Number(wt.statusQuantities.captured) + Number(wt.statusQuantities.queued)) : '-'}</div>
                      <div className="uppercase opacity-70">New</div>
                    </div>
                  </div>
                </button>
              ))}
              {workTypeProgress.length === 0 && (
                <div className="col-span-full p-6 text-center text-muted-foreground bg-muted/10 border border-dashed rounded-lg">
                  No production plans found.
                </div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
               {/* Confirmed Ledger */}
               <section>
                 <h2 className="font-serif text-2xl border-b border-border/60 pb-2 mb-4 flex items-center justify-between">
                   <span>Production Ledger</span>
                   {workTypeFilter ? (
                     <button
                       onClick={() => setWorkTypeFilter(null)}
                       className="text-xs font-mono uppercase tracking-wider text-primary hover:underline"
                     >
                       Clear Filter
                     </button>
                   ) : (
                     <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Defensible Facts Only</span>
                   )}
                 </h2>
                 <div className="bg-card border border-border/60 rounded-lg shadow-sm overflow-hidden">
                   {(!filteredFacts || filteredFacts.length === 0) ? (
                     <div className="p-8 text-center text-muted-foreground">
                       <CheckCircle2 size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="font-medium text-sm">
                          {workTypeFilter === null ? "No confirmed facts yet." : "No confirmed facts for this work type."}
                        </p>
                        <p className="text-xs mt-1">
                          {workTypeFilter === null ? "Review pending items to establish facts." : "Clear the filter to see all confirmed facts."}
                        </p>
                     </div>
                   ) : (
                     <table className="w-full text-sm text-left whitespace-nowrap">
                       <thead className="bg-muted/30 border-b border-border/60 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                         <tr>
                           <th className="px-4 py-3 font-medium">Fact ID</th>
                           <th className="px-4 py-3 font-medium">Date</th>
                           <th className="px-4 py-3 font-medium">Work Type</th>
                           <th className="px-4 py-3 font-medium text-right">Quantity</th>
                           <th className="px-4 py-3 font-medium"></th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border/40">
                         {filteredFacts.slice(0, 10).map(fact => {
                           const wt = workTypeProgress.find(w => w.workTypeId === fact.workTypeId);
                           return (
                             <tr key={fact.id} className="hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => setSelectedFactId(fact.id)}>
                               <td className="px-4 py-3 font-mono text-xs">{fact.id}</td>
                               <td className="px-4 py-3 font-mono text-xs">{format(new Date(fact.workDate), 'MM/dd')}</td>
                               <td className="px-4 py-3">{wt?.name || `Type ${fact.workTypeId}`}</td>
                               <td className="px-4 py-3 text-right font-mono text-primary font-bold">{fact.quantity} {fact.unit}</td>
                               <td className="px-4 py-3 text-right">
                                 <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-primary inline-block" />
                               </td>
                             </tr>
                           )
                         })}
                       </tbody>
                     </table>
                   )}
                 </div>
               </section>

               {/* Backlog Items */}
               <section>
                 <h2 className="font-serif text-2xl border-b border-border/60 pb-2 mb-4">Adjudication Queue</h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-card border border-secondary/30 rounded-lg p-4 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 text-secondary pointer-events-none">
                        <Clock size={64} />
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-secondary mb-1">Needs Review</div>
                      <div className="text-3xl font-serif text-foreground mb-4">{reviewBacklog.length}</div>
                      {reviewBacklog.length > 0 && (
                        <Link href={`/projects/${projectId}/evidence`} className="inline-flex items-center gap-1 text-xs font-mono uppercase text-secondary hover:underline">
                          Process Queue <ChevronRight size={12} />
                        </Link>
                      )}
                    </div>
                    <div className="bg-card border border-destructive/30 rounded-lg p-4 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 text-destructive pointer-events-none">
                        <XCircle size={64} />
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-destructive mb-1">Refused / Rework</div>
                      <div className="text-3xl font-serif text-foreground mb-4">{refusalBacklog.length}</div>
                      <div className="text-xs text-muted-foreground">Pending field correction</div>
                    </div>
                 </div>
               </section>

              {/* Daily Activity */}
              <section>
                <h2 className="font-serif text-2xl border-b border-border/60 pb-2 mb-4">Daily Activity</h2>
                <div className="space-y-4">
                  {controlRoom.dailyActivity.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic p-4 border border-dashed rounded bg-muted/10 text-center">No recent activity.</div>
                  ) : (
                    controlRoom.dailyActivity.map(da => (
                      <div key={da.crewDay.id} className="bg-card border border-border/60 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-medium text-sm">{da.site.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{da.crew.name} • {format(new Date(da.crewDay.workDate), 'MM/dd')}</div>
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {format(new Date(da.capture.capturedAt), 'HH:mm')}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                          <div className="bg-muted/20 p-2 rounded border border-border/40">
                            <div className="font-mono text-[10px] uppercase text-muted-foreground mb-1">Captured</div>
                            <div>{da.quantityByUnit.metres !== '0.00' && da.quantityByUnit.metres !== '0' && `${da.quantityByUnit.metres}m `}{da.quantityByUnit.each !== '0.00' && da.quantityByUnit.each !== '0' && `${da.quantityByUnit.each}ea`}
                              {(da.quantityByUnit.metres === '0.00' || da.quantityByUnit.metres === '0') && (da.quantityByUnit.each === '0.00' || da.quantityByUnit.each === '0') && '-'}
                            </div>
                          </div>
                          <div className="bg-primary/5 p-2 rounded border border-primary/20">
                            <div className="font-mono text-[10px] uppercase text-primary mb-1">Confirmed</div>
                            <div className="text-primary font-medium">{da.confirmedQuantityByUnit.metres !== '0.00' && da.confirmedQuantityByUnit.metres !== '0' && `${da.confirmedQuantityByUnit.metres}m `}{da.confirmedQuantityByUnit.each !== '0.00' && da.confirmedQuantityByUnit.each !== '0' && `${da.confirmedQuantityByUnit.each}ea`}
                              {(da.confirmedQuantityByUnit.metres === '0.00' || da.confirmedQuantityByUnit.metres === '0') && (da.confirmedQuantityByUnit.each === '0.00' || da.confirmedQuantityByUnit.each === '0') && '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-8">
              {/* Telemetry Health */}
              <section className="bg-card border border-border/60 rounded-lg p-5 shadow-sm">
                <h3 className="font-serif text-xl border-b border-border/60 pb-2 mb-4">Telemetry Health</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                       <span>Evidence Accounted</span>
                      <span>{evidenceCoverage.total > 0 ? Math.round(((evidenceCoverage.ready + evidenceCoverage.manualReview) / evidenceCoverage.total) * 100) : 0}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${evidenceCoverage.total > 0 ? ((evidenceCoverage.ready + evidenceCoverage.manualReview) / evidenceCoverage.total) * 100 : 0}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                       <span>{evidenceCoverage.ready} Ready</span>
                       {evidenceCoverage.manualReview > 0 && <span className="text-secondary">{evidenceCoverage.manualReview} Manual review</span>}
                      {evidenceCoverage.failed > 0 && <span className="text-destructive">{evidenceCoverage.failed} Failed</span>}
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Review Lag</div>
                    <div className="flex items-center gap-2">
                       <span className={cn("text-xl font-mono", lag.averageDays && lag.averageDays > 2 ? "text-destructive" : "text-foreground")}>
                         {lag.averageDays !== null ? `${lag.averageDays.toFixed(1)} days` : 'N/A'}
                       </span>
                       <span className="text-xs text-muted-foreground">avg from capture</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Derived Metrics */}
              <section className="bg-card border border-border/60 rounded-lg p-5 shadow-sm">
                <h3 className="font-serif text-xl border-b border-border/60 pb-2 mb-4">Derived Models</h3>
                {derivedMetrics.availability === 'available' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Crew Prod.</div>
                        <div className="font-mono text-foreground">{derivedMetrics.crewProductivity?.toFixed(1) || '-'} /day</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Est. Finish</div>
                        <div className="font-mono text-foreground">{derivedMetrics.forecastFinish ? format(new Date(derivedMetrics.forecastFinish), 'MM/dd') : '-'}</div>
                      </div>
                    </div>
                    {derivedMetrics.assumptions.length > 0 && (
                      <div className="pt-3 border-t border-border/40">
                        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Assumptions</div>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                          {derivedMetrics.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2 text-accent">
                      <AlertTriangle size={14} />
                      <span className="font-medium">Insufficient baseline</span>
                    </div>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      {derivedMetrics.missingReasons.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
              </section>

              {/* Sites Attention */}
              <section className="bg-card border border-border/60 rounded-lg p-5 shadow-sm">
                <h3 className="font-serif text-xl border-b border-border/60 pb-2 mb-4 flex items-center justify-between">
                  <span>Site Status</span>
                </h3>
                <div className="space-y-3">
                  {sites.filter(s => s.attention || !s.visited).slice(0, 5).map(s => (
                    <div key={s.id} className="flex flex-col gap-1 text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{s.name}</span>
                        {s.attention ? (
                          <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-mono uppercase">Attention</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-mono uppercase">Unvisited</span>
                        )}
                      </div>
                      {s.attentionReasons && s.attentionReasons.length > 0 && (
                        <div className="text-xs text-muted-foreground">{s.attentionReasons[0]}</div>
                      )}
                    </div>
                  ))}
                  {sites.every(s => !s.attention && s.visited) && (
                    <div className="text-sm text-muted-foreground italic">All sites nominal and active.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {selectedFactId && (
        <FactDrilldownDialog
          projectId={projectId}
          productionItemId={selectedFactId}
          open={!!selectedFactId}
          onOpenChange={(o) => !o && setSelectedFactId(null)}
        />
      )}
    </div>
  );
}
