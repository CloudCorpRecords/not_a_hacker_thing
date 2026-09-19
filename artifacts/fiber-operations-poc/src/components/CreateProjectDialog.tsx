import { useState } from "react";
import { useCreateProject, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    client: "",
    dueDate: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProject.mutate(
      { data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast.success("Project created successfully", {
            description: `Generated 8 standard fiber deployment stages for ${formData.name}.`,
          });
          onOpenChange(false);
          setFormData({
            name: "",
            location: "",
            client: "",
            dueDate: new Date().toISOString().split('T')[0],
          });
        },
        onError: () => {
          toast.error("Failed to create project");
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">New Project</DialogTitle>
            <DialogDescription>
              Initialize a new fiber deployment workflow. All 8 stages will be generated automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 mt-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Project Name</label>
              <input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border/60 bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                placeholder="e.g. Northside Backbone"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="location" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Location</label>
              <input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData(p => ({ ...p, location: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border/60 bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                placeholder="e.g. Zone 4"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="client" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Client / Entity</label>
              <input
                id="client"
                value={formData.client}
                onChange={(e) => setFormData(p => ({ ...p, client: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border/60 bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                placeholder="e.g. Metro Gov"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="dueDate" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Due Date</label>
              <input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(p => ({ ...p, dueDate: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border/60 bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 border border-border text-foreground hover:bg-muted rounded-md text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProject.isPending}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {createProject.isPending ? "Creating..." : "Create Project"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
