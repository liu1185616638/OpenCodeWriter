/**
 * WorkbenchContext — Shell layout state provider.
 *
 * Manages sidebar collapse, inspector open/width, task drawer open/height,
 * focus mode, and the current workspace page title/status.
 *
 * This is separate from NavigationContext (which manages route state)
 * and AIContext (which manages generation state).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface WorkspaceState {
  navigationCollapsed: boolean;
  inspectorOpen: boolean;
  inspectorWidth: number;
  taskDrawerOpen: boolean;
  taskDrawerHeight: number;
  focusMode: boolean;
}

const DEFAULT_STATE: WorkspaceState = {
  navigationCollapsed: false,
  inspectorOpen: true,
  inspectorWidth: 320,
  taskDrawerOpen: false,
  taskDrawerHeight: 240,
  focusMode: false,
};

interface WorkbenchContextValue extends WorkspaceState {
  /** Toggle sidebar between expanded (248px) and collapsed (56px) */
  toggleNavigation: () => void;
  setNavigationCollapsed: (v: boolean) => void;
  /** Toggle right-side inspector panel */
  toggleInspector: () => void;
  setInspectorOpen: (v: boolean) => void;
  setInspectorWidth: (w: number) => void;
  /** Toggle bottom task drawer */
  toggleTaskDrawer: () => void;
  setTaskDrawerOpen: (v: boolean) => void;
  setTaskDrawerHeight: (h: number) => void;
  /** Toggle focus mode (hides nav, inspector, drawer) */
  toggleFocusMode: () => void;
  setFocusMode: (v: boolean) => void;
  /** Reset all to defaults */
  resetLayout: () => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(DEFAULT_STATE);

  const toggleNavigation = useCallback(() => {
    setState((s) => ({ ...s, navigationCollapsed: !s.navigationCollapsed }));
  }, []);

  const toggleInspector = useCallback(() => {
    setState((s) => ({ ...s, inspectorOpen: !s.inspectorOpen }));
  }, []);

  const toggleTaskDrawer = useCallback(() => {
    setState((s) => ({ ...s, taskDrawerOpen: !s.taskDrawerOpen }));
  }, []);

  const toggleFocusMode = useCallback(() => {
    setState((s) => {
      const next = !s.focusMode;
      // When entering focus mode, collapse everything
      if (next) {
        return { ...s, focusMode: true, inspectorOpen: false, taskDrawerOpen: false, navigationCollapsed: true };
      }
      return { ...s, focusMode: false, inspectorOpen: true, navigationCollapsed: false };
    });
  }, []);

  const resetLayout = useCallback(() => setState(DEFAULT_STATE), []);

  const value: WorkbenchContextValue = {
    ...state,
    toggleNavigation,
    setNavigationCollapsed: (v) => setState((s) => ({ ...s, navigationCollapsed: v })),
    toggleInspector,
    setInspectorOpen: (v) => setState((s) => ({ ...s, inspectorOpen: v })),
    setInspectorWidth: (w) => setState((s) => ({ ...s, inspectorWidth: Math.max(288, Math.min(420, w)) })),
    toggleTaskDrawer,
    setTaskDrawerOpen: (v) => setState((s) => ({ ...s, taskDrawerOpen: v })),
    setTaskDrawerHeight: (h) => setState((s) => ({ ...s, taskDrawerHeight: Math.max(120, Math.min(600, h)) })),
    toggleFocusMode,
    setFocusMode: (v) => setState((s) => ({ ...s, focusMode: v })),
    resetLayout,
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench must be used within WorkbenchProvider");
  return ctx;
}
