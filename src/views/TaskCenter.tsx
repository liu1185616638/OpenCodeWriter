/**
 * TaskCenter — unified AI generations, batch jobs and snapshots.
 */

import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Ban,
} from "lucide-react";
import { listTaskCenterItems } from "@/lib/tauri";
import type { Project, TaskCenterItem } from "@/types";
import { toast } from "sonner";

type FilterKey = "all" | "running" | "failed" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "运行中" },
  { key: "failed", label: "失败/取消" },
  { key: "completed", label: "完成" },
];

function isRunningStatus(status: string): boolean {
  return status === "running" || status === "started" || status === "pending";
}

export function TaskCenter({ project }: { project: Project }) {
  const [items, setItems] = useState<TaskCenterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadItems = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const result = await listTaskCenterItems(project.id, filter, 100);
      setItems(result);
      setSelectedId((current) => {
        if (!current) return current;
        return result.some((item) => `${item.item_type}-${item.id}` === current)
          ? current
          : null;
      });
    } catch (cause) {
      console.error("Failed to load task center:", cause);
      if (showLoading) setItems([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [filter, project.id]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Keep real progress and terminal states current while a task is running.
  useEffect(() => {
    if (!items.some((item) => isRunningStatus(item.status))) return;
    const timer = window.setInterval(() => {
      void loadItems(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [items, loadItems]);

  const selectedItem = items.find((item) => `${item.item_type}-${item.id}` === selectedId);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{ width: 480, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div
          className="flex items-center gap-2 shrink-0"
          style={{ height: 40, padding: "0 12px", borderBottom: "1px solid var(--border)" }}
        >
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setFilter(entry.key)}
              style={{
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: "var(--radius-sm)",
                color: filter === entry.key ? "var(--accent)" : "var(--text-muted)",
                backgroundColor: filter === entry.key ? "var(--accent-soft)" : "transparent",
              }}
            >
              {entry.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => void loadItems()}
            disabled={loading}
            title="刷新"
            style={{ padding: 4, color: "var(--text-muted)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto app-scrollbar">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center" style={{ height: 80, color: "var(--text-muted)" }}>
              <Loader2 className="animate-spin h-4 w-4" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2" style={{ height: 80, color: "var(--text-muted)" }}>
              <CheckCircle2 style={{ width: 20, height: 20 }} />
              <span style={{ fontSize: 12 }}>暂无任务记录</span>
            </div>
          ) : (
            items.map((item) => (
              <TaskListRow
                key={`${item.item_type}-${item.id}`}
                item={item}
                isSelected={`${item.item_type}-${item.id}` === selectedId}
                onClick={() => setSelectedId(`${item.item_type}-${item.id}`)}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
        {selectedItem ? (
          <TaskDetail item={selectedItem} onChanged={() => void loadItems(false)} />
        ) : (
          <div className="flex items-center justify-center flex-1" style={{ color: "var(--text-muted)" }}>
            <div className="flex flex-col items-center gap-2">
              <Clock style={{ width: 32, height: 32 }} />
              <span style={{ fontSize: 13 }}>选择左侧任务查看详情</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskListRow({
  item,
  isSelected,
  onClick,
}: {
  item: TaskCenterItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { icon, color } = getStatusVisual(item.status);
  const typeLabel = item.item_type === "generation"
    ? "AI 生成"
    : item.item_type === "job"
      ? "批量任务"
      : "快照";

  const progressPercent = item.progress_total > 0
    ? Math.min(100, (item.progress_current / item.progress_total) * 100)
    : 0;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer transition-colors"
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        backgroundColor: isSelected ? "var(--surface-selected)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {typeLabel}
        </span>
        {item.task_type && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>· {item.task_type}</span>
        )}
        <div className="flex-1" />
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-data)" }}>
          {item.created_at.substring(11, 19)}
        </span>
      </div>

      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {item.target_type || item.task_type || typeLabel}
          {item.target_id ? ` #${item.target_id}` : ""}
        </span>
        {item.model_name && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.model_name}</span>
        )}
      </div>

      {item.error && (
        <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {item.error}
        </p>
      )}

      {item.progress_total > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 3, backgroundColor: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                backgroundColor: item.status === "cancelled" ? "var(--danger)" : "var(--accent)",
                transition: "width 0.3s",
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {item.progress_current} / {item.progress_total}
          </span>
        </div>
      )}
    </div>
  );
}

function TaskDetail({ item, onChanged }: { item: TaskCenterItem; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const { icon, color } = getStatusVisual(item.status);
  const typeLabel = item.item_type === "generation"
    ? "AI 生成日志"
    : item.item_type === "job"
      ? "批量任务"
      : "快照记录";

  const canCancel = isRunningStatus(item.status)
    && ((item.item_type === "job") || (item.item_type === "generation" && Boolean(item.session_id)));

  const handleCancel = async () => {
    if (!canCancel || cancelling) return;
    setCancelling(true);
    try {
      if (item.item_type === "job") {
        await invoke("cancel_job", { id: item.id });
      } else {
        await invoke("cancel_ai_session", { sessionId: item.session_id });
      }
      toast.success("取消请求已提交");
      onChanged();
    } catch (cause) {
      toast.error("取消任务失败", { description: String(cause) });
    } finally {
      setCancelling(false);
    }
  };

  const fields = [
    { label: "类型", value: typeLabel },
    { label: "任务类型", value: item.task_type || "—" },
    { label: "目标", value: `${item.target_type || "—"}${item.target_id ? ` #${item.target_id}` : ""}` },
    { label: "状态", value: item.status },
    { label: "进度", value: item.progress_total > 0 ? `${item.progress_current} / ${item.progress_total}` : "—" },
    { label: "模型", value: item.model_name || "—" },
    { label: "输入字数", value: item.input_chars.toLocaleString() },
    { label: "输出字数", value: item.output_chars.toLocaleString() },
    { label: "Session ID", value: item.session_id || "—" },
    { label: "创建时间", value: item.created_at },
    { label: "结束时间", value: item.ended_at || "—" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {typeLabel} #{item.id}
        </span>
        <div className="flex-1" />
        {canCancel && (
          <button
            onClick={() => void handleCancel()}
            disabled={cancelling}
            className="flex items-center gap-1 rounded-md transition-colors"
            style={{
              height: 28,
              padding: "0 10px",
              fontSize: 12,
              color: "var(--danger)",
              border: "1px solid var(--danger)",
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            {cancelling ? "取消中" : "取消任务"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto app-scrollbar" style={{ padding: 16, maxWidth: 640 }}>
        <div className="flex flex-col" style={{ gap: 14 }}>
          {fields.map((field) => (
            <div key={field.label}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                {field.label}
              </label>
              <p style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginTop: 4,
                fontFamily: field.label.includes("ID") || field.label.includes("时间") ? "var(--font-data)" : "inherit",
                wordBreak: "break-all",
              }}>
                {field.value}
              </p>
            </div>
          ))}

          {item.error && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", textTransform: "uppercase" }}>
                错误信息
              </label>
              <p style={{ fontSize: 13, color: "var(--danger)", marginTop: 4, whiteSpace: "pre-wrap" }}>
                {item.error}
              </p>
            </div>
          )}

          {item.item_type === "snapshot" && (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              快照已纳入任务时间线；内容预览与恢复操作将在统一草稿/快照应用层中继续补充。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusVisual(status: string): { icon: React.ReactNode; color: string } {
  const size = { width: 14, height: 14 };
  if (isRunningStatus(status)) {
    return { icon: <Loader2 {...size} className="animate-spin" />, color: "var(--accent)" };
  }
  if (status === "failed" || status === "timeout" || status === "cancelled") {
    return { icon: <XCircle {...size} />, color: "var(--danger)" };
  }
  if (status === "completed" || status === "success") {
    return { icon: <CheckCircle2 {...size} />, color: "var(--success)" };
  }
  return { icon: <AlertTriangle {...size} />, color: "var(--warning)" };
}
