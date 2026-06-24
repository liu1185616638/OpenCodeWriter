import { useEffect } from "react";

/**
 * Listen for global keyboard shortcut events dispatched by App.
 * Editors can use this to respond to Ctrl+G (generate), Ctrl+S (save), Ctrl+M (switch model).
 */
export function useAppEvents(handlers: {
  onGenerate?: () => void;
  onSave?: () => void;
  onSwitchModel?: () => void;
}) {
  useEffect(() => {
    const handleGenerate = () => handlers.onGenerate?.();
    const handleSave = () => handlers.onSave?.();
    const handleSwitchModel = () => handlers.onSwitchModel?.();

    window.addEventListener("app:generate", handleGenerate);
    window.addEventListener("app:save", handleSave);
    window.addEventListener("app:switch-model", handleSwitchModel);

    return () => {
      window.removeEventListener("app:generate", handleGenerate);
      window.removeEventListener("app:save", handleSave);
      window.removeEventListener("app:switch-model", handleSwitchModel);
    };
  }, [handlers]);
}
