/**
 * AppNavigationContext — typed navigation state provider.
 *
 * Replaces the old `view + currentStage + settingsTab` triple-state in App.tsx.
 * Provides `navigate()`, `goBack()`, and history-aware navigation.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AppRoute, WorkspaceRoute, SettingsSection } from "./route-types";

interface NavigationContextValue {
  /** Current route (single source of truth) */
  route: AppRoute;
  /** Navigate to a new route */
  navigate: (route: AppRoute) => void;
  /** Go back to previous route */
  goBack: () => void;
  /** Navigate within a workspace */
  navigateWorkspace: (section: WorkspaceRoute, targetId?: number) => void;
  /** Navigate to settings */
  navigateSettings: (tab: SettingsSection) => void;
  /** Navigate to project library */
  navigateProjectLibrary: () => void;
  /** Can go back? */
  canGoBack: boolean;
  /** Set route directly (for cases where we need raw access) */
  setRoute: Dispatch<SetStateAction<AppRoute>>;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
  initialRoute = { name: "setup" },
}: {
  children: ReactNode;
  initialRoute?: AppRoute;
}) {
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const historyRef = useRef<AppRoute[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);

  const navigate = useCallback((newRoute: AppRoute) => {
    setRoute((prev) => {
      historyRef.current.push(prev);
      setCanGoBack(historyRef.current.length > 0);
      return newRoute;
    });
  }, []);

  const goBack = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev) {
      setCanGoBack(historyRef.current.length > 0);
      setRoute(prev);
    }
  }, []);

  const navigateWorkspace = useCallback(
    (section: WorkspaceRoute, targetId?: number) => {
      setRoute((prev) => {
        if (prev.name === "workspace") {
          // Same project, just switch section
          return { ...prev, section, targetId };
        }
        // Push history if entering workspace from elsewhere
        historyRef.current.push(prev);
        setCanGoBack(historyRef.current.length > 0);
        return { name: "workspace", projectId: 0, section, targetId };
      });
    },
    []
  );

  const navigateSettings = useCallback((tab: SettingsSection) => {
    setRoute((prev) => {
      if (prev.name === "settings") {
        return { ...prev, tab };
      }
      historyRef.current.push(prev);
      setCanGoBack(historyRef.current.length > 0);
      return { name: "settings", tab };
    });
  }, []);

  const navigateProjectLibrary = useCallback(() => {
    navigate({ name: "project-library" });
  }, [navigate]);

  return (
    <NavigationContext.Provider
      value={{
        route,
        navigate,
        goBack,
        navigateWorkspace,
        navigateSettings,
        navigateProjectLibrary,
        canGoBack,
        setRoute,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
