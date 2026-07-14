/**
 * WorkbenchContext — Shell layout state provider.
 *
 * Manages sidebar collapse, task drawer open/height,
 * focus mode, and the current workspace page title/status.
 *
 * Inspector panels are managed per-page, not globally.
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
  taskDrawerOpen: boolean;
  taskDrawerHeight: number;
  focusMode: boolean;
}

const DEFAULT_STATE: WorkspaceState = {
  navigationCollapsed: false,
  taskDrawerOpen: false,
  taskDrawerHeight: 240,
  focusMode: false,
};

interface WorkbenchContextValue extends WorkspaceState {
  /** Toggle sidebar between expanded (248px) and collapsed (56px) */
  toggleNavigation: () => void;
  setNavigationCollapsed: (v: boolean) => void;
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

// Layout snapshot saved before entering focus mode, restored on exit.
let focusLayoutSnapshot: { navigationCollapsed: boolean; taskDrawerOpen: boolean } | null = null;

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(DEFAULT_STATE);

  const toggleNavigation = useCallback(() => {
    setState((s) => ({ ...s, navigationCollapsed: !s.navigationCollapsed }));
  }, []);

  const toggleTaskDrawer = useCallback(() => {
    setState((s) => ({ ...s, taskDrawerOpen: !s.taskDrawerOpen }));
  }, []);

  const toggleFocusMode = useCallback(() => {
    setState((s) => {
      const next = !s.focusMode;
      if (next) {
        // Save current layout before entering focus mode
        focusLayoutSnapshot = {
          navigationCollapsed: s.navigationCollapsed,
          taskDrawerOpen: s.taskDrawerOpen,
        };
        return { ...s, focusMode: true, taskDrawerOpen: false, navigationCollapsed: true };
      }
      // Restore previous layout on exit
      if (focusLayoutSnapshot) {
        const snap = focusLayoutSnapshot;
        focusLayoutSnapshot = null;
        return { ...s, focusMode: false, taskDrawerOpen: snap.taskDrawerOpen, navigationCollapsed: snap.navigationCollapsed };
      }
      return { ...s, focusMode: false };
    });
  }, []);

  const resetLayout = useCallback(() => setState(DEFAULT_STATE), []);

  const value: WorkbenchContextValue = {
    ...state,
    toggleNavigation,
    setNavigationCollapsed: (v) => setState((s) => ({ ...s, navigationCollapsed: v })),
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
