import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/useProjects";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import type { Project, CreationStage } from "@/types";
import {
  FileText, Users, BookOpen, Pen, Plus, Moon, Sun,
  CheckCircle2, Circle, AlertTriangle, Dot,
  PanelLeft, EllipsisVertical, ArrowLeft,
  BookOpen as BookIcon,
  PenLine, Cpu, Keyboard, Info,
  FolderOpen, Loader2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

const stages: { key: CreationStage; label: string; icon: React.ElementType }[] = [
  { key: "outline", label: "大纲", icon: FileText },
  { key: "characters", label: "人物", icon: Users },
  { key: "chapters", label: "目录", icon: BookOpen },
  { key: "content", label: "正文", icon: Pen },
];

const settingsNavItems: { key: "writing-style" | "model-config" | "shortcuts" | "about"; label: string; icon: React.ElementType }[] = [
  { key: "writing-style", label: "写作风格", icon: PenLine },
  { key: "model-config", label: "模型配置", icon: Cpu },
  { key: "shortcuts", label: "快捷键", icon: Keyboard },
  { key: "about", label: "关于", icon: Info },
];

const staleTargetMap: Record<CreationStage, string> = {
  outline: "outline",
  characters: "characters",
  chapters: "chapters",
  content: "contents",
};

type StageStatus = "done" | "active" | "ready" | "pending" | "stale";

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-success-foreground" />;
    case "active":
      return <Circle className="h-4 w-4 text-primary" />;
    case "ready":
      return <Dot className="h-4 w-4 text-primary" />;
    case "stale":
      return <AlertTriangle className="h-4 w-4 text-warning-foreground" />;
    case "pending":
    default:
      return null;
  }
}

