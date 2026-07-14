import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getSetting, setSetting } from "@/lib/tauri";

type Density = "compact" | "comfortable" | "spacious";

interface AppearanceContextValue {
  density: Density;
  editorFontSize: string;
  setDensity: (d: Density) => Promise<void>;
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

  // Load initial settings
  useEffect(() => {
    getSetting("ui_density").then(v => {
      if (v && (v === "compact" || v === "comfortable" || v === "spacious")) {
        setDensityState(v);
      }
    });
    getSetting("editor_font_size").then(v => {
      if (v) setEditorFontSizeState(v);
    });
  }, []);

  // Apply appearance to root element
  useEffect(() => {
    const root = document.documentElement;
    // Set data-density attribute
    root.setAttribute("data-density", density);
    // Set CSS variable for editor font size
    root.style.setProperty("--editor-font-size", `${editorFontSize}px`);

    // Apply density scale to various CSS variables
    const scale = DENSITY_SCALE[density];
    root.style.setProperty("--density-scale", String(scale));
  }, [density, editorFontSize]);

  const setDensity = useCallback(async (d: Density) => {
    await setSetting("ui_density", d);
    setDensityState(d);
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
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}