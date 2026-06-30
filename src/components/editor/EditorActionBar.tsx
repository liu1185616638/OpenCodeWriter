import { cn } from "@/lib/cn";

interface EditorActionBarProps {
  children: React.ReactNode;
  className?: string;
}

export function EditorActionBar({ children, className }: EditorActionBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
