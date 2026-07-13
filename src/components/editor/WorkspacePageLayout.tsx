import { cn } from "@/lib/cn";

interface WorkspacePageLayoutProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
  alerts?: React.ReactNode;
  children: React.ReactNode;
  error?: React.ReactNode;
  actionBar?: React.ReactNode;
  className?: string;
}

export function WorkspacePageLayout({
  title,
  description,
  status,
  alerts,
  children,
  error,
  actionBar,
  className,
}: WorkspacePageLayoutProps) {
  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{description}</p>
          ) : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>

      {alerts ? <div className="shrink-0">{alerts}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {error ? <div className="shrink-0 px-4 pb-2 text-sm text-destructive sm:px-6">{error}</div> : null}

      {actionBar ? (
        <div className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6">
          {actionBar}
        </div>
      ) : null}
    </div>
  );
}
