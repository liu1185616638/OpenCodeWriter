import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/workbench/AppShell";
import { WindowControls } from "@/components/workbench/WindowControls";
import { NavigationProvider, useNavigation } from "@/app/AppNavigationContext";
import { WorkbenchProvider } from "@/app/WorkbenchContext";
import {
  legacyStageToRoute, routeToProgressStage,
  type WorkspaceRoute, type SettingsSection,
} from "@/app/route-types";
import { AiProvider, useAI } from "@/contexts/AIContext";
import { SetupWizard } from "@/views/SetupWizard";
import { ProjectList } from "@/views/ProjectList";
import { useTheme, ThemeProvider } from "@/hooks/useTheme";
import { useKeybindings } from "@/hooks/useKeybindings";
import { useSettings, SettingsProvider } from "@/hooks/useSettings";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import { updateProjectStage } from "@/lib/tauri";
import type { Project, CreationStage } from "@/types";

// ── Lazy-loaded route views (code-splitting) ──
const OutlineEditor = lazy(() => import("@/views/OutlineEditor").then(m => ({ default: m.OutlineEditor })));
const CharacterEditor = lazy(() => import("@/views/CharacterEditor").then(m => ({ default: m.CharacterEditor })));
const ChapterEditor = lazy(() => import("@/views/ChapterEditor").then(m => ({ default: m.ChapterEditor })));
const ContentEditor = lazy(() => import("@/views/ContentEditor").then(m => ({ default: m.ContentEditor })));
const WorldEditor = lazy(() => import("@/views/WorldEditor").then(m => ({ default: m.WorldEditor })));
const KnowledgeEditor = lazy(() => import("@/views/KnowledgeEditor").then(m => ({ default: m.KnowledgeEditor })));
const FactsEditor = lazy(() => import("@/views/FactsEditor").then(m => ({ default: m.FactsEditor })));
const StyleWorkspace = lazy(() => import("@/views/StyleWorkspace").then(m => ({ default: m.StyleWorkspace })));
const TaskCenter = lazy(() => import("@/views/TaskCenter").then(m => ({ default: m.TaskCenter })));
const Settings = lazy(() => import("@/views/Settings").then(m => ({ default: m.Settings })));
const ProjectProfileView = lazy(() => import("@/views/ProjectProfileView").then(m => ({ default: m.ProjectProfileView })));
const IdeaToProjectWizard = lazy(() => import("@/views/IdeaToProjectWizard").then(m => ({ default: m.IdeaToProjectWizard })));

