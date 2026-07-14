/**
 * TaskDrawer — 底部任务抽屉 (Phase F)
 *
 * 折叠时为 32px 状态条；展开时显示 AI 事件时间线和任务中心项。
 * 支持取消运行中任务、查看历史任务状态。
 * 匹配 Pencil 设计中的 Task Drawer / Running。
 */

import { type ReactNode, useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown, ChevronUp, Loader2,
  CheckCircle2, XCircle, AlertTriangle,
  Brain, FileText, Wrench, Sparkles,
  Plug, Ban, Clock, GripHorizontal,
} from "lucide-react";
import { useWorkbench } from "@/app/WorkbenchContext";
import { useAI } from "@/contexts/AIContext";
import { listTaskCenterItems } from "@/lib/tauri";
import type { AiTimelineEvent, TaskCenterItem } from "@/types";

type DrawerTab = "timeline" | "history";

export function TaskDrawer({ projectId }: { projectId?: number }) {
  const { taskDrawerOpen, toggleTaskDrawer, taskDrawerHeight, setTaskDrawerHeight } = useWorkbench();
  const { generatingStage, generating: isGenerating, timelineEvents, cancel, generationStatus, error } = useAI();
  const [activeTab, setActiveTab] = useState<DrawerTab>("timeline");
  const [historyItems, setHistoryItems] = useState<TaskCenterItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  const hasRunning = isGenerating || !!generatingStage;
  const collapsedHeight = 32;

  // Drag-to-resize handlers
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const draggingRef = useRef(false);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = taskDrawerHeight;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }, [taskDrawerHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = dragStartY.current - e.clientY;
      setTaskDrawerHeight(dragStartHeight.current + delta);
    };
    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setTaskDrawerHeight]);

  // Load task center history items
  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const items = await listTaskCenterItems(projectId, historyFilter, 30);
      setHistoryItems(items);
    } catch {
      // Ignore — history is best-effort
    }
  }, [projectId, historyFilter]);

  useEffect(() => {
    if (taskDrawerOpen && activeTab === "history") {
      loadHistory();
    }
  }, [taskDrawerOpen, activeTab, loadHistory]);

  // Auto-switch to timeline when generation starts
  useEffect(() => {
    if (isGenerating) {
      setActiveTab("timeline");
    }
  }, [isGenerating]);

  if (!taskDrawerOpen) {
    // Collapsed: just a status strip
    return (
      <div
        className="flex items-center justify-between shrink-0 border-t cursor-pointer select-none"
        style={{
          height: collapsedHeight,
          backgroundColor: "var(--surface-raised)",
          borderColor: "var(--border-strong)",
        }}
        onClick={toggleTaskDrawer}
      >
        <div className="flex items-center gap-2" style={{ padding: "0 14px" }}>
          {hasRunning ? (
            <Loader2
              className="animate-spin"
              style={{ width: 12, height: 12, color: "var(--accent)" }}
            />
          ) : generationStatus === "failed" ? (
            <XCircle style={{ width: 12, height: 12, color: "var(--danger)" }} />
          ) : (
            <CheckCircle2 style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
          )}
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {hasRunning
              ? `正在生成${generatingStage ? `：${generatingStage}` : ""}`
              : generationStatus === "failed"
                ? `生成失败${error ? `：${error.substring(0, 40)}` : ""}`
                : "无运行中任务"}
          </span>
          {timelineEvents.length > 0 && !hasRunning && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              · {timelineEvents.length} 个事件
            </span>
          )}
        </div>
        <div className="flex items-center" style={{ padding: "0 14px" }}>
          <ChevronUp style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
        </div>
      </div>
    );
  }

  // Expanded
  return (
    <div
      className="flex flex-col shrink-0 border-t"
      style={{
        height: taskDrawerHeight,
        backgroundColor: "var(--surface-raised)",
        borderColor: "var(--border-strong)",
      }}
    >
      {/* Drag handle for resizing */}
      <div
        className="flex items-center justify-center shrink-0 cursor-ns-resize select-none"
        style={{ height: 4, backgroundColor: "var(--surface-raised)" }}
        onMouseDown={handleDragStart}
      >
        <GripHorizontal style={{ width: 14, height: 4, color: "var(--text-muted)" }} />
      </div>
      {/* Header with tabs */}
      <div
        className="flex items-center justify-between shrink-0 border-b"
        style={{
          height: 32,
          padding: "0 14px",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Tab buttons */}
          <button
            onClick={() => setActiveTab("timeline")}
            style={{
              fontSize: 12,
              fontWeight: activeTab === "timeline" ? 600 : 400,
              color: activeTab === "timeline" ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: activeTab === "timeline" ? "2px solid var(--accent)" : "2px solid transparent",
              paddingBottom: 6,
            }}
          >
            时间线
          </button>
          {projectId && (
            <button
              onClick={() => setActiveTab("history")}
              style={{
                fontSize: 12,
                fontWeight: activeTab === "history" ? 600 : 400,
                color: activeTab === "history" ? "var(--text-primary)" : "var(--text-muted)",
                borderBottom: activeTab === "history" ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: 6,
              }}
            >
              历史
            </button>
          )}

          {hasRunning && (
            <span
              className="flex items-center gap-1 rounded-md"
              style={{
                fontSize: 11,
                padding: "2px 6px",
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <Loader2 className="animate-spin" style={{ width: 10, height: 10 }} />
              运行中
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasRunning && (
            <button
              onClick={cancel}
              className="flex items-center gap-1 rounded-md transition-colors"
              style={{
                fontSize: 11,
                padding: "3px 8px",
                color: "var(--danger)",
                backgroundColor: "transparent",
              }}
              title="取消当前任务"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Ban style={{ width: 12, height: 12 }} />
              取消
            </button>
          )}
          <button
            onClick={toggleTaskDrawer}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{ width: 24, height: 24, color: "var(--text-muted)" }}
            title="折叠抽屉"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <ChevronDown style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto app-scrollbar"
        style={{ padding: "8px 14px" }}
      >
        {activeTab === "timeline" ? (
          <TimelineView events={timelineEvents} hasRunning={hasRunning} />
        ) : (
          <HistoryView items={historyItems} filter={historyFilter} onFilterChange={setHistoryFilter} onRefresh={loadHistory} />
        )}
      </div>
    </div>
  );
}

// ── Timeline View ──────────────────────────────────────────────

function TimelineView({ events, hasRunning }: { events: AiTimelineEvent[]; hasRunning: boolean }) {
  if (events.length === 0 && !hasRunning) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: "var(--text-muted)" }}
      >
        <CheckCircle2 style={{ width: 24, height: 24 }} />
        <span style={{ fontSize: 12 }}>暂无运行中任务</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {events.map((event) => (
        <TimelineRow key={event.id} event={event} />
      ))}
      {hasRunning && (
        <TimelineRow
          event={{
            id: -1,
            event_type: "content",
            label: "等待中...",
            timestamp: Date.now(),
          }}
          spinning
        />
      )}
    </div>
  );
}

