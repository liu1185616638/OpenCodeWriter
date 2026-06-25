import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import type { TitleBarActions } from "@/components/layout/TitleBar";
import { AiProvider, useAI } from "@/contexts/AIContext";
import { SetupWizard } from "@/views/SetupWizard";
import { ProjectList } from "@/views/ProjectList";
import { OutlineEditor } from "@/views/OutlineEditor";
import { CharacterEditor } from "@/views/CharacterEditor";
import { ChapterEditor } from "@/views/ChapterEditor";
import { ContentEditor } from "@/views/ContentEditor";
import { Settings } from "@/views/Settings";
import { useTheme } from "@/hooks/useTheme";
import { useKeybindings } from "@/hooks/useKeybindings";
import type { Project, CreationStage } from "@/types";

type AppView = "setup" | "project-list" | "workspace" | "settings";
type SettingsTab = "writing-style" | "model-config" | "shortcuts" | "about";

function WorkspaceTitleBar({ onNewProject, onToggleTheme }: { onNewProject: () => void; onToggleTheme: () => void }) {
  const { toggleSidebar } = useSidebar();
  const actions: TitleBarActions = {
    onNewProject,
    onToggleTheme,
    onToggleSidebar: toggleSidebar,
    showSidebarToggle: true,
  };
  return <TitleBar actions={actions} />;
}

/**
 * Inner app that consumes AiContext.
 * Must be rendered inside <AiProvider> so that useAI() works.
 */
function AppInner() {
  const [view, setView] = useState<AppView>("setup");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentStage, setCurrentStage] = useState<CreationStage>("outline");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("writing-style");
  const { toggle: toggleTheme } = useTheme();
  const { generatingStage } = useAI();

  // Check setup status on launch
  useEffect(() => {
    async function checkSetup() {
      try {
        const complete = await invoke<string | null>("get_setting", { key: "setup_complete" });
        if (complete === "true") {
          setView("project-list");
        } else {
          setView("setup");
        }
      } catch {
        setView("setup");
      }
    }
    checkSetup();
  }, []);

  const handleNewProject = useCallback(() => {
    if (view !== "project-list") setView("project-list");
  }, [view]);

  const handleOpenSettings = useCallback(() => {
    setSettingsTab("writing-style");
    setView("settings");
  }, []);

  const handleBackFromSettings = useCallback(() => {
    if (currentProject) setView("workspace");
    else setView("project-list");
  }, [currentProject]);

  const handleSwitchProject = useCallback(() => {
    setCurrentProject(null);
    setView("project-list");
  }, []);

  useKeybindings({
    onNewProject: handleNewProject,
    onOpenSettings: handleOpenSettings,
    onToggleTheme: toggleTheme,
    onSwitchStage: (stage: CreationStage) => {
      if (currentProject) {
        setCurrentStage(stage);
        setView("workspace");
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

  const handleSetupComplete = () => {
    setView("project-list");
  };

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
    setCurrentStage(project.current_stage as CreationStage);
    setView("workspace");
  };

  const handleSelectStage = (stage: CreationStage) => {
    setCurrentStage(stage);
    setView("workspace");
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setView("project-list");
  };

  // TitleBar actions for non-sidebar mode
  const simpleTitleBarActions: TitleBarActions = {
    onNewProject: handleNewProject,
    onToggleTheme: toggleTheme,
    onToggleSidebar: () => {},
  };

  // Render current view
  const renderContent = () => {
    if (view === "setup") {
      return <SetupWizard onComplete={handleSetupComplete} />;
    }

    if (view === "project-list") {
      return <ProjectList onSelectProject={handleSelectProject} />;
    }

    if (view === "settings") {
      return <Settings onBack={currentProject ? () => setView("workspace") : handleBackToProjects} projectId={currentProject?.id ?? null} activeTab={settingsTab} currentProject={currentProject} />;
    }

    // Workspace view
    if (!currentProject) {
      return <ProjectList onSelectProject={handleSelectProject} />;
    }

    switch (currentStage) {
      case "outline":
        return <OutlineEditor project={currentProject} />;
      case "characters":
        return <CharacterEditor project={currentProject} />;
      case "chapters":
        return <ChapterEditor project={currentProject} />;
      case "content":
        return <ContentEditor project={currentProject} />;
    }
  };

  // Setup wizard doesn't need sidebar
  if (view === "setup") {
    return (
      <TooltipProvider>
        <div className="flex flex-col h-screen bg-background text-foreground">
          <TitleBar actions={simpleTitleBarActions} />
          <div className="flex-1 overflow-auto min-h-0">
            {renderContent()}
          </div>
        </div>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    );
  }

  // Project list, workspace, and settings all have sidebar
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          currentProject={currentProject}
          currentStage={currentStage}
          view={view}
          settingsTab={settingsTab}
          generatingStage={generatingStage ?? null}
          onSelectProject={handleSelectProject}
          onSelectStage={handleSelectStage}
          onNewProject={handleNewProject}
          onOpenSettings={handleOpenSettings}
          onSelectSettingsTab={setSettingsTab}
          onBackFromSettings={handleBackFromSettings}
        />
        <SidebarInset>
          <WorkspaceTitleBar onNewProject={handleNewProject} onToggleTheme={toggleTheme} />
          <main className="flex-1 overflow-hidden">
            {renderContent()}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <AiProvider>
      <AppInner />
    </AiProvider>
  );
}