/** Suspense fallback spinner */
const RouteFallback = () => (
  <div className="flex items-center justify-center h-full">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// ── Settings tab mapping (old ↔ new) ──
const SETTINGS_TAB_MAP: Record<SettingsSection, string> = {
  "model-presets": "model-config",
  "model-routes": "model-routes",
  "tools-permissions": "mcp-permissions",
  "mcp": "mcp-permissions",
  "appearance": "appearance",
  "shortcuts": "shortcuts",
  "about": "about",
};

function mapSectionToLegacyTab(section: SettingsSection): string {
  return SETTINGS_TAB_MAP[section] ?? "writing-style";
}

/** Page title for a workspace section */
function sectionTitle(section: WorkspaceRoute): string {
  switch (section) {
    case "project-profile": return "项目定盘";
    case "outline": return "大纲";
    case "characters": return "人物";
    case "world": return "世界观";
    case "chapters": return "章节规划";
    case "content": return "正文";
    case "facts": return "事实与伏笔";
    case "knowledge": return "知识库";
    case "style": return "写法引擎";
    case "tasks": return "任务中心";
    case "settings": return "设置";
    default: return section;
  }
}

/**
 * Inner app that consumes AIContext and the new typed navigation.
 */
function AppInner() {
  const { route, navigate, goBack, canGoBack, setRoute } = useNavigation();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const { toggle: toggleTheme } = useTheme();
  const { generatingStage } = useAI();
  const { currentPreset } = useSettings();

  // Check setup status on launch
  useEffect(() => {
    async function checkSetup() {
      try {
        const complete = await invoke<string | null>("get_setting", { key: "setup_complete" });
        if (complete === "true") {
          setRoute({ name: "project-library" });
        } else {
          setRoute({ name: "setup" });
        }
      } catch {
        setRoute({ name: "setup" });
      }
    }
    checkSetup();
  }, [setRoute]);

  // Compute current workspace section (also highlight "settings" when on settings route)
  const currentSection: WorkspaceRoute | null =
    route.name === "workspace" ? route.section :
    route.name === "settings" ? "settings" : null;

  // Settings tab (mapped to legacy for existing Settings component)
  const settingsTab =
    route.name === "settings" ? mapSectionToLegacyTab(route.tab) : "writing-style";

  const handleNewProject = useCallback(() => {
    navigate({ name: "project-library" });
  }, [navigate]);

  const handleOpenSettings = useCallback(() => {
    navigate({ name: "settings", tab: "model-presets" });
  }, [navigate]);

  const handleSwitchProject = useCallback(() => {
    setCurrentProject(null);
    navigate({ name: "project-library" });
  }, [navigate]);

  useKeybindings({
    onNewProject: handleNewProject,
    onOpenSettings: handleOpenSettings,
    onToggleTheme: toggleTheme,
    onSwitchStage: (stage: CreationStage) => {
      if (currentProject) {
        const section = legacyStageToRoute(stage);
        navigate({ name: "workspace", projectId: currentProject.id, section });
      }
    },
    onGenerate: () => {
      window.dispatchEvent(new CustomEvent("app:generate"));
    },
    onSwitchModel: () => {
      window.dispatchEvent(new CustomEvent("app:switch-model"));
    },
    onSwitchProject: handleSwitchProject,
    onSave: () => {
      window.dispatchEvent(new CustomEvent("app:save"));
    },
  });

  const handleSetupComplete = useCallback(() => {
    navigate({ name: "project-library" });
  }, [navigate]);

  const handleSelectProject = useCallback((project: Project) => {
    setCurrentProject(project);
    const section = legacyStageToRoute(project.current_stage);
    navigate({ name: "workspace", projectId: project.id, section });
  }, [navigate]);

  const handleNavigateSection = useCallback((section: WorkspaceRoute) => {
    // Settings is a top-level route, not a workspace section
    if (section === "settings") {
      navigate({ name: "settings", tab: "model-presets" });
      return;
    }
    if (currentProject) {
      // Persist creation progress stage
      const progress = routeToProgressStage(section);
      if (progress) {
        updateProjectStage(currentProject.id, progress).catch(() => { /* ignore */ });
        setCurrentProject(prev => prev ? { ...prev, current_stage: progress } : null);
      }
      navigate({ name: "workspace", projectId: currentProject.id, section });
    }
  }, [currentProject, navigate]);

  // ── Render content based on route (lazy views wrapped in Suspense) ──
  const renderContent = () => {
    if (route.name === "setup") {
      return <SetupWizard onComplete={handleSetupComplete} />;
    }

    if (route.name === "project-library") {
      return (
        <ProjectList
          onSelectProject={handleSelectProject}
          onStartIdeaWizard={(idea) => navigate({ name: "idea-wizard", idea })}
        />
      );
    }

    if (route.name === "idea-wizard") {
      return (
        <Suspense fallback={<RouteFallback />}>
          <IdeaToProjectWizard
            initialIdea={route.idea}
            onComplete={(project) => {
              setCurrentProject(project);
              navigate({ name: "workspace", projectId: project.id, section: "outline" });
            }}
            onCancel={() => navigate({ name: "project-library" })}
          />
        </Suspense>
      );
    }

    if (route.name === "settings") {
      return (
        <Suspense fallback={<RouteFallback />}>
          <Settings
            onBack={() => goBack()}
            projectId={currentProject?.id ?? null}
            activeTab={settingsTab}
            currentProject={currentProject}
          />
        </Suspense>
      );
    }

    // Workspace
    if (route.name === "workspace" && currentProject) {
      return (
        <Suspense fallback={<RouteFallback />}>
          {(() => {
            switch (route.section) {
              case "project-profile":
                return <ProjectProfileView project={currentProject} />;
              case "outline":
                return <OutlineEditor project={currentProject} />;
              case "characters":
                return <CharacterEditor project={currentProject} />;
              case "chapters":
                return <ChapterEditor project={currentProject} />;
              case "content":
                return <ContentEditor project={currentProject} />;
              case "world":
                return <WorldEditor project={currentProject} />;
              case "knowledge":
                return <KnowledgeEditor project={currentProject} />;
              case "facts":
                return <FactsEditor project={currentProject} />;
              case "style":
                return <StyleWorkspace project={currentProject} />;
              case "tasks":
                return <TaskCenter project={currentProject} />;
              case "settings":
                // Settings is handled as a top-level route; this should not be reached
                return <OutlineEditor project={currentProject} />;
              default:
                return <OutlineEditor project={currentProject} />;
            }
          })()}
        </Suspense>
      );
    }

    // Fallback: project library
    return (
      <ProjectList
        onSelectProject={handleSelectProject}
        onStartIdeaWizard={(idea) => navigate({ name: "idea-wizard", idea })}
      />
    );
  };

  // ── Setup wizard: minimal drag bar + content ──
  if (route.name === "setup") {
    return (
      <TooltipProvider>
        <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--canvas)" }}>
          <div
            className="flex items-center justify-end shrink-0"
            style={{ height: 36, backgroundColor: "var(--surface)" }}
            data-tauri-drag-region
          >
            <WindowControls />
          </div>
          {renderContent()}
        </div>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    );
  }

  // ── Project library: shell without sidebar ──
  if (route.name === "project-library" || route.name === "idea-wizard") {
    return (
      <TooltipProvider>
        <AppShell
          hideSidebar
          currentProject={null}
          currentSection={null}
          modelPresetName={currentPreset?.model_name}
          connected={Boolean(currentPreset)}
          onNavigate={() => {}}
          onSwitchProject={() => {}}
          pageTitle={route.name === "idea-wizard" ? "一句话开书" : "项目库"}
          pageSubtitle="从一句想法开始你的创作之旅"
          onBack={() => navigate({ name: "project-library" })}
          canGoBack={route.name === "idea-wizard"}
        >
          {renderContent()}
        </AppShell>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    );
  }

  // ── Settings: shell with sidebar ──
  if (route.name === "settings") {
    return (
      <TooltipProvider>
        <AppShell
          currentProject={currentProject}
          currentSection="settings"
          modelPresetName={currentPreset?.model_name}
          connected={Boolean(currentPreset)}
          onNavigate={handleNavigateSection}
          onSwitchProject={handleSwitchProject}
          pageTitle="设置"
          onBack={() => goBack()}
          canGoBack={canGoBack}
        >
          <div className="flex h-full overflow-hidden">
            {/* Settings sub-navigation */}
            <div className="shrink-0 flex flex-col" style={{ width: 200, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
              {([
                { tab: "model-presets" as SettingsSection, label: "模型预设" },
                { tab: "model-routes" as SettingsSection, label: "模型路由" },
                { tab: "tools-permissions" as SettingsSection, label: "工具与权限" },
                { tab: "mcp" as SettingsSection, label: "MCP" },
                { tab: "appearance" as SettingsSection, label: "外观" },
                { tab: "shortcuts" as SettingsSection, label: "快捷键" },
                { tab: "about" as SettingsSection, label: "关于" },
              ]).map(({ tab, label }) => (
                <button
                  key={tab}
                  onClick={() => navigate({ name: "settings", tab })}
                  style={{
                    height: 36,
                    padding: "0 16px",
                    fontSize: 13,
                    textAlign: "left",
                    backgroundColor: route.tab === tab ? "var(--surface-selected)" : "transparent",
                    color: route.tab === tab ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: route.tab === tab ? 500 : 400,
                    borderLeft: route.tab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Settings content */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              <Suspense fallback={<RouteFallback />}>
                <Settings
                  onBack={() => goBack()}
                  projectId={currentProject?.id ?? null}
                  activeTab={settingsTab}
                  currentProject={currentProject}
                />
              </Suspense>
            </div>
          </div>
        </AppShell>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    );
  }

  // ── Workspace: full shell with sidebar + inspector ──
  return (
    <TooltipProvider>
      <AppShell
        currentProject={currentProject}
        currentSection={currentSection}
        modelPresetName={currentPreset?.model_name}
        connected={Boolean(currentPreset)}
        onNavigate={handleNavigateSection}
        onSwitchProject={handleSwitchProject}
        pageTitle={
          currentProject
            ? `${currentProject.name} · ${sectionTitle(currentSection ?? "outline")}`
            : "工作区"
        }
        pageSubtitle={generatingStage ? `正在生成：${generatingStage}` : undefined}
        onBack={() => navigate({ name: "project-library" })}
        canGoBack={true}
        navBadges={{}}
        navLoading={generatingStage ? { [generatingStage as WorkspaceRoute]: true } : {}}
      >
        {renderContent()}
      </AppShell>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AppearanceProvider>
          <AiProvider>
            <NavigationProvider>
              <WorkbenchProvider>
                <AppInner />
              </WorkbenchProvider>
            </NavigationProvider>
          </AiProvider>
        </AppearanceProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