export function AppSidebar({
  currentProject,
  currentStage,
  view,
  settingsTab,
  generatingStage,
  onSelectProject,
  onSelectStage,
  onNewProject,
  onOpenSettings,
  onSelectSettingsTab,
  onBackFromSettings,
}: {
  currentProject: Project | null;
  currentStage: CreationStage;
  view: string;
  settingsTab: string;
  generatingStage: string | null;
  onSelectProject: (project: Project) => void;
  onSelectStage: (stage: CreationStage) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onSelectSettingsTab: (tab: "writing-style" | "model-config" | "shortcuts" | "about") => void;
  onBackFromSettings: () => void;
}) {
  const { projects } = useProjects();
  const { currentPreset } = useSettings();
  const { theme, toggle } = useTheme();
  const { toggleSidebar } = useSidebar();
  const [stageStatuses, setStageStatuses] = useState<Record<CreationStage, StageStatus>>({
    outline: "pending",
    characters: "pending",
    chapters: "pending",
    content: "pending",
  });

  useEffect(() => {
    if (!currentProject) {
      setStageStatuses({ outline: "pending", characters: "pending", chapters: "pending", content: "pending" });
      return;
    }

    async function fetchStatuses() {
      const stageOrder: CreationStage[] = ["outline", "characters", "chapters", "content"];
      const currentIdx = stageOrder.indexOf(currentProject!.current_stage as CreationStage);
      const statuses: Record<string, StageStatus> = {};

      for (const stage of stageOrder) {
        const stageIdx = stageOrder.indexOf(stage);

        try {
          const isStale = await invoke<boolean>("is_stale", { projectId: currentProject!.id, targetType: staleTargetMap[stage] });
          if (isStale) {
            statuses[stage] = "stale";
            continue;
          }
        } catch { /* ignore */ }

        if (stageIdx < currentIdx) statuses[stage] = "done";
        else if (stageIdx === currentIdx) statuses[stage] = "active";
        else if (stageIdx === currentIdx + 1) statuses[stage] = "ready";
        else statuses[stage] = "pending";
      }

      setStageStatuses(statuses as Record<CreationStage, StageStatus>);
    }

    fetchStatuses();
  }, [currentProject]);

  // Settings view: show settings navigation
  if (view === "settings") {
    return (
      <Sidebar className="rounded-xl border border-sidebar-border shadow-lg">
        <SidebarHeader className="flex items-center gap-2 px-6 py-5" data-tauri-drag-region>
          <div className="flex items-center gap-2 flex-1 pointer-events-none">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <BookIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-sidebar-primary-foreground">OpenCodeWriter</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={toggleSidebar}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </SidebarHeader>

        <SidebarContent className="px-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <button
                    className="flex items-center gap-2 w-full px-4 py-3 rounded-3xl text-sm font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent/50 transition-colors"
                    onClick={onBackFromSettings}
                  >
                    <ArrowLeft className="h-5 w-5" />
                    <span className="flex-1 text-left">返回</span>
                  </button>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs text-sidebar-foreground px-2 py-1">设置</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsNavItems.map(({ key, label, icon: NavIcon }) => (
                  <SidebarMenuItem key={key}>
                    <button
                      className={`flex items-center gap-2 w-full px-4 py-3 rounded-3xl text-sm font-medium transition-colors ${
                        settingsTab === key
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
                      }`}
                      onClick={() => onSelectSettingsTab(key)}
                    >
                      <span className="flex-1 text-left">{label}</span>
                      <NavIcon className="h-5 w-5" />
                    </button>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="flex items-center gap-2 px-6 py-5">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-sm font-semibold text-sidebar-accent-foreground truncate">
              模型: {currentPreset?.model_name ?? "未配置"}
            </span>
            <span className="text-sm text-sidebar-foreground truncate">
              <span className={`inline-block h-2 w-2 rounded-full mr-1 ${currentPreset ? "bg-success-foreground" : "bg-error-foreground"}`} />
              {currentPreset ? "已连接" : "未连接"}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-sidebar-accent-foreground hover:bg-sidebar-accent">
                <EllipsisVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end">
              <DropdownMenuItem onClick={toggle}>
                {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {theme === "dark" ? "浅色模式" : "深色模式"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNewProject}>
                <Plus className="h-4 w-4 mr-2" />
                新建项目
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
    );
  }

  // Normal workspace / project-list view
  return (
    <Sidebar className="rounded-xl border border-sidebar-border shadow-lg">
      {/* Header — Logo + Collapse toggle */}
      <SidebarHeader className="flex items-center gap-2 px-6 py-5" data-tauri-drag-region>
        <div className="flex items-center gap-2 flex-1 pointer-events-none">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <BookIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm text-sidebar-primary-foreground">OpenCodeWriter</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-4">
        {/* Current project (when in workspace) */}
        {currentProject && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs text-sidebar-foreground px-2 py-1">项目</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 w-full px-4 py-3 rounded-3xl bg-sidebar-accent text-sm font-medium">
                    <span className="flex-1 text-left text-sidebar-accent-foreground">{currentProject.name}</span>
                    <BookIcon className="h-5 w-5 text-sidebar-accent-foreground" />
                  </div>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Project list (when no project selected — project-list view) */}
        {!currentProject && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs text-sidebar-foreground px-2 py-1">项目列表</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projects.map((p) => (
                  <SidebarMenuItem key={p.id}>
                    <button
                      className={`flex items-center gap-2 w-full px-4 py-3 rounded-3xl text-sm font-medium transition-colors text-sidebar-accent-foreground hover:bg-sidebar-accent/50`}
                      onClick={() => onSelectProject(p)}
                    >
                      <span className="flex-1 text-left">{p.name}</span>
                      <BookIcon className="h-5 w-5 text-sidebar-foreground" />
                    </button>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <button
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-3xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    onClick={onNewProject}
                  >
                    <Plus className="h-4 w-4" />
                    <span>新建项目</span>
                  </button>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Creation stages (only when project is selected) */}
        {currentProject && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs text-sidebar-foreground px-2 py-1">创作阶段</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {stages.map(({ key, label }) => (
                  <SidebarMenuItem key={key}>
                    <button
                      className={`flex items-center gap-2 w-full px-4 py-3 rounded-3xl text-sm font-medium transition-colors ${
                        currentStage === key
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
                      }`}
                      onClick={() => onSelectStage(key)}
                    >
                      <span className="flex-1 text-left">{label}</span>
                      {generatingStage === key ? (
	                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
	                      ) : (
	                        <StageIcon status={stageStatuses[key]} />
	                      )}
                    </button>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer — model info + more menu */}
      <SidebarFooter className="flex items-center gap-2 px-6 py-5">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {currentProject ? (
            <>
              <span className="text-sm font-semibold text-sidebar-accent-foreground truncate">
                模型: {currentPreset?.model_name ?? "未配置"}
              </span>
              <span className="text-sm text-sidebar-foreground truncate">
                <span className={`inline-block h-2 w-2 rounded-full mr-1 ${currentPreset ? "bg-success-foreground" : "bg-error-foreground"}`} />
                {currentPreset ? "已连接" : "未连接"}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-sidebar-accent-foreground truncate">
                欢迎使用
              </span>
              <span className="text-sm text-sidebar-foreground truncate">
                选择或创建项目开始
              </span>
            </>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-sidebar-accent-foreground hover:bg-sidebar-accent">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            <DropdownMenuItem onClick={toggle}>
              {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {theme === "dark" ? "浅色模式" : "深色模式"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewProject}>
              <Plus className="h-4 w-4 mr-2" />
              新建项目
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSettings}>
              <PenLine className="h-4 w-4 mr-2" />
              设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { /* switch project */ }}>
              <FolderOpen className="h-4 w-4 mr-2" />
              切换项目
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
