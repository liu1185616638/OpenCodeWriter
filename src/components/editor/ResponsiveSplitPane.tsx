import { cn } from "@/lib/cn";

interface ResponsiveSplitPaneProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarClassName?: string;
  contentClassName?: string;
}

export function ResponsiveSplitPane({
  sidebar,
  children,
  sidebarClassName,
  contentClassName,
}: ResponsiveSplitPaneProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex-row">
      <div
        className={cn(
          "max-h-48 shrink-0 border-b border-border md:max-h-none md:w-56 md:border-b-0 md:border-r",
          sidebarClassName,
        )}
      >
        {sidebar}
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
