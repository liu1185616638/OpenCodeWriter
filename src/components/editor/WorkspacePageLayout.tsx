/**
 * WorkspacePageLayout — Carbon Frost 工作区页面布局容器
 *
 * 兼容旧 API（title/description/status/alerts/children/error/actionBar），
 * 样式从旧的 shadcn/rounded-2xl 改为 Carbon Frost 的 surface/border/radius 语义。
 *
 * 后续页面迁移到 features/ 目录后将逐步废弃此组件，由各页面自行管理布局。
 */

import { cn } from "@/lib/cn";

interface WorkspacePageLayoutProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
  alerts?: React.ReactNode;
  children: React.ReactNode;
  error?: React.ReactNode;
  actionBar?: React.ReactNode;
  className?: string;
  /** Hide the title section (use when AppShell TopTaskbar already shows the title) */
  hideTitle?: boolean;
}

export function WorkspacePageLayout({
  title,
  description,
  status,
  alerts,
  children,
  error,
  actionBar,
  className,
  hideTitle = false,
}: WorkspacePageLayoutProps) {
  return (
    <div
      className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", className)}
      style={{ backgroundColor: "var(--canvas)" }}
    >
      {/* Title section */}
      {!hideTitle && (title || description || status) && (
        <div
          className="flex shrink-0 items-center justify-between gap-3"
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div className="min-w-0">
            {title && (
              <h2
                className="truncate"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                className="mt-0.5 truncate"
                style={{ fontSize: 12, color: "var(--text-muted)" }}
              >
                {description}
              </p>
            )}
          </div>
          {status && <div className="shrink-0">{status}</div>}
        </div>
      )}

      {/* Alerts */}
      {alerts && <div className="shrink-0">{alerts}</div>}

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {/* Error */}
      {error && (
        <div
          className="shrink-0"
          style={{
            padding: "8px 18px",
            fontSize: 13,
            color: "var(--danger)",
            backgroundColor: "var(--danger-soft)",
          }}
        >
          {error}
        </div>
      )}

      {/* Action bar */}
      {actionBar && (
        <div
          className="shrink-0"
          style={{
            borderTop: "1px solid var(--border)",
            padding: "10px 18px",
            backgroundColor: "var(--surface)",
          }}
        >
          {actionBar}
        </div>
      )}
    </div>
  );
}
