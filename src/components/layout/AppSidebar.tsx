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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-success-foreground" />;
    case "active":
      return <Circle className="h-4 w-4 shrink-0 text-primary" />;
    case "ready":
      return <Dot className="h-4 w-4 shrink-0 text-primary" />;
    case "stale":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground" />;
    case "pending":
    default:
      return <span className="h-4 w-4 shrink-0" />;
  }
}

function SidebarBrand() {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarHeader className="flex flex-row items-center gap-2 px-4 py-4" data-tauri-drag-region>
      <div className="flex min-w-0 flex-1 items-center gap-2 pointer-events-none">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm">
          <BookIcon className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="min-w-0 truncate whitespace-nowrap text-sm font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">
          OpenCodeWriter
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 rounded-full border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
        onClick={toggleSidebar}
        aria-label="折叠侧栏"
        title="折叠侧栏"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
    </SidebarHeader>
  );
}

function SidebarNavButton({
  active = false,
  icon: Icon,
  label,
  onClick,
  trailing,
}: {
  active?: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      className={`flex h-11 w-full min-w-0 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-accent-foreground hover:bg-sidebar-accent/60"
      }`}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">{label}</span>
      {trailing && <span className="shrink-0 group-data-[collapsible=icon]:hidden">{trailing}</span>}
    </button>
  );
}

function SidebarFooterStatus({
  currentProject,
  currentPresetName,
  connected,
  onNewProject,
  onOpenSettings,
  onToggleTheme,
  theme,
}: {
  currentProject: Project | null;
  currentPresetName?: string;
  connected: boolean;
  onNewProject: () => void;
  onOpenSettings?: () => void;
  onToggleTheme: () => void;
  theme: string;
}) {
  return (
    <SidebarFooter className="flex flex-row items-center gap-2 px-4 py-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
        {currentProject ? (
          <>
            <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
              模型: {currentPresetName ?? "未配置"}
            </span>
            <span className="truncate text-sm text-sidebar-foreground">
              <span className={`mr-1 inline-block h-2 w-2 rounded-full ${connected ? "bg-success-foreground" : "bg-error-foreground"}`} />
              {connected ? "已连接" : "未连接"}
            </span>
          </>
        ) : (
          <>
            <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">欢迎使用</span>
            <span className="truncate text-sm text-sidebar-foreground">选择或创建项目开始</span>
          </>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 rounded-full text-sidebar-accent-foreground hover:bg-sidebar-accent"
            aria-label="更多操作"
            title="更多操作"
          >
            <EllipsisVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem onClick={onToggleTheme}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === "dark" ? "浅色模式" : "深色模式"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNewProject}>
            <Plus className="mr-2 h-4 w-4" />
            新建项目
          </DropdownMenuItem>
          {onOpenSettings && (
            <DropdownMenuItem onClick={onOpenSettings}>
              <PenLine className="mr-2 h-4 w-4" />
              设置
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { /* switch project */ }}>
            <FolderOpen className="mr-2 h-4 w-4" />
            切换项目
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
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

  if (view === "settings") {
    return (
      <Sidebar collapsible="icon" className="rounded-xl border border-sidebar-border shadow-lg">
        <SidebarBrand />

        <SidebarContent className="overflow-hidden px-3">
          <ScrollArea className="h-full">
            <div className="space-y-2 py-2 pr-1">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarNavButton icon={ArrowLeft} label="返回" onClick={onBackFromSettings} />
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel className="px-2 py-1 text-xs text-sidebar-foreground">设置</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {settingsNavItems.map(({ key, label, icon }) => (
                      <SidebarMenuItem key={key}>
                        <SidebarNavButton
                          active={settingsTab === key}
                          icon={icon}
                          label={label}
                          onClick={() => onSelectSettingsTab(key)}
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooterStatus
          currentProject={currentProject}
          currentPresetName={currentPreset?.model_name}
          connected={Boolean(currentPreset)}
          onNewProject={onNewProject}
          onToggleTheme={toggle}
          theme={theme}
        />
        <SidebarRail />
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" className="rounded-xl border border-sidebar-border shadow-lg">
      <SidebarBrand />

      <SidebarContent className="overflow-hidden px-3">
        <ScrollArea className="h-full">
          <div className="space-y-2 py-2 pr-1">
            {currentProject && (
              <SidebarGroup>
                <SidebarGroupLabel className="px-2 py-1 text-xs text-sidebar-foreground">项目</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <div
                        className="flex h-11 w-full min-w-0 items-center gap-3 rounded-2xl bg-sidebar-accent px-3 text-sm font-medium text-sidebar-accent-foreground group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                        title={currentProject.name}
                      >
                        <BookIcon className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">{currentProject.name}</span>
                      </div>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {!currentProject && (
              <SidebarGroup>
                <SidebarGroupLabel className="px-2 py-1 text-xs text-sidebar-foreground">项目列表</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {projects.map((p) => (
                      <SidebarMenuItem key={p.id}>
                        <SidebarNavButton icon={BookIcon} label={p.name} onClick={() => onSelectProject(p)} />
                      </SidebarMenuItem>
                    ))}
                    <SidebarMenuItem>
                      <SidebarNavButton icon={Plus} label="新建项目" onClick={onNewProject} active />
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {currentProject && (
              <SidebarGroup>
                <SidebarGroupLabel className="px-2 py-1 text-xs text-sidebar-foreground">创作阶段</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {stages.map(({ key, label, icon }) => (
                      <SidebarMenuItem key={key}>
                        <SidebarNavButton
                          active={currentStage === key}
                          icon={icon}
                          label={label}
                          onClick={() => onSelectStage(key)}
                          trailing={
                            generatingStage === key ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <StageIcon status={stageStatuses[key]} />
                            )
                          }
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </div>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooterStatus
        currentProject={currentProject}
        currentPresetName={currentPreset?.model_name}
        connected={Boolean(currentPreset)}
        onNewProject={onNewProject}
        onOpenSettings={onOpenSettings}
        onToggleTheme={toggle}
        theme={theme}
      />
      <SidebarRail />
    </Sidebar>
  );
}