function TimelineRow({ event, spinning }: { event: AiTimelineEvent; spinning?: boolean }) {
  const { icon, color } = getEventVisual(event.event_type);

  return (
    <div className="flex items-start gap-2" style={{ fontSize: 12, minHeight: 22 }}>
      <span style={{ color, display: "flex", marginTop: 1, flexShrink: 0 }}>
        {spinning ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : icon}
      </span>
      <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
        <span style={{ color: "var(--text-secondary)" }}>{event.label}</span>
        {event.detail && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: 60,
              overflow: "hidden",
            }}
          >
            {event.detail}
          </span>
        )}
      </div>
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, fontFamily: "var(--font-data)" }}>
        {formatTime(event.timestamp)}
      </span>
    </div>
  );
}

function getEventVisual(eventType: AiTimelineEvent["event_type"]): { icon: ReactNode; color: string } {
  const size = { width: 12, height: 12 };
  switch (eventType) {
    case "thinking":
      return { icon: <Brain {...size} />, color: "var(--info)" };
    case "content":
      return { icon: <FileText {...size} />, color: "var(--accent)" };
    case "tool_call":
    case "tool_result":
      return { icon: <Wrench {...size} />, color: "var(--text-secondary)" };
    case "skill_start":
    case "skill_result":
      return { icon: <Sparkles {...size} />, color: "var(--info)" };
    case "mcp_call":
    case "mcp_result":
      return { icon: <Plug {...size} />, color: "var(--warning)" };
    case "error":
      return { icon: <XCircle {...size} />, color: "var(--danger)" };
    case "done":
      return { icon: <CheckCircle2 {...size} />, color: "var(--success)" };
    default:
      return { icon: <Clock {...size} />, color: "var(--text-muted)" };
  }
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ── History View ───────────────────────────────────────────────

function HistoryView({
  items,
  filter,
  onFilterChange,
  onRefresh,
}: {
  items: TaskCenterItem[];
  filter: string;
  onFilterChange: (f: string) => void;
  onRefresh: () => void;
}) {
  const filters = [
    { key: "all", label: "全部" },
    { key: "running", label: "运行中" },
    { key: "failed", label: "失败" },
    { key: "completed", label: "完成" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Filter bar */}
      <div className="flex items-center gap-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              color: filter === f.key ? "var(--accent)" : "var(--text-muted)",
              backgroundColor: filter === f.key ? "var(--accent-soft)" : "transparent",
            }}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onRefresh}
          style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 6px" }}
          title="刷新"
        >
          刷新
        </button>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2"
          style={{ height: 100, color: "var(--text-muted)" }}
        >
          <span style={{ fontSize: 12 }}>暂无任务记录</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map(item => (
            <HistoryRow key={`${item.item_type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: TaskCenterItem }) {
  const { icon, color } = getHistoryVisual(item);

  return (
    <div
      className="flex items-center gap-2"
      style={{
        fontSize: 12,
        padding: "4px 6px",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <span style={{ color, display: "flex", flexShrink: 0 }}>{icon}</span>
      <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
        <span style={{ color: "var(--text-secondary)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {item.task_type || item.item_type}
          {item.target_type && ` → ${item.target_type}`}
          {item.target_id && `#${item.target_id}`}
        </span>
        {item.error && (
          <span style={{ fontSize: 11, color: "var(--danger)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {item.error}
          </span>
        )}
      </div>
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, fontFamily: "var(--font-data)" }}>
        {item.model_name || ""}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
        {item.created_at.substring(11, 19)}
      </span>
    </div>
  );
}

function getHistoryVisual(item: TaskCenterItem): { icon: ReactNode; color: string } {
  const size = { width: 12, height: 12 };
  if (item.status === "running" || item.status === "started" || item.status === "pending") {
    return { icon: <Loader2 {...size} className="animate-spin" />, color: "var(--accent)" };
  }
  if (item.status === "failed" || item.status === "timeout" || item.status === "cancelled") {
    return { icon: <XCircle {...size} />, color: "var(--danger)" };
  }
  if (item.status === "completed" || item.status === "success") {
    return { icon: <CheckCircle2 {...size} />, color: "var(--success)" };
  }
  return { icon: <AlertTriangle {...size} />, color: "var(--warning)" };
}
