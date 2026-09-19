import { useGetProject, useUpdateStage, getGetProjectQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, Circle, FileText, User } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { Stage, StageStatus } from "@workspace/api-client-react";
import { toast } from "sonner";

const STATUS_ICONS = {
  complete: CheckCircle2,
  in_progress: Clock,
  blocked: AlertTriangle,
  not_started: Circle,
};

const STATUS_COLORS = {
  complete: "text-primary bg-primary/10 border-primary/20",
  in_progress: "text-secondary bg-secondary/10 border-secondary/20",
  blocked: "text-destructive bg-destructive/10 border-destructive/20",
  not_started: "text-muted-foreground bg-muted border-border/50",
};

const STATUS_LABELS = {
  complete: "Complete",
  in_progress: "In Progress",
  blocked: "Blocked",
  not_started: "Not Started",
};

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0", 10);
  const { data: project, isLoading, error } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });
  const [selectedStageNumber, setSelectedStageNumber] = useState<number | null>(null);

  if (isLoading) {
    return <div className="flex-1 p-10 flex items-center justify-center">Loading project data...</div>;
  }

  if (error || !project) {
    return <div className="flex-1 p-10 flex flex-col items-center justify-center">
      <h2 className="text-xl text-destructive font-serif">Project not found</h2>
      <Link href="/" className="text-primary mt-4 hover:underline">Return to Overview</Link>
    </div>;
  }

  const selectedStage = selectedStageNumber 
    ? project.stages.find(s => s.number === selectedStageNumber)
    : project.stages[0]; // Default to first stage

  const completedCount = project.stages.filter(s => s.status === 'complete').length;
  const progress = (completedCount / project.stages.length) * 100;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex-none p-6 border-b border-border/60 bg-card/30 backdrop-blur shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-center text-xs font-mono text-muted-foreground hover:text-foreground mb-2 transition-colors">
              <ArrowLeft size={12} className="mr-1" />
              BACK TO PORTFOLIO
            </Link>
            <h1 className="text-3xl font-serif leading-tight">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
              <span>LOC: {project.location}</span>
              <span>CLIENT: {project.client}</span>
              <span>DUE: {format(new Date(project.dueDate), 'MM/dd/yyyy')}</span>
            </div>
          </div>
          
          <div className="w-48">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span>PROGRESS</span>
              <span>{completedCount}/{project.stages.length}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-in-out" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Stages Sidebar */}
        <div className="w-full md:w-1/3 md:min-w-[300px] md:max-w-[350px] border-b md:border-b-0 md:border-r border-border/60 bg-sidebar/30 overflow-x-auto md:overflow-y-auto shrink-0">
          <div className="p-4 flex flex-row md:flex-col gap-2 md:gap-1 min-w-max md:min-w-0">
            {project.stages.map((stage) => {
              const isSelected = selectedStage?.number === stage.number;
              const Icon = STATUS_ICONS[stage.status];
              
              return (
                <button
                  key={stage.number}
                  onClick={() => setSelectedStageNumber(stage.number)}
                  className={cn(
                    "w-48 md:w-full text-left p-3 rounded-md transition-all border shrink-0",
                    isSelected 
                      ? "bg-card border-border/80 shadow-sm" 
                      : "border-transparent hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 rounded-full p-0.5 border", STATUS_COLORS[stage.status])}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <div className="text-xs font-mono text-muted-foreground mb-0.5 uppercase tracking-wider">
                        Stage {stage.number} • {stage.phase}
                      </div>
                      <div className={cn("font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                        {stage.name}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stage Editor */}
        <div className="flex-1 overflow-y-auto bg-background p-6">
          {selectedStage && (
            <StageEditor 
              key={`${projectId}-${selectedStage.number}`}
              projectId={project.id} 
              stage={selectedStage} 
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StageEditor({ projectId, stage }: { projectId: number, stage: Stage }) {
  const queryClient = useQueryClient();
  const updateStage = useUpdateStage();
  
  const [status, setStatus] = useState<StageStatus>(stage.status);
  const [note, setNote] = useState(stage.note || "");
  const [owner, setOwner] = useState(stage.owner || "");
  const [completedAt, setCompletedAt] = useState(
    stage.completedAt ? stage.completedAt.slice(0, 16) : "" // "YYYY-MM-DDTHH:mm" for datetime-local
  );
  const [isSaving, setIsSaving] = useState(false);
  const [evidenceName, setEvidenceName] = useState(stage.evidenceName || "");

  // Update local state when stage receives server updates we triggered
  useEffect(() => {
    if (!isSaving) {
      setStatus(stage.status);
      setNote(stage.note || "");
      setOwner(stage.owner || "");
      setCompletedAt(stage.completedAt ? stage.completedAt.slice(0, 16) : "");
      setEvidenceName(stage.evidenceName || "");
    }
  }, [stage.status, stage.note, stage.owner, stage.completedAt, stage.evidenceName, isSaving]);

  const handleSave = () => {
    setIsSaving(true);
    updateStage.mutate({
      projectId,
      stageNumber: stage.number,
      data: {
        status,
        note,
        owner,
        evidenceName,
        completedAt: status === 'complete' 
          ? (completedAt ? new Date(completedAt).toISOString() : new Date().toISOString())
          : null
      }
    }, {
      onSuccess: (updatedProject) => {
        setIsSaving(false);
        // Patch cache locally to avoid refetch cascade overwriting user edits
        queryClient.setQueryData(getGetProjectQueryKey(projectId), updatedProject);
        
        toast.success(`Stage ${stage.number} updated`, {
          description: `Changes to ${stage.name} have been saved.`
        });
      },
      onError: () => {
        setIsSaving(false);
        toast.error("Failed to update stage");
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setEvidenceName(e.target.files[0].name);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-200">
      <div className="border-b border-border/60 pb-6">
        <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
          <span>Stage {stage.number}</span>
          <span className="w-1 h-1 rounded-full bg-border"></span>
          <span>{stage.phase}</span>
        </div>
        <h2 className="text-3xl font-serif text-foreground mb-3">{stage.name}</h2>
        <p className="text-muted-foreground">{stage.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Status</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABELS) as StageStatus[]).map((s) => {
              const isActive = status === s;
              const Icon = STATUS_ICONS[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all",
                    isActive 
                      ? STATUS_COLORS[s] 
                      : "border-border/60 hover:bg-muted/30 text-foreground"
                  )}
                >
                  <Icon size={14} />
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Assigned Crew / Owner</label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full bg-card border border-border/60 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-shadow"
              placeholder="e.g. Charlie Team"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Field Notes</label>
        <textarea 
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full h-32 bg-card border border-border/60 rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-shadow resize-none"
          placeholder="Record site conditions, obstacles, or handoff details..."
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Evidence / Documentation</label>
        <div className="border border-dashed border-border/80 rounded-md p-4 bg-card/30 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <FileText size={18} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            {evidenceName ? (
              <p className="text-sm font-medium text-foreground truncate">{evidenceName}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No file attached</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Upload photos, OTDR traces, or permits.</p>
          </div>
          <label className="shrink-0 cursor-pointer bg-secondary hover:bg-secondary/90 text-secondary-foreground px-3 py-1.5 rounded text-xs font-medium transition-colors">
            Browse
            <input type="file" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>
      </div>

      <div className="pt-4 border-t border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Completion Date</label>
          <input
            type="datetime-local"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
            disabled={status !== 'complete'}
            className="bg-card border border-border/60 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
