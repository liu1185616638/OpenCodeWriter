import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";

interface AppScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  padded?: boolean;
}

export function AppScrollArea({
  children,
  className,
  contentClassName,
  padded = true,
}: AppScrollAreaProps) {
  return (
    <ScrollArea
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-x-hidden",
        padded && "px-4 py-4 sm:px-8 sm:py-5",
        className,
      )}
    >
      <div className={cn("min-h-full w-full min-w-0 pr-2 sm:pr-3", contentClassName)}>
        {children}
      </div>
    </ScrollArea>
  );
}
