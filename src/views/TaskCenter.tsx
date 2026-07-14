/**
 * TaskCenter — 任务中心独立页面 (Phase G)
 *
 * 统一展示项目下所有任务：AI 生成日志、批量任务、快照记录。
 * 支持筛选（全部/运行中/失败/完成）、分页和详情查看。
 */

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  Clock, RefreshCw,
} from "lucide-react";
import { listTaskCenterItems } from "@/lib/tauri";
import type { Project, TaskCenterItem } from "@/types";

type FilterKey = "all" | "running" | "failed" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "运行中" },
  { key: "failed", label: "失败" },
  { key: "completed", label: "完成" },
];

export function TaskCenter({ project }: { project: Project }) {
  const [items, setItems] = useState<TaskCenterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTaskCenterItems(project.id, filter, 100);
      setItems(result);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [project.id, filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const selectedItem = items.find(i => `${i.item_type}-${i.id}` === selectedId);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Task List ── */}
      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{ width: 480, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
      >
        {/* Filter bar */}
        <div
          className="flex items-center gap-2 shrink-0"
          style={{ height: 40, padding: "0 12px", borderBottom: "1px solid var(--border)" }}
        >
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontSize: 12,
                padding: "3px 10px",
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
            onClick={loadItems}
            disabled={loading}
            title="刷新"
            style={{ padding: 4, color: "var(--text-muted)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto">
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
            items.map(item => (
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

      {/* ── Right: Detail ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
        {selectedItem ? (
          <TaskDetail item={selectedItem} />
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
  item, isSelected, onClick,
}: {
  item: TaskCenterItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { icon, color } = getStatusVisual(item.status);
  const typeLabel = item.item_type === "generation" ? "AI 生成" : item.item_type === "job" ? "批量任务" : "快照";

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
          {item.target_type}
          {item.target_id && ` #${item.target_id}`}
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
                width: `${(item.progress_current / item.progress_total) * 100}%`,
                backgroundColor: "var(--accent)",
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

function TaskDetail({ item }: { item: TaskCenterItem }) {
  const { icon, color } = getStatusVisual(item.status);
  const typeLabel = item.item_type === "generation" ? "AI 生成日志" : item.item_type === "job" ? "批量任务" : "快照记录";

  const fields = [
    { label: "类型", value: typeLabel },
    { label: "任务类型", value: item.task_type || "—" },
    { label: "目标", value: `${item.target_type}${item.target_id ? ` #${item.target_id}` : ""}` },
    { label: "状态", value: item.status },
    { label: "模型", value: item.model_name || "—" },
    { label: "输入字数", value: item.input_chars.toLocaleString() },
    { label: "输出字数", value: item.output_chars.toLocaleString() },
    { label: "Session ID", value: item.session_id || "—" },
    { label: "创建时间", value: item.created_at },
    { label: "结束时间", value: item.ended_at || "—" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {typeLabel} #{item.id}
        </span>
      </div>

      {/* Detail fields */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16, maxWidth: 640 }}>
        <div className="flex flex-col" style={{ gap: 14 }}>
          {fields.map((field, i) => (
            <div key={i}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                {field.label}
              </label>
              <p style={{
                fontSize: 13,
                color: field.label === "错误" ? "var(--danger)" : "var(--text-secondary)",
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
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", textTransform: "uppercase" }}>错误信息</label>
              <p style={{ fontSize: 13, color: "var(--danger)", marginTop: 4, whiteSpace: "pre-wrap" }}>
                {item.error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusVisual(status: string): { icon: React.ReactNode; color: string } {
  const size = { width: 14, height: 14 };
  if (status === "running" || status === "started" || status === "pending") {
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
