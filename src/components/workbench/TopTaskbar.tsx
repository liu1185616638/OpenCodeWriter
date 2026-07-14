/**
 * TopTaskbar — 顶部任务栏
 *
 * 高度 56px。左侧显示页面标题、当前对象和保存状态；
 * 右侧显示模型选择、上下文入口和当前主操作。
 * 匹配 Pencil 设计中的 Top Task Bar。
 */

import { type ReactNode } from "react";
import { PanelLeftOpen, ChevronLeft, Command } from "lucide-react";
import { useWorkbench } from "@/app/WorkbenchContext";

interface TopTaskbarProps {
  title: string;
  subtitle?: string;
  saveStatus?: "saved" | "saving" | "error" | null;
  /** Right-side actions (model select, primary action, etc.) */
  actions?: ReactNode;
  /** Left-side breadcrumb / back button */
  onBack?: () => void;
  canGoBack?: boolean;
}

export function TopTaskbar({
  title,
  subtitle,
  saveStatus,
  actions,
  onBack,
  canGoBack,
}: TopTaskbarProps) {
  const { navigationCollapsed, toggleNavigation, focusMode, toggleFocusMode } = useWorkbench();

  return (
    <div
      className="flex items-center justify-between shrink-0 border-b"
      style={{
        height: 56,
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Left: nav toggle + title + save status */}
      <div className="flex items-center gap-2 min-w-0" style={{ padding: "0 18px" }}>
        {navigationCollapsed && !focusMode && (
          <button
            onClick={toggleNavigation}
            className="flex items-center justify-center rounded-md transition-colors shrink-0"
            style={{ width: 28, height: 28, color: "var(--text-muted)" }}
            aria-label="展开侧栏"
            title="展开侧栏"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <PanelLeftOpen style={{ width: 16, height: 16 }} />
          </button>
        )}
        {canGoBack && onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center rounded-md transition-colors shrink-0"
            style={{ width: 28, height: 28, color: "var(--text-muted)" }}
            aria-label="返回"
            title="返回"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <ChevronLeft style={{ width: 18, height: 18 }} />
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="min-w-0 truncate"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {title}
            </h2>
            {saveStatus && (
              <span
                className="shrink-0"
                style={{
                  fontSize: 11,
                  color: saveStatus === "saved" ? "var(--success)" :
                         saveStatus === "saving" ? "var(--text-muted)" :
                         "var(--danger)",
                }}
              >
                {saveStatus === "saved" ? "已保存" :
                 saveStatus === "saving" ? "保存中…" :
                 "保存失败"}
              </span>
            )}
          </div>
          {subtitle && (
            <span
              className="min-w-0 truncate"
              style={{ fontSize: 12, color: "var(--text-muted)" }}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0" style={{ padding: "0 18px" }}>
        {actions}
        {/* Command palette trigger */}
        <button
          className="flex items-center gap-1.5 rounded-md border transition-colors"
          style={{
            height: 30,
            padding: "0 8px",
            fontSize: 12,
            color: "var(--text-muted)",
            borderColor: "var(--border)",
            backgroundColor: "var(--surface)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          title="命令面板 (Ctrl+K)"
        >
          <Command style={{ width: 12, height: 12 }} />
          <span style={{ fontSize: 11 }}>⌘K</span>
        </button>
        {/* Focus mode toggle */}
        <button
          onClick={toggleFocusMode}
          className="flex items-center justify-center rounded-md transition-colors"
          style={{
            width: 30, height: 30,
            color: focusMode ? "var(--accent)" : "var(--text-muted)",
          }}
          aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
          title={focusMode ? "退出专注模式" : "进入专注模式"}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {focusMode ? (
            <span style={{ fontSize: 11, fontWeight: 600 }}>退出</span>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 500 }}>专注</span>
          )}
        </button>
      </div>
    </div>
  );
}
