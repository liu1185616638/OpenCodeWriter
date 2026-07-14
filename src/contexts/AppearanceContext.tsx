import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getSetting, setSetting } from "@/lib/tauri";

export type Density = "compact" | "comfortable" | "spacious";

interface AppearanceContextValue {
  density: Density;
  editorFontSize: string;
  setDensity: (density: Density) => Promise<void>;
  setEditorFontSize: (size: string) => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const DENSITY_SCALE: Record<Density, number> = {
  compact: 0.85,
  comfortable: 1.0,
  spacious: 1.15,
};

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>("comfortable");
  const [editorFontSize, setEditorFontSizeState] = useState("16");

  useEffect(() => {
    getSetting("ui_density").then((value) => {
      if (value === "compact" || value === "comfortable" || value === "spacious") {
        setDensityState(value);
      }
    });
    getSetting("editor_font_size").then((value) => {
      if (value) setEditorFontSizeState(value);
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-density", density);
    root.style.setProperty("--editor-font-size", `${editorFontSize}px`);
    root.style.setProperty("--density-scale", String(DENSITY_SCALE[density]));
  }, [density, editorFontSize]);

  const setDensity = useCallback(async (nextDensity: Density) => {
    await setSetting("ui_density", nextDensity);
    setDensityState(nextDensity);
  }, []);

  const setEditorFontSize = useCallback(async (size: string) => {
    await setSetting("editor_font_size", size);
    setEditorFontSizeState(size);
  }, []);

  return (
    <AppearanceContext.Provider
      value={{ density, editorFontSize, setDensity, setEditorFontSize }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used within AppearanceProvider");
  return context;
}
