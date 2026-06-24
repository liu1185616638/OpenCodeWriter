import { useEffect } from "react";
import type { CreationStage } from "@/types";

interface KeybindingActions {
  onNewProject?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme?: () => void;
  onSwitchStage?: (stage: CreationStage) => void;
  onGenerate?: () => void;
  onSwitchModel?: () => void;
  onSwitchProject?: () => void;
  onSave?: () => void;
}

export function useKeybindings(actions: KeybindingActions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Ctrl+key shortcuts
      if (!e.ctrlKey && !e.metaKey) return;

      const key = e.key.toLowerCase();

      switch (key) {
        case "n":
          e.preventDefault();
          actions.onNewProject?.();
          break;
        case ",":
          e.preventDefault();
          actions.onOpenSettings?.();
          break;
        case "t":
          e.preventDefault();
          actions.onToggleTheme?.();
          break;
        case "1":
          e.preventDefault();
          actions.onSwitchStage?.("outline");
          break;
        case "2":
          e.preventDefault();
          actions.onSwitchStage?.("characters");
          break;
        case "3":
          e.preventDefault();
          actions.onSwitchStage?.("chapters");
          break;
        case "4":
          e.preventDefault();
          actions.onSwitchStage?.("content");
          break;
        case "g":
          e.preventDefault();
          actions.onGenerate?.();
          break;
        case "m":
          e.preventDefault();
          actions.onSwitchModel?.();
          break;
        case "p":
          e.preventDefault();
          actions.onSwitchProject?.();
          break;
        case "s":
          e.preventDefault();
          actions.onSave?.();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);
}
