import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

interface UseAutosaveOptions {
  value: string;
  enabled: boolean;
  delay?: number;
  onSave: (value: string) => Promise<void>;
}

export function useAutosave({ value, enabled, delay = 800, onSave }: UseAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const lastSavedRef = useRef(value);

  useEffect(() => {
    if (!enabled) return;
    if (value === lastSavedRef.current) return;

    setStatus("dirty");
    const timer = window.setTimeout(async () => {
      setStatus("saving");
      try {
        await onSave(value);
        lastSavedRef.current = value;
        setStatus("saved");
      } catch {
        setStatus("failed");
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, enabled, delay, onSave]);

  return status;
}
