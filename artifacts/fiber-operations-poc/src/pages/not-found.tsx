import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <AlertTriangle size={32} />
          </div>
        </div>
        <h1 className="text-4xl font-serif mb-2">Page Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The requested coordinate or sector could not be located.
        </p>
        <Link href="/" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
          Return to Control Room
        </Link>
      </div>
    </div>
  );
}
