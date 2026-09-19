import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { HardHat, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();

  const navItems = [
    { name: "Overview", path: "/", icon: Home },
  ];

  return (
    <div className="flex h-[100dvh] w-full flex-col md:flex-row bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border/60 bg-sidebar/50 backdrop-blur flex flex-col shrink-0">
        <div className="p-4 border-b border-border/60 flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <HardHat size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-serif text-xl leading-none">FiberOps</h1>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Control Room</p>
            </div>
          </div>
        </div>

        <nav className="flex-none md:flex-1 p-2 md:p-4 flex md:flex-col space-x-2 md:space-x-0 md:space-y-1 overflow-x-auto md:overflow-y-auto">
          <div className="hidden md:block font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-3 px-2">Navigation</div>
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link 
                key={item.name} 
                href={item.path} 
                className={cn(
                  "flex items-center gap-2 md:gap-3 px-3 md:px-2 py-2 rounded-md transition-colors text-sm font-medium whitespace-nowrap",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon size={16} />
                {item.name}
              </Link>
            );
          })}
        </nav>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
