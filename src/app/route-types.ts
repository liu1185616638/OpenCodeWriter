/**
 * Typed navigation system for the Workbench Shell.
 *
 * Project workspace routes and top-level settings are deliberately separate so
 * the type system cannot construct an unreachable `workspace/settings` route.
 */

export type WorkspaceRoute =
  | "project-profile"
  | "outline"
  | "characters"
  | "world"
  | "chapters"
  | "content"
  | "facts"
  | "knowledge"
  | "style"
  | "tasks";

/** Targets displayed in the global navigation pane. */
export type MainNavTarget = WorkspaceRoute | "settings";

export type SettingsSection =
  | "model-presets"
  | "model-routes"
  | "tools-permissions"
  | "mcp"
  | "appearance"
  | "shortcuts"
  | "about";

export type CreationProgressStage =
  | "framing"
  | "outline"
  | "characters"
  | "chapters"
  | "content";

export type AppRoute =
  | { name: "setup" }
  | { name: "project-library" }
  | { name: "idea-wizard"; idea?: string }
  | { name: "workspace"; projectId: number; section: WorkspaceRoute; targetId?: number }
  | { name: "settings"; tab: SettingsSection };

export function isWorkspaceRoute(route: AppRoute): route is Extract<AppRoute, { name: "workspace" }> {
  return route.name === "workspace";
}

export function isSettingsRoute(route: AppRoute): route is Extract<AppRoute, { name: "settings" }> {
  return route.name === "settings";
}

export type NavGroup = "creation" | "assets" | "support" | "system";

export interface NavItemDescriptor {
  route: MainNavTarget;
  label: string;
  icon: string;
  group: NavGroup;
  progressOrder: number;
}

export const NAV_ITEMS: NavItemDescriptor[] = [
  { route: "project-profile", label: "项目定盘", icon: "clipboard-list", group: "creation", progressOrder: 1 },
  { route: "outline", label: "大纲", icon: "file-text", group: "creation", progressOrder: 2 },
  { route: "characters", label: "人物", icon: "users", group: "creation", progressOrder: 3 },
  { route: "world", label: "世界观", icon: "globe", group: "creation", progressOrder: 0 },
  { route: "chapters", label: "章节规划", icon: "list-tree", group: "creation", progressOrder: 4 },
  { route: "content", label: "正文", icon: "pen", group: "creation", progressOrder: 5 },
  { route: "facts", label: "事实与伏笔", icon: "bookmark", group: "assets", progressOrder: 0 },
  { route: "knowledge", label: "知识库", icon: "library", group: "support", progressOrder: 0 },
  { route: "style", label: "写法引擎", icon: "sparkles", group: "support", progressOrder: 0 },
  { route: "tasks", label: "任务中心", icon: "activity", group: "system", progressOrder: 0 },
  { route: "settings", label: "设置", icon: "settings", group: "system", progressOrder: 0 },
];

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "creation", label: "创作" },
  { id: "assets", label: "故事资产" },
  { id: "support", label: "写作支持" },
  { id: "system", label: "系统" },
];

export function legacyStageToRoute(stage: string): WorkspaceRoute {
  switch (stage) {
    case "outline": return "outline";
    case "characters": return "characters";
    case "chapters": return "chapters";
    case "content": return "content";
    case "world": return "world";
    case "knowledge": return "knowledge";
    default: return "outline";
  }
}

export function routeToProgressStage(route: WorkspaceRoute): CreationProgressStage | null {
  switch (route) {
    case "project-profile": return "framing";
    case "outline": return "outline";
    case "characters": return "characters";
    case "chapters": return "chapters";
    case "content": return "content";
    default: return null;
  }
}
