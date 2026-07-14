/**
 * NavigationPane — Carbon Frost 左侧全局导航栏
 *
 * 展开宽度 248px，收起宽度 56px。
 * 顶部为品牌/项目切换器；中部按"创作、资产、支持"分组；底部为系统设置和连接状态。
 * 匹配 Pencil 设计 V7-V14 的 Application Sidebar。
 */

import {
  BookOpen, PanelLeftClose, PanelLeftOpen,
  FolderOpen, Cpu, Dot,
} from "lucide-react";
import { useWorkbench } from "@/app/WorkbenchContext";
import {
  NAV_ITEMS, NAV_GROUPS,
  type NavItemDescriptor, type NavGroup,
} from "@/app/route-types";
import type { WorkspaceRoute } from "@/app/route-types";
import type { Project } from "@/types";
import { cn } from "@/lib/cn";

interface NavigationPaneProps {
  currentProject: Project | null;
  currentSection: WorkspaceRoute | null;
  modelPresetName?: string;
  connected: boolean;
  onNavigate: (route: WorkspaceRoute) => void;
  onSwitchProject: () => void;
  /** Optional trailing badge per nav item (e.g. stale count) */
  navBadges?: Partial<Record<WorkspaceRoute, number>>;
  /** Optional loading indicator per nav item */
  navLoading?: Partial<Record<WorkspaceRoute, boolean>>;
}

