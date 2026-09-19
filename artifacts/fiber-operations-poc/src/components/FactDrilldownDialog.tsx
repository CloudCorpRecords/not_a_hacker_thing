import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGetFactDrilldown, getGetFactDrilldownQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Camera, Mic, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidenceWithAudit } from "@workspace/api-client-react";

export function FactDrilldownDialog({ projectId, productionItemId, open, onOpenChange }: { projectId: number, productionItemId: number, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: drilldown, isLoading, error } = useGetFactDrilldown(projectId, productionItemId, {
    query: { enabled: open && !!projectId && !!productionItemId, queryKey: getGetFactDrilldownQueryKey(projectId, productionItemId) }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-border/60">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Fact Provenance</DialogTitle>
          <DialogDescription className="font-mono text-xs uppercase tracking-wider">
             ID: {productionItemId} • Project {projectId}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center animate-pulse space-y-4">
             <div className="h-8 w-48 bg-muted rounded"></div>
             <div className="h-4 w-64 bg-muted/50 rounded"></div>
          </div>
        )}

        {error && (
           <div className="py-12 text-center text-destructive">
             <AlertTriangle size={32} className="mx-auto mb-2 opacity-80" />
             <p>Unable to load fact details.</p>
           </div>
        )}

        {drilldown && (
          <div className="space-y-8 mt-4">
            {/* Summary */}
            <div className="bg-card border border-border/60 p-4 rounded-lg flex items-center justify-between flex-wrap gap-4">
               <div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Status</div>
                  <div className="flex items-center gap-2">
                    {drilldown.productionItem.status === 'confirmed' ? (
                      <CheckCircle2 size={18} className="text-primary" />
                    ) : drilldown.productionItem.status === 'refused' ? (
                      <XCircle size={18} className="text-destructive" />
                    ) : (
                      <Info size={18} className="text-secondary" />
                    )}
                    <span className="font-serif text-xl capitalize">{drilldown.productionItem.status}</span>
                  </div>
               </div>
               <div className="text-right">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Production</div>
                  <div className="font-mono text-xl font-bold text-foreground">
                    {drilldown.productionItem.quantity} <span className="text-sm font-normal text-muted-foreground">{drilldown.productionItem.unit}</span>
                  </div>
               </div>
               <div className="text-right">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Work Date</div>
                  <div className="font-mono text-sm text-foreground">
                    {format(new Date(drilldown.crewDay.workDate), 'MM/dd/yyyy')}
                  </div>
               </div>
            </div>

            {/* Context */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 border border-border/50 p-4 rounded-lg">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Work Type</div>
                <div className="text-sm font-medium">{drilldown.workType.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Site</div>
                <div className="text-sm font-medium">{drilldown.site.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Crew</div>
                <div className="text-sm font-medium">{drilldown.crew.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Captured</div>
                <div className="text-sm font-medium font-mono text-xs">{format(new Date(drilldown.capture.capturedAt), 'MM/dd HH:mm')}</div>
              </div>
            </div>

            {/* Chain of Custody */}
            <div>
               <h3 className="font-serif text-xl border-b border-border/60 pb-2 mb-4">Chain of Custody</h3>
               <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/60 before:to-transparent">
                  {drilldown.productionAuditEvents.map((evt, i) => (
                    <div key={evt.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-muted text-muted-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        {evt.decision === 'confirmed' ? <CheckCircle2 size={16} className="text-primary" /> :
                         evt.decision === 'refused' ? <XCircle size={16} className="text-destructive" /> :
                         <FileText size={16} />}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-card border border-border/60 p-4 rounded-lg shadow-sm">
                         <div className="flex justify-between items-start mb-2">
                           <div className="text-sm font-medium capitalize">{evt.decision.replace('_', ' ')}</div>
                           <div className="text-[10px] font-mono text-muted-foreground">{format(new Date(evt.createdAt), 'MM/dd HH:mm')}</div>
                         </div>
                         <div className="text-xs text-foreground mb-2 flex items-center gap-2">
                           <span className="font-mono uppercase tracking-wider text-[10px] bg-muted/50 px-1 rounded">{evt.actor}</span>
                         </div>
                         {evt.metadata.correctedQuantity && (
                           <div className="text-xs text-secondary mt-1">
                             Quantity corrected from {evt.metadata.previousQuantity} to {evt.metadata.correctedQuantity}
                           </div>
                         )}
                         {evt.reason && (
                           <div className="text-xs text-muted-foreground mt-2 bg-muted/20 p-2 rounded border border-border/30 italic">"{evt.reason}"</div>
                         )}
                         {evt.metadata.blockingCheckOverride && (
                           <div className="mt-2 text-[10px] bg-destructive/10 text-destructive border border-destructive/20 p-2 rounded">
                             <strong>Check Override:</strong> {evt.metadata.blockingCheckOverride.reason}
                           </div>
                         )}
                      </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Supporting Evidence */}
            <div>
               <h3 className="font-serif text-xl border-b border-border/60 pb-2 mb-4">Supporting Evidence</h3>
               {drilldown.evidence.length === 0 ? (
                 <div className="text-sm text-muted-foreground italic p-4 border border-dashed rounded bg-muted/10 text-center">No evidence files linked to this fact.</div>
               ) : (
                 <div className="grid grid-cols-1 gap-4">
                   {drilldown.evidence.map((ev: EvidenceWithAudit) => (
                     <div key={ev.id} className="bg-card border border-border/60 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start">
                       <div className="w-12 h-12 rounded bg-muted/30 border border-border/50 flex items-center justify-center shrink-0">
                         {ev.kind === 'photo' ? <Camera size={20} className="text-muted-foreground" /> :
                          ev.kind === 'audio' ? <Mic size={20} className="text-muted-foreground" /> :
                          <FileText size={20} className="text-muted-foreground" />}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start mb-1">
                           <div className="text-sm font-medium">{ev.kind.toUpperCase()} Evidence</div>
                           <div className="text-[10px] font-mono text-muted-foreground">{format(new Date(ev.capturedAt), 'MM/dd/yyyy HH:mm')}</div>
                         </div>
                         <div className="text-[10px] font-mono text-muted-foreground/70 break-all mb-2">SHA: {ev.sha256}</div>

                         {ev.checks && ev.checks.length > 0 && (
                           <div className="mt-3 space-y-1">
                             <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Deterministic Checks</div>
                             {ev.checks.map((c, idx) => (
                               <div key={idx} className={cn("text-xs flex items-center gap-2", c.passed ? "text-muted-foreground" : "text-destructive font-medium")}>
                                 {c.passed ? <CheckCircle2 size={12} className="text-primary" /> : <XCircle size={12} />}
                                 {c.message}
                               </div>
                             ))}
                           </div>
                         )}

                         {ev.transcript && (
                           <div className="mt-3">
                             <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Transcript</div>
                             <div className="text-xs text-foreground italic bg-muted/20 p-2 rounded">"{ev.transcript}"</div>
                           </div>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
