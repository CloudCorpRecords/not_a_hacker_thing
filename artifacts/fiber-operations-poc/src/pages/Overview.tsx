import { useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Plus, Activity, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";

export function Overview() {
  const { data: projects, isLoading } = useListProjects();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [, setLocation] = useLocation();

  const total = projects?.length || 0;
  // Compute some derived metrics
  const activeStages = projects?.flatMap(p => p.stages).filter(s => s.status === 'in_progress').length || 0;
  const blockedStages = projects?.flatMap(p => p.stages).filter(s => s.status === 'blocked').length || 0;

  return (
    <div className="flex-1 p-6 md:p-10 space-y-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Portfolio Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time status of all fiber installations.</p>
        </div>
        <button 
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      <CreateProjectDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-card border border-border/50 rounded-lg shadow-xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-wider">
            <Activity size={14} /> Total Projects
          </div>
          <div className="text-3xl font-serif">{isLoading ? "-" : total}</div>
        </div>
        <div className="p-5 bg-card border border-border/50 rounded-lg shadow-xs">
          <div className="flex items-center gap-2 text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-wider">
            <Clock size={14} /> Active Stages
          </div>
          <div className="text-3xl font-serif">{isLoading ? "-" : activeStages}</div>
        </div>
        <div className="p-5 bg-card border border-destructive/20 rounded-lg shadow-xs bg-destructive/5 text-destructive-foreground">
          <div className="flex items-center gap-2 text-destructive mb-3 font-mono text-[11px] uppercase tracking-wider">
            <AlertTriangle size={14} /> Blocked Stages
          </div>
          <div className="text-3xl font-serif text-destructive">{isLoading ? "-" : blockedStages}</div>
        </div>
      </div>

      {/* Projects List */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-serif">Active Deployments</h2>
        </div>
        
        {isLoading ? (
          <div className="h-64 flex items-center justify-center border border-dashed border-border/60 rounded-lg text-muted-foreground">
            Loading telemetry...
          </div>
        ) : projects?.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-lg bg-card/50">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Activity className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">No projects found</p>
            <p className="text-muted-foreground text-sm max-w-sm text-center mt-1">
              Start by creating a new project to track fiber deployment progress.
            </p>
          </div>
        ) : (
          <div className="border border-border/60 rounded-lg bg-card shadow-xs overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap min-w-[600px]">
              <thead className="bg-muted/30 border-b border-border/60 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {projects?.map((project) => {
                  const completed = project.stages.filter(s => s.status === 'complete').length;
                  const total = project.stages.length;
                  const progress = total > 0 ? (completed / total) * 100 : 0;
                  
                  return (
                    <tr 
                      key={project.id} 
                      onClick={() => setLocation(`/projects/${project.id}`)}
                      className="hover:bg-muted/20 transition-colors group cursor-pointer relative"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{project.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">ID-{project.id.toString().padStart(4, '0')}</div>
                      </td>
                      <td className="px-4 py-3">{project.location}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary/15 text-secondary-foreground border border-secondary/20">
                          {project.client}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary" 
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{completed}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {format(new Date(project.dueDate), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