export function NavigationPane({
  currentProject,
  currentSection,
  modelPresetName,
  connected,
  onNavigate,
  onSwitchProject,
  navBadges,
  navLoading,
}: NavigationPaneProps) {
  const { navigationCollapsed, toggleNavigation } = useWorkbench();
  const collapsed = navigationCollapsed;
  const width = collapsed ? 56 : 248;

  return (
    <nav
      className="flex h-full flex-col shrink-0 border-r"
      style={{
        width,
        backgroundColor: "var(--nav)",
        borderColor: "var(--border)",
        transition: "width 0.15s ease",
      }}
      aria-label="主导航"
    >
      {/* Brand Header */}
      <div
        className={cn(
          "flex items-center border-b shrink-0",
          collapsed ? "justify-center px-0" : "gap-2 px-4"
        )}
        style={{ height: 58, borderColor: "var(--border)" }}
        data-tauri-drag-region
      >
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{
            width: 32, height: 32,
            backgroundColor: "var(--accent)",
          }}
        >
          <BookOpen style={{ width: 16, height: 16, color: "#FFFFFF" }} />
        </div>
        {!collapsed && (
          <span
            className="flex-1 min-w-0 truncate font-semibold"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 15,
              color: "var(--text-primary)",
            }}
          >
            OpenCodeWriter
          </span>
        )}
        <button
          onClick={toggleNavigation}
          className={cn(
            "flex items-center justify-center rounded-md transition-colors shrink-0",
            collapsed && "absolute mt-12"
          )}
          style={{
            width: 28, height: 28,
            color: "var(--text-muted)",
          }}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {collapsed ? (
            <PanelLeftOpen style={{ width: 16, height: 16 }} />
          ) : (
            <PanelLeftClose style={{ width: 16, height: 16 }} />
          )}
        </button>
      </div>

      {/* Current Project Card */}
      {currentProject && !collapsed && (
        <button
          onClick={onSwitchProject}
          className="flex flex-col gap-1.5 border-b shrink-0 text-left transition-colors"
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          title="切换项目"
        >
          <div className="flex items-center gap-2">
            <FolderOpen style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
            <span
              className="min-w-0 truncate font-medium"
              style={{ fontSize: 13, color: "var(--text-primary)" }}
            >
              {currentProject.name}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            点击切换项目
          </span>
        </button>
      )}

      {currentProject && collapsed && (
        <button
          onClick={onSwitchProject}
          className="flex items-center justify-center shrink-0 border-b transition-colors"
          style={{
            height: 48,
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          title={currentProject.name}
        >
          <FolderOpen style={{ width: 18, height: 18 }} />
        </button>
      )}

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto app-scrollbar" style={{ padding: collapsed ? "8px 0" : "8px 10px" }}>
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group.id);
          if (items.length === 0) return null;
          return (
            <NavGroupSection
              key={group.id}
              group={group}
              items={items}
              collapsed={collapsed}
              currentSection={currentSection}
              onNavigate={onNavigate}
              navBadges={navBadges}
              navLoading={navLoading}
            />
          );
        })}
      </div>

      {/* Footer: Model & Connection Status */}
      <div
        className="flex items-center border-t shrink-0 gap-2"
        style={{
          height: 54,
          padding: collapsed ? "0" : "0 16px",
          borderColor: "var(--border)",
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {!collapsed && (
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Cpu style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
              <span
                className="min-w-0 truncate"
                style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}
              >
                {modelPresetName ?? "未配置模型"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Dot
                style={{
                  width: 8, height: 8,
                  color: connected ? "var(--success)" : "var(--danger)",
                  fill: connected ? "var(--success)" : "var(--danger)",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {connected ? "已连接" : "未连接"}
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <Dot
            style={{
              width: 8, height: 8,
              color: connected ? "var(--success)" : "var(--danger)",
              fill: connected ? "var(--success)" : "var(--danger)",
            }}
          />
        )}
      </div>
    </nav>
  );
}

function NavGroupSection({
  group,
  items,
  collapsed,
  currentSection,
  onNavigate,
  navBadges,
  navLoading,
}: {
  group: { id: NavGroup; label: string };
  items: NavItemDescriptor[];
  collapsed: boolean;
  currentSection: WorkspaceRoute | null;
  onNavigate: (route: WorkspaceRoute) => void;
  navBadges?: Partial<Record<WorkspaceRoute, number>>;
  navLoading?: Partial<Record<WorkspaceRoute, boolean>>;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 2, marginBottom: 16 }}>
      {!collapsed && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            padding: "4px 12px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {group.label}
        </div>
      )}
      {items.map((item) => {
        const active = currentSection === item.route;
        const badge = navBadges?.[item.route];
        const loading = navLoading?.[item.route];
        return (
          <NavButton
            key={item.route}
            item={item}
            active={active}
            collapsed={collapsed}
            badge={badge}
            loading={loading}
            onClick={() => onNavigate(item.route)}
          />
        );
      })}
    </div>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  badge,
  loading,
  onClick,
}: {
  item: NavItemDescriptor;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  loading?: boolean;
  onClick: () => void;
}) {
  const Icon = getIcon(item.icon);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center rounded-md transition-colors w-full text-left relative",
        collapsed ? "justify-center" : "gap-3"
      )}
      style={{
        height: 36,
        padding: collapsed ? "0" : "0 12px",
        backgroundColor: active ? "var(--surface-selected)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontWeight: active ? 500 : 400,
        fontSize: 13,
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
      }}
      title={item.label}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <Icon
        style={{
          width: 18, height: 18,
          color: active ? "var(--accent)" : "var(--text-muted)",
          flexShrink: 0,
        }}
      />
      {!collapsed && (
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
      )}
      {!collapsed && badge != null && badge > 0 && (
        <span
          className="rounded-full px-1.5 flex items-center justify-center shrink-0"
          style={{
            fontSize: 11,
            minWidth: 18,
            height: 18,
            backgroundColor: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {badge}
        </span>
      )}
      {loading && (
        <span
          className="shrink-0"
          style={{
            width: 6, height: 6, borderRadius: "50%",
            backgroundColor: "var(--accent)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      )}
      {collapsed && badge != null && badge > 0 && (
        <span
          className="absolute rounded-full"
          style={{
            top: 4, right: 4,
            width: 8, height: 8,
            backgroundColor: "var(--accent)",
          }}
        />
      )}
    </button>
  );
}

/** Dynamic icon loader — maps string names to lucide icons */
import {
  ClipboardList, FileText, Users, Globe, ListTree, Pen,
  Bookmark, Library, Sparkles, Activity, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "clipboard-list": ClipboardList,
  "file-text": FileText,
  "users": Users,
  "globe": Globe,
  "list-tree": ListTree,
  "pen": Pen,
  "bookmark": Bookmark,
  "library": Library,
  "sparkles": Sparkles,
  "activity": Activity,
  "settings": Settings,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? FileText;
}
