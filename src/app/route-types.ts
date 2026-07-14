/**
 * Typed navigation system for the Workbench Shell.
 *
 * Replaces the old `view + currentStage + settingsTab` triple-state with
 * a single discriminated union route. This allows type-safe navigation
 * and makes it easy to add cross-page jumps and entity targeting.
 */

/** Routes within a project workspace */
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
  | "tasks"
  | "settings";

/** Settings sub-sections */
export type SettingsSection =
  | "model-presets"
  | "model-routes"
  | "tools-permissions"
  | "mcp"
  | "appearance"
  | "shortcuts"
  | "about";

/**
 * The old `CreationStage` mixed navigation with creation progress.
 * `CreationProgressStage` is now only used for progress tracking / `current_stage` persistence.
 */
export type CreationProgressStage =
  | "framing"
  | "outline"
  | "characters"
  | "chapters"
  | "content";

/**
 * Discriminated union for the entire app's navigation state.
 * A single source of truth that replaces `view`, `currentStage`, and `settingsTab`.
 */
export type AppRoute =
  | { name: "setup" }
  | { name: "project-library" }
  | { name: "idea-wizard"; idea?: string }
  | { name: "workspace"; projectId: number; section: WorkspaceRoute; targetId?: number }
  | { name: "settings"; tab: SettingsSection };

/** Type guard helpers */
export function isWorkspaceRoute(route: AppRoute): route is Extract<AppRoute, { name: "workspace" }> {
  return route.name === "workspace";
}

export function isSettingsRoute(route: AppRoute): route is Extract<AppRoute, { name: "settings" }> {
  return route.name === "settings";
}

/**
 * Navigation group for sidebar grouping.
 * Matches the Design Brief's "创作、资产、支持" information architecture.
 */
export type NavGroup = "creation" | "assets" | "support" | "system";

export interface NavItemDescriptor {
  route: WorkspaceRoute;
  label: string;
  icon: string; // lucide icon name
  group: NavGroup;
  /** Stage progress order (0 = not a progress stage) */
  progressOrder: number;
}

/**
 * Navigation items organized by group.
 * This is the source of truth for the sidebar navigation.
 */
export const NAV_ITEMS: NavItemDescriptor[] = [
  // Creation group
  { route: "project-profile", label: "项目定盘", icon: "clipboard-list", group: "creation", progressOrder: 1 },
  { route: "outline", label: "大纲", icon: "file-text", group: "creation", progressOrder: 2 },
  { route: "characters", label: "人物", icon: "users", group: "creation", progressOrder: 3 },
  { route: "world", label: "世界观", icon: "globe", group: "creation", progressOrder: 0 },
  { route: "chapters", label: "章节规划", icon: "list-tree", group: "creation", progressOrder: 4 },
  { route: "content", label: "正文", icon: "pen", group: "creation", progressOrder: 5 },

  // Assets group
  { route: "facts", label: "事实与伏笔", icon: "bookmark", group: "assets", progressOrder: 0 },

  // Support group
  { route: "knowledge", label: "知识库", icon: "library", group: "support", progressOrder: 0 },
  { route: "style", label: "写法引擎", icon: "sparkles", group: "support", progressOrder: 0 },

  // System group
  { route: "tasks", label: "任务中心", icon: "activity", group: "system", progressOrder: 0 },
  { route: "settings", label: "设置", icon: "settings", group: "system", progressOrder: 0 },
];

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "creation", label: "创作" },
  { id: "assets", label: "故事资产" },
  { id: "support", label: "写作支持" },
  { id: "system", label: "系统" },
];

/**
 * Maps old `CreationStage` to new `WorkspaceRoute`.
 * Used for backward compatibility with `projects.current_stage`.
 */
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

/**
 * Maps `WorkspaceRoute` to `CreationProgressStage` for persistence.
 * Routes that aren't creation stages return null.
 */
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
