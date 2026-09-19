import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import { 
  ArrowLeft, FileText, Camera, Mic, CheckCircle2, XCircle, AlertTriangle, 
  Inbox
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

import {
  useGetProject,
  useListProposals,
  useListEvidence,
  useGetEvidence,
  useGetEvidenceContent,
  useGetFieldContext,
  useReviewProductionItem,
  getGetProjectQueryKey,
  getListProposalsQueryKey,
  getListEvidenceQueryKey,
  getGetFieldContextQueryKey,
  getGetEvidenceContentQueryKey,
  getGetEvidenceQueryKey,
} from "@workspace/api-client-react";

import type { 
  ProductionItem, 
  EvidenceItem, 
  EvidenceDetail,
  ReviewInputDecision,
  ReviewInputReasonCode,
  ReviewInput,
  FieldContext
} from "@workspace/api-client-react";

type QueueItem = {
  id: string;
  proposal?: ProductionItem;
  evidenceItems: EvidenceItem[];
  date: string;
};

export function ProjectEvidence() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0", 10);
  
  const { data: project } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });
  
  const { data: proposalsData } = useListProposals(projectId, { query: { enabled: !!projectId, queryKey: getListProposalsQueryKey(projectId) } });
  const { data: evidenceData } = useListEvidence(projectId, { query: { enabled: !!projectId, queryKey: getListEvidenceQueryKey(projectId) } });
  const { data: context } = useGetFieldContext(projectId, { query: { enabled: !!projectId, queryKey: getGetFieldContextQueryKey(projectId) } });
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const items = useMemo(() => {
    const map = new Map<string, QueueItem>();
    
    (proposalsData || []).forEach(p => {
      if (p.status === 'confirmed' || p.status === 'refused') return;
      
      map.set(`prod-${p.id}`, {
        id: `prod-${p.id}`,
        proposal: p,
        evidenceItems: [],
        date: p.createdAt,
      });
    });

    (evidenceData || []).forEach(e => {
      if (e.productionItemId) {
        const existing = map.get(`prod-${e.productionItemId}`);
        if (existing) {
          existing.evidenceItems.push(e);
        }
      } else {
        map.set(`ev-${e.id}`, {
          id: `ev-${e.id}`,
          evidenceItems: [e],
          date: e.createdAt,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [proposalsData, evidenceData]);

  useEffect(() => {
    if (!initialized.current && items.length > 0) {
      initialized.current = true;
      if (window.innerWidth >= 768) {
        setSelectedId(items[0].id);
      }
    }
  }, [items]);

  const advanceToNext = () => {
    const currentIndex = items.findIndex(i => i.id === selectedId);
    if (currentIndex >= 0 && currentIndex < items.length - 1) {
      setSelectedId(items[currentIndex + 1].id);
    } else {
      if (isMobile) {
        setSelectedId(null);
      } else {
        setSelectedId(items.length > 0 ? items[0].id : null);
      }
    }
  };

  const selectedItem = items.find(i => i.id === selectedId);

  return (
    <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden bg-background">
      {/* Header */}
      <header className="flex-none p-4 border-b border-border/60 bg-card/30 backdrop-blur shrink-0 flex items-center justify-between z-30 relative">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Evidence Adjudication</div>
            <h1 className="text-xl font-serif leading-none">{project?.name || 'Loading Project...'}</h1>
          </div>
        </div>
        <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
          <Inbox size={14} />
          {items.length} item{items.length !== 1 ? 's' : ''} in queue
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Queue */}
        <div className="w-full md:w-80 border-r border-border/60 bg-sidebar/30 flex flex-col shrink-0 absolute inset-0 md:static z-10 md:z-auto">
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="text-primary/50" size={32} />
                <p>Queue is empty</p>
                <p className="text-xs">All caught up on evidence review.</p>
              </div>
            ) : (
              items.map(item => (
                <QueueItemCard 
                  key={item.id} 
                  item={item} 
                  selected={selectedId === item.id} 
                  onClick={() => setSelectedId(item.id)}
                  context={context}
                />
              ))
            )}
          </div>
        </div>

        {/* Main Adjudication Area */}
        <div className={cn(
          "absolute inset-0 z-20 md:static md:z-auto bg-background flex-1 flex flex-col transition-transform duration-300 md:translate-x-0",
          selectedItem ? "translate-x-0" : "translate-x-full"
        )}>
          {selectedItem ? (
            <AdjudicationViewer 
              key={selectedItem.id}
              queueItem={selectedItem} 
              projectId={projectId} 
              context={context}
              onAdvance={advanceToNext} 
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex-1 flex-col items-center justify-center text-muted-foreground bg-muted/10 p-6 text-center hidden md:flex">
               <Inbox size={48} className="mb-4 text-muted-foreground/30" />
               <h2 className="text-2xl font-serif text-foreground mb-2">Select an item to review</h2>
               <p className="text-sm max-w-md">Review photos, audio logs, and extracted production data. Confirm or correct proposals based on the evidence.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueItemCard({ item, selected, onClick, context }: { item: QueueItem, selected: boolean, onClick: () => void, context: FieldContext | undefined }) {
  let title = "Evidence Only";
  let subtitle = item.id;
  let statusStr = "Unlinked";
  let hasPhoto = item.evidenceItems.some(e => e.kind === 'photo');
  let hasAudio = item.evidenceItems.some(e => e.kind === 'audio');

  if (item.proposal) {
    const workType = context?.workTypes.find(w => w.id === item.proposal!.workTypeId);
    title = workType?.name || `Work Type ${item.proposal.workTypeId}`;
    subtitle = `${item.proposal.quantity} ${item.proposal.unit}`;
    statusStr = item.proposal.status.replace(/_/g, ' ');
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 border-b border-border/60 transition-colors focus:outline-none flex flex-col gap-2 relative",
        selected ? "bg-card shadow-sm z-10 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary" : "hover:bg-muted/30"
      )}
    >
      <div className="flex justify-between items-start w-full">
        <div className="font-serif text-lg leading-tight truncate pr-2">{title}</div>
        <div className={cn(
          "text-[10px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0",
          statusStr === 'proposed' || statusStr === 'needs review' 
            ? "bg-secondary/20 text-secondary" 
            : "bg-muted text-muted-foreground"
        )}>
          {statusStr}
        </div>
      </div>
      
      <div className="flex items-center justify-between w-full">
        <div className="text-xs text-muted-foreground font-mono truncate mr-2">{subtitle}</div>
        <div className="flex gap-1.5 text-muted-foreground shrink-0">
          {hasPhoto && <Camera size={14} />}
          {hasAudio && <Mic size={14} />}
          {!hasPhoto && !hasAudio && <FileText size={14} />}
        </div>
      </div>
      
      <div className="text-[10px] font-mono text-muted-foreground/60">
        {format(new Date(item.date), 'MMM d, h:mm a')}
      </div>
    </button>
  );
}

function AdjudicationViewer({ queueItem, projectId, context, onAdvance, onBack }: { queueItem: QueueItem, projectId: number, context: FieldContext | undefined, onAdvance: () => void, onBack: () => void }) {
  const [selectedEvId, setSelectedEvId] = useState<number | null>(
    queueItem.evidenceItems.length > 0 ? queueItem.evidenceItems[0].id : null
  );

  useEffect(() => {
    setSelectedEvId(queueItem.evidenceItems.length > 0 ? queueItem.evidenceItems[0].id : null);
  }, [queueItem]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-y-auto p-4 md:p-6 bg-background">
      {/* Mobile Back Button */}
      <div className="md:hidden pb-2 border-b border-border/60 shrink-0 mb-2">
         <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
           <ArrowLeft size={16} />
           Back to queue
         </button>
      </div>

      {/* Left Column: Evidence Media and Details */}
      <div className="flex-1 flex flex-col min-w-0">
         {queueItem.evidenceItems.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-4 border-b border-border/60 mb-6 shrink-0">
              {queueItem.evidenceItems.map((ev, idx) => (
                 <button 
                   key={ev.id} 
                   onClick={() => setSelectedEvId(ev.id)}
                   className={cn("px-4 py-2 text-xs font-mono rounded-md border transition-all whitespace-nowrap", selectedEvId === ev.id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border/60 hover:bg-muted/50")}
                 >
                   <div className="flex items-center gap-2">
                     {ev.kind === 'photo' ? <Camera size={14} /> : ev.kind === 'audio' ? <Mic size={14} /> : <FileText size={14} />}
                     <span>Evidence {idx + 1}</span>
                     {ev.status !== 'ready' && <span className="opacity-70">({ev.status})</span>}
                   </div>
                 </button>
              ))}
            </div>
         )}

         <div className="flex-1 overflow-y-auto pr-2 pb-8">
           {selectedEvId ? (
             <EvidenceView projectId={projectId} evidenceId={selectedEvId} />
           ) : (
             <div className="h-64 flex flex-col gap-3 items-center justify-center text-muted-foreground bg-muted/10 border border-dashed border-border/60 rounded-md">
               <FileText size={32} className="opacity-20" />
               <div className="font-serif">No evidence attached</div>
             </div>
           )}
         </div>
      </div>

      {/* Right Column: Proposal Data & Review Form */}
      <div className="w-full lg:w-[400px] shrink-0">
        {queueItem.proposal ? (
          <ProposalReview projectId={projectId} proposal={queueItem.proposal} context={context} evidenceItems={queueItem.evidenceItems} onAdvance={onAdvance} />
        ) : (
          <div className="p-4 bg-muted/20 border border-border/50 rounded-md text-sm text-muted-foreground flex items-start gap-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>This evidence is not linked to a production proposal. Adjudication cannot be performed directly.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MediaViewer({ projectId, evidenceId, kind, objectPath }: { projectId: number, evidenceId: number, kind: string, objectPath: string }) {
  const { data: blob, isLoading } = useGetEvidenceContent(projectId, evidenceId, { query: { enabled: !!evidenceId, queryKey: getGetEvidenceContentQueryKey(projectId, evidenceId) }});
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob) {
      const u = URL.createObjectURL(blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    return undefined;
  }, [blob]);

  if (isLoading) return <div className="h-64 w-full flex items-center justify-center text-muted-foreground bg-muted/20 border border-border/50 rounded-md animate-pulse">Loading media...</div>;
  if (!url) return <div className="h-64 w-full flex items-center justify-center text-muted-foreground bg-muted/20 border border-border/50 rounded-md">Media unavailable</div>;

  if (kind === 'audio') {
    return (
      <div className="bg-muted/20 border border-border/50 p-6 rounded-md flex flex-col items-center justify-center min-h-[256px]">
        <audio controls src={url} className="w-full max-w-sm" />
        <div className="mt-6 text-[10px] font-mono text-muted-foreground break-all text-center">{objectPath}</div>
      </div>
    );
  }

  return (
    <div className="bg-muted/20 border border-border/50 rounded-md overflow-hidden flex flex-col group relative min-h-[256px] items-center justify-center">
      <img src={url} alt="Evidence" className="w-full h-auto object-contain max-h-[600px]" />
      <div className="absolute bottom-0 inset-x-0 p-3 bg-background/90 backdrop-blur text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity break-all text-center border-t border-border/50">
        {objectPath}
      </div>
    </div>
  );
}

function EvidenceView({ projectId, evidenceId }: { projectId: number, evidenceId: number }) {
  const { data: evidence, isLoading } = useGetEvidence(projectId, evidenceId, { query: { enabled: !!evidenceId, queryKey: getGetEvidenceQueryKey(projectId, evidenceId) } });

  if (isLoading) return <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">Loading evidence details...</div>;
  if (!evidence) return <div className="h-64 flex items-center justify-center text-destructive border border-destructive/20 bg-destructive/5 rounded-md">Evidence not found.</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <MediaViewer projectId={projectId} evidenceId={evidenceId} kind={evidence.kind} objectPath={evidence.objectPath} />
      <EvidenceMetadata evidence={evidence} />
    </div>
  );
}

function EvidenceMetadata({ evidence }: { evidence: EvidenceDetail }) {
  return (
    <div className="space-y-8 text-sm">
      {/* Extracted Data */}
      <div className="space-y-3">
        <h4 className="font-serif text-xl text-foreground border-b border-border/60 pb-1 flex items-center gap-2">
          Extraction
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border/50 p-3 rounded-md">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Confidence</div>
            <div className="font-mono text-foreground text-lg">{evidence.confidence || 'N/A'}</div>
          </div>
          <div className="bg-card border border-border/50 p-3 rounded-md">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Identity Match</div>
            <div className="font-mono text-foreground text-lg">{evidence.identityConfidence || 'N/A'}</div>
          </div>
        </div>
        
        {evidence.transcript && (
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Transcript</div>
            <div className="p-4 bg-card border border-border/50 rounded-md font-sans text-muted-foreground italic text-sm leading-relaxed">
              "{evidence.transcript}"
            </div>
          </div>
        )}
        
        {evidence.explanation && (
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">AI Explanation</div>
            <div className="p-4 bg-card border border-border/50 rounded-md text-foreground text-sm leading-relaxed">
              {evidence.explanation}
            </div>
          </div>
        )}
      </div>

      {/* Checks */}
      <div className="space-y-3">
        <h4 className="font-serif text-xl text-foreground border-b border-border/60 pb-1">Deterministic Checks</h4>
        {evidence.checks && evidence.checks.length > 0 ? (
          <ul className="space-y-2">
            {evidence.checks.map(c => (
              <li key={c.code} className="flex gap-3 p-3 bg-card border border-border/50 rounded-md items-start">
                <div className="mt-0.5 shrink-0">
                  {c.passed ? (
                    <CheckCircle2 size={16} className="text-primary" />
                  ) : c.severity === 'blocking' ? (
                    <XCircle size={16} className="text-destructive" />
                  ) : (
                    <AlertTriangle size={16} className="text-secondary" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground leading-tight mb-1">{c.message}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{c.code} • {c.severity}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs font-mono text-muted-foreground bg-muted/20 border border-border/50 p-4 rounded-md">No checks recorded.</div>
        )}
      </div>

      {/* Provenance */}
      <div className="space-y-3">
        <h4 className="font-serif text-xl text-foreground border-b border-border/60 pb-1">Provenance</h4>
        <div className="grid grid-cols-2 gap-4 bg-card border border-border/50 p-4 rounded-md">
          <div className="col-span-2">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">SHA-256 Hash</div>
            <div className="font-mono text-[10px] text-foreground break-all">
              {evidence.sha256 || 'N/A'}
            </div>
          </div>
          <div className="pt-2 border-t border-border/50">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Captured At</div>
            <div className="font-mono text-xs text-foreground">
              {evidence.capturedAt ? format(new Date(evidence.capturedAt), 'PP p') : 'N/A'}
            </div>
          </div>
          <div className="pt-2 border-t border-border/50">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Retention Until</div>
            <div className="font-mono text-xs text-foreground">
              {evidence.retentionUntil ? format(new Date(evidence.retentionUntil), 'PP') : 'N/A'}
            </div>
          </div>
          <div className="col-span-2 pt-2 border-t border-border/50">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Uploader Context</div>
            <div className="font-mono text-xs text-foreground break-all">{evidence.uploaderContext || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Audit History */}
      <div className="space-y-3">
        <h4 className="font-serif text-xl text-foreground border-b border-border/60 pb-1">Evidence Audit Log</h4>
        {evidence.auditEvents && evidence.auditEvents.length > 0 ? (
          <ul className="space-y-4 bg-card border border-border/50 p-4 rounded-md">
            {evidence.auditEvents.map((e, idx) => (
              <li key={e.id} className={cn("text-xs", idx !== evidence.auditEvents.length - 1 && "pb-4 border-b border-border/50")}>
                <div className="flex justify-between items-start font-mono text-[10px] text-muted-foreground mb-1">
                  <span>{format(new Date(e.createdAt), 'MM/dd/yyyy HH:mm:ss')}</span>
                  <span className="uppercase">{e.actor}</span>
                </div>
                <div className="text-foreground">
                  <span className="font-medium text-sm">{e.eventType}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs font-mono text-muted-foreground bg-muted/20 border border-border/50 p-4 rounded-md">No audit events.</div>
        )}
      </div>
    </div>
  );
}

function ProposalReview({ projectId, proposal, context, evidenceItems, onAdvance }: { projectId: number, proposal: ProductionItem, context: FieldContext | undefined, evidenceItems: EvidenceItem[], onAdvance: () => void }) {
  const reviewMutation = useReviewProductionItem();
  const queryClient = useQueryClient();

  const site = context?.sites.find(s => s.id === proposal.siteId);
  const crew = context?.crews.find(c => c.id === proposal.crewId);
  const workType = context?.workTypes.find(w => w.id === proposal.workTypeId);

  const [actor, setActor] = useState("");
  const [decision, setDecision] = useState<ReviewInputDecision | null>(null);
  const [reasonCode, setReasonCode] = useState<ReviewInputReasonCode | "">("");
  const [explanation, setExplanation] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [overrideChecks, setOverrideChecks] = useState(false);

  const hasFailedBlockingChecks = useMemo(() => {
    return evidenceItems.some(e => e.checks?.some(c => c.severity === 'blocking' && !c.passed));
  }, [evidenceItems]);

  useEffect(() => {
    if (decision === 'correct') {
      setQuantity(proposal.quantity ? Number(proposal.quantity) : "");
    }
  }, [decision, proposal.quantity]);

  const handleSubmit = () => {
    if (!actor.trim()) {
       toast.error("Reviewer name is required");
       return;
    }

    if (!decision) return;

    const input: ReviewInput = { decision, actor: actor.trim() };
    
    if (decision === 'correct') {
      const q = Number(quantity);
      if (!quantity || isNaN(q) || q <= 0) { toast.error("Valid positive quantity required for correction"); return; }
      if (q === Number(proposal.quantity)) { toast.error("Quantity must be changed for a correction"); return; }
      if (!reasonCode) { toast.error("Reason code required for correction"); return; }
      if (!explanation.trim()) { toast.error("Explanation required for correction"); return; }
      
      input.quantity = q;
      input.reasonCode = reasonCode as ReviewInputReasonCode;
      input.reason = explanation.trim();
    } else if (decision === 'refuse') {
      if (!reasonCode) { toast.error("Reason code required for refusal"); return; }
      if (!explanation.trim()) { toast.error("Explanation required for refusal"); return; }
      
      input.reasonCode = reasonCode as ReviewInputReasonCode;
      input.reason = explanation.trim();
    } else if (decision === 'confirm') {
      if (hasFailedBlockingChecks && !overrideChecks) {
         toast.error("Must acknowledge blocking checks to confirm");
         return;
      }
    }

    reviewMutation.mutate({ productionItemId: proposal.id, data: input }, {
      onSuccess: () => {
        toast.success(`Proposal ${decision}ed successfully`);
        queryClient.invalidateQueries({ queryKey: getListProposalsQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(projectId) });
        onAdvance();
        setDecision(null);
        setReasonCode("");
        setExplanation("");
        setOverrideChecks(false);
      },
      onError: () => {
        toast.error("Failed to submit review");
      }
    });
  };

  const reasonCodeOptions = [
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'wrong_site', label: 'Wrong Site' },
    { value: 'wrong_crew', label: 'Wrong Crew' },
    { value: 'wrong_work_type', label: 'Wrong Work Type' },
    { value: 'implausible_quantity', label: 'Implausible Quantity' },
    { value: 'unreadable_evidence', label: 'Unreadable Evidence' },
    { value: 'duplicate_capture', label: 'Duplicate Capture' },
    { value: 'other', label: 'Other' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border/60 p-5 rounded-lg shadow-sm space-y-4">
        <div>
           <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Proposal Details</div>
           <h3 className="font-serif text-2xl leading-tight">{workType?.name || `Work Type ${proposal.workTypeId}`}</h3>
           <div className="flex gap-4 mt-3 text-sm text-foreground font-mono bg-muted/20 p-2 border border-border/50 rounded inline-flex items-center">
             <span className="font-medium">{proposal.quantity} {proposal.unit}</span>
             <span className="text-muted-foreground">•</span>
             <span className="text-muted-foreground">{format(new Date(proposal.workDate), 'MM/dd/yyyy')}</span>
           </div>
        </div>
        
        <div className="grid grid-cols-2 gap-y-4 text-sm pt-2">
          <div>
             <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Site</div>
             <div className="font-medium text-foreground">{site?.name || `Site ${proposal.siteId}`}</div>
          </div>
          <div>
             <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Crew</div>
             <div className="font-medium text-foreground">{crew?.name || `Crew ${proposal.crewId}`}</div>
          </div>
          <div className="col-span-2">
             <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Note</div>
             <div className="text-foreground bg-muted/20 p-3 rounded border border-border/50 text-xs">{proposal.note || 'No notes provided.'}</div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/60 p-5 rounded-lg shadow-sm space-y-5 sticky top-6">
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider border-b border-border/60 pb-2">Adjudication</div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Reviewer Name</label>
            <input 
              type="text" 
              value={actor} 
              onChange={e => setActor(e.target.value)}
              className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
              placeholder="e.g. Jane Doe"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Decision</label>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setDecision('confirm')}
                className={cn("px-2 py-2 text-xs font-medium rounded border transition-all shadow-sm", decision === 'confirm' ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border/60 hover:bg-muted/50 hover:border-border")}
              >
                Confirm
              </button>
              <button 
                onClick={() => setDecision('correct')}
                className={cn("px-2 py-2 text-xs font-medium rounded border transition-all shadow-sm", decision === 'correct' ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-foreground border-border/60 hover:bg-muted/50 hover:border-border")}
              >
                Correct
              </button>
              <button 
                onClick={() => setDecision('refuse')}
                className={cn("px-2 py-2 text-xs font-medium rounded border transition-all shadow-sm", decision === 'refuse' ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background text-foreground border-border/60 hover:bg-muted/50 hover:border-border")}
              >
                Refuse
              </button>
            </div>
          </div>

          {decision === 'correct' && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Corrected Quantity</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="0.01" step="any"
                    value={quantity} 
                    onChange={e => setQuantity(e.target.value ? Number(e.target.value) : "")}
                    className="w-full bg-background border border-border/60 rounded-md pl-3 pr-12 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary transition-shadow"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">{proposal.unit}</div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Reason Code</label>
                <select 
                  value={reasonCode} 
                  onChange={e => setReasonCode(e.target.value as ReviewInputReasonCode)}
                  className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary transition-shadow appearance-none"
                >
                  <option value="">Select a reason...</option>
                  {reasonCodeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Explanation</label>
                <textarea 
                  value={explanation} 
                  onChange={e => setExplanation(e.target.value)}
                  className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary transition-shadow min-h-[100px] resize-none"
                  placeholder="Explain why this quantity was corrected..."
                />
              </div>
            </div>
          )}

          {decision === 'refuse' && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Reason Code</label>
                <select 
                  value={reasonCode} 
                  onChange={e => setReasonCode(e.target.value as ReviewInputReasonCode)}
                  className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-destructive transition-shadow appearance-none"
                >
                  <option value="">Select a reason...</option>
                  {reasonCodeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Explanation</label>
                <textarea 
                  value={explanation} 
                  onChange={e => setExplanation(e.target.value)}
                  className="w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-destructive transition-shadow min-h-[100px] resize-none"
                  placeholder="Explain why this proposal is being refused..."
                />
              </div>
            </div>
          )}

          {decision === 'confirm' && hasFailedBlockingChecks && (
            <div className="pt-2 animate-in fade-in zoom-in-95 duration-200">
              <label className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md cursor-pointer hover:bg-destructive/15 transition-colors">
                <input 
                  type="checkbox" 
                  checked={overrideChecks} 
                  onChange={e => setOverrideChecks(e.target.checked)}
                  className="mt-1 shrink-0 accent-destructive"
                />
                <span className="text-xs text-destructive-foreground leading-relaxed">
                  <strong>Blocking checks failed.</strong> I acknowledge the failing deterministic checks and wish to confirm this proposal anyway.
                </span>
              </label>
            </div>
          )}

          {decision && (
            <button 
              onClick={handleSubmit}
              disabled={reviewMutation.isPending || (decision === 'confirm' && hasFailedBlockingChecks && !overrideChecks)}
              className="w-full mt-6 bg-foreground text-background hover:bg-foreground/90 py-3 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]"
            >
              {reviewMutation.isPending ? "Submitting..." : "Submit Decision"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
