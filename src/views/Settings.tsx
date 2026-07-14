/**
 * Settings — 分区设置页路由 (Phase G/H)
 *
 * 各分区实现已拆分至 src/views/settings/ 目录。
 * 写法风格和写法规则已迁移至 StyleWorkspace。
 */

import type { Project } from "@/types";
import { ModelConfigPage } from "./settings/ModelConfigPage";
import { ModelRoutesPage } from "./settings/ModelRoutesPage";
import { McpPermissionsPage } from "./settings/McpPermissionsPage";
import { AppearancePage } from "./settings/AppearancePage";
import { ShortcutsPage } from "./settings/ShortcutsPage";
import { AboutPage } from "./settings/AboutPage";

export function Settings({
  onBack: _onBack,
  projectId: _projectId,
  activeTab,
  currentProject,
}: {
  onBack: () => void;
  projectId: number | null;
  activeTab: string;
  currentProject: Project | null;
}) {
  switch (activeTab) {
    case "model-config":
      return <ModelConfigPage />;
    case "model-routes":
      return <ModelRoutesPage />;
    case "mcp-permissions":
      return <McpPermissionsPage />;
    case "appearance":
      return <AppearancePage />;
    case "shortcuts":
      return <ShortcutsPage />;
    case "about":
      return <AboutPage currentProject={currentProject} />;
    default:
      return <ModelConfigPage />;
  }
}
