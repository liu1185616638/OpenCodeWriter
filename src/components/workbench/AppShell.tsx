/**
 * AppShell — Carbon Frost 工作台外壳
 *
 * 布局：左侧 NavigationPane + 中央主工作区（TopTaskbar + MainContent + TaskDrawer + StatusBar）
 * 在专注模式下隐藏侧栏、任务抽屉和状态栏。
 *
 * 替代旧的 AppSidebar + TitleBar + WorkspacePageLayout 组合。
 */

import { type ReactNode } from "react";
import { useWorkbench } from "@/app/WorkbenchContext";
import { NavigationPane } from "./NavigationPane";
import { TopTaskbar } from "./TopTaskbar";
import { TaskDrawer } from "./TaskDrawer";
import { StatusBar } from "./StatusBar";
import type { WorkspaceRoute } from "@/app/route-types";
import type { Project } from "@/types";

export interface AppShellProps {
  currentProject: Project | null;
  currentSection: WorkspaceRoute | null;
  modelPresetName?: string;
  connected: boolean;
  onNavigate: (route: WorkspaceRoute) => void;
  onSwitchProject: () => void;
  navBadges?: Partial<Record<WorkspaceRoute, number>>;
  navLoading?: Partial<Record<WorkspaceRoute, boolean>>;
  /** Top taskbar props */
  pageTitle: string;
  pageSubtitle?: string;
  saveStatus?: "saved" | "saving" | "error" | null;
  topbarActions?: ReactNode;
  onBack?: () => void;
  canGoBack?: boolean;
  /** Main content */
  children: ReactNode;
  /** Status bar props */
  wordCount?: number;
  chapterCount?: number;
  /** Disable sidebar entirely (e.g. setup wizard, project library) */
  hideSidebar?: boolean;
}

export function AppShell({
  currentProject,
  currentSection,
  modelPresetName,
  connected,
  onNavigate,
  onSwitchProject,
  navBadges,
  navLoading,
  pageTitle,
  pageSubtitle,
  saveStatus,
  topbarActions,
  onBack,
  canGoBack,
  children,
  wordCount,
  chapterCount,
  hideSidebar = false,
}: AppShellProps) {
  const { focusMode } = useWorkbench();

  const showSidebar = !hideSidebar && !focusMode;

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
      {/* Left: Navigation Pane */}
      {showSidebar && (
        <NavigationPane
          currentProject={currentProject}
          currentSection={currentSection}
          modelPresetName={modelPresetName}
          connected={connected}
          onNavigate={onNavigate}
          onSwitchProject={onSwitchProject}
          navBadges={navBadges}
          navLoading={navLoading}
        />
      )}

      {/* Right: Main Workspace */}
      <div className="flex flex-1 flex-col min-w-0 h-full">
        {/* Top Task Bar */}
        <TopTaskbar
          title={pageTitle}
          subtitle={pageSubtitle}
          saveStatus={saveStatus}
          actions={topbarActions}
          onBack={onBack}
          canGoBack={canGoBack}
        />

        {/* Main content */}
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>

        {/* Task Drawer — hidden in focus mode */}
        {!focusMode && <TaskDrawer projectId={currentProject?.id} />}

        {/* Status Bar — hidden in focus mode */}
        {!focusMode && (
          <StatusBar
            wordCount={wordCount}
            chapterCount={chapterCount}
            modelPresetName={modelPresetName}
            connected={connected}
          />
        )}
      </div>
    </div>
  );
}
