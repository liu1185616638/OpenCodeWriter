/**
 * ProjectList — Carbon Frost 项目库
 *
 * 从旧的居中 600px 大卡片改为全宽生产力列表。
 * 每行显示：项目名称、题材、创作进度、完成章节/总章节、总字数、最近编辑、过时数量和失败任务。
 * 继续创作进入真正的最近编辑项目（updated_at DESC 第一条）。
 * 删除按钮始终可被键盘访问，不只依赖 hover。
 * 搜索、排序、空状态和新建入口独立。
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listProjectSummaries,
  createProject,
  deleteProject,
  touchProjectOpened,
} from "@/lib/tauri";
import type { ProjectSummary, Project } from "@/types";
import {
  Search, Plus, Sparkles, ArrowRight, Trash2,
  BookOpen, AlertTriangle, FileText, Users, BookMarked, Pen,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
type SortKey = "updated" | "created" | "name" | "words";
type SortDir = "asc" | "desc";

const STAGE_LABELS: Record<string, string> = {
  outline: "大纲",
  characters: "人物",
  chapters: "目录",
  content: "正文",
  world: "世界观",
  knowledge: "知识库",
  framing: "定盘",
};

const STAGE_ICONS: Record<string, typeof FileText> = {
  outline: FileText,
  characters: Users,
  chapters: BookMarked,
  content: Pen,
  world: BookOpen,
  knowledge: BookOpen,
  framing: FileText,
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN");
}

function formatWordCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万字`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千字`;
  return `${n}字`;
}

export function ProjectList({
  onSelectProject,
  onStartIdeaWizard,
}: {
  onSelectProject: (project: Project) => void;
  onStartIdeaWizard: (idea: string) => void;
}) {
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [ideaText, setIdeaText] = useState("");

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listProjectSummaries();
      setSummaries(list);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = summaries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "updated":
          cmp = a.updated_at.localeCompare(b.updated_at);
          break;
        case "created":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name, "zh-CN");
          break;
        case "words":
          cmp = a.total_word_count - b.total_word_count;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [summaries, search, sortKey, sortDir]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(newName.trim());
      setNewName("");
      await refresh();
      onSelectProject(project);
    } catch (e) {
      console.error("Failed to create project:", e);
    } finally {
      setCreating(false);
    }
  };

  const handleContinue = async (summary: ProjectSummary) => {
    // Touch project to update its opened time
    await touchProjectOpened(summary.id).catch(() => {});
    // Construct a Project object from the summary
    const project: Project = {
      id: summary.id,
      name: summary.name,
      current_stage: summary.current_stage,
      created_at: summary.created_at,
      updated_at: summary.updated_at,
    };
    onSelectProject(project);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      setSummaries((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ color: "var(--text-muted)" }}
      >
        <Loader2 className="animate-spin" style={{ width: 20, height: 20 }} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Recent Projects Panel (380px) */}
      <div
        className="flex flex-col shrink-0 border-r"
        style={{
          width: 380,
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-col gap-1 shrink-0 border-b"
          style={{
            padding: "16px 20px",
            borderColor: "var(--border)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            最近项目
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {summaries.length > 0
              ? `${summaries.length} 个项目`
              : "从一句想法开始你的创作"}
          </p>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 shrink-0"
          style={{ padding: "12px 16px" }}
        >
          <div
            className="flex items-center gap-2 flex-1 rounded-md border"
            style={{
              height: 32,
              padding: "0 10px",
              backgroundColor: "var(--canvas)",
              borderColor: "var(--border)",
            }}
          >
            <Search style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目名称或题材"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
          </div>
        </div>

        {/* Sort header */}
        <div
          className="flex items-center gap-2 shrink-0"
          style={{
            padding: "0 16px 6px",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <SortButton
            label="编辑时间"
            active={sortKey === "updated"}
            dir={sortDir}
            onClick={() => toggleSort("updated")}
          />
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <SortButton
            label="字数"
            active={sortKey === "words"}
            dir={sortDir}
            onClick={() => toggleSort("words")}
          />
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <SortButton
            label="名称"
            active={sortKey === "name"}
            dir={sortDir}
            onClick={() => toggleSort("name")}
          />
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto app-scrollbar">
          {filtered.length > 0 ? (
            filtered.map((summary, idx) => (
              <ProjectRow
                key={summary.id}
                summary={summary}
                isFirst={idx === 0}
                onSelect={() => handleContinue(summary)}
                onDelete={() => setDeleteTarget(summary)}
              />
            ))
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-3"
              style={{ height: "100%", padding: 40, color: "var(--text-muted)" }}
            >
              <BookOpen style={{ width: 32, height: 32 }} />
              <p style={{ fontSize: 13 }}>
                {search.trim()
                  ? `没有找到匹配 "${search}" 的项目`
                  : "还没有项目，点击右侧创建第一本书"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right: New Book Workspace */}
      <div
        className="flex flex-col flex-1 items-center overflow-y-auto app-scrollbar"
        style={{
          backgroundColor: "#10161E",
          padding: "48px 0 24px",
        }}
      >
        <div style={{ width: 760 }}>
          {/* Hero */}
          <div className="flex flex-col gap-3" style={{ marginBottom: 30 }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 28,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              开始你的故事
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              从一句灵感出发，AI 帮你构建故事方向、人物和大纲。
              <br />
              也可以直接创建空白项目，自己掌控每一步。
            </p>
          </div>

          {/* Story Idea Composer */}
          <div
            className="flex flex-col gap-3 rounded-lg border"
            style={{
              padding: 16,
              backgroundColor: "var(--surface)",
              borderColor: "var(--border-strong)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.33)",
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles style={{ width: 16, height: 16, color: "var(--accent)" }} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                一句话开书
              </span>
            </div>
            <textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="输入你的故事灵感，例如：一个失忆的法医在每具尸体上发现属于自己的线索…"
              style={{
                width: "100%",
                minHeight: 72,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 14,
                lineHeight: 1.6,
                resize: "none",
                fontFamily: "var(--font-ui)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ideaText.trim()) {
                  onStartIdeaWizard(ideaText.trim());
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                AI 将生成 3 个故事方向供你选择
              </span>
              <button
                onClick={() => ideaText.trim() && onStartIdeaWizard(ideaText.trim())}
                disabled={!ideaText.trim()}
                className="flex items-center gap-2 rounded-md transition-colors disabled:opacity-50"
                style={{
                  height: 32,
                  padding: "0 14px",
                  backgroundColor: "var(--accent)",
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: ideaText.trim() ? "pointer" : "not-allowed",
                }}
              >
                <Sparkles style={{ width: 14, height: 14 }} />
                生成方向
              </button>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              backgroundColor: "var(--border)",
              margin: "22px 0",
            }}
          />

          {/* Manual Project Option */}
          <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
            <div className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                直接创建空白项目
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                从零开始，自己掌控每一步
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="项目名称"
                style={{
                  width: 200,
                  height: 32,
                  padding: "0 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex items-center gap-2 rounded-md transition-colors disabled:opacity-50"
                style={{
                  height: 32,
                  padding: "0 14px",
                  backgroundColor: "var(--surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-strong)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                <Plus style={{ width: 14, height: 14 }} />
                创建
              </button>
            </div>
          </div>

          {/* Readiness checklist for first run */}
          {summaries.length === 0 && (
            <div
              className="flex flex-col gap-3"
              style={{
                paddingTop: 18,
                borderTop: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                新手指南
              </span>
              {[
                "配置 AI 模型（已完成）",
                "创建第一个项目或使用一句话开书",
                "编写或生成大纲",
                "创建人物和章节规划",
                "开始正文创作",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      backgroundColor: i === 0 ? "var(--success)" : "var(--surface-raised)",
                      color: i === 0 ? "#FFFFFF" : "var(--text-muted)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: i === 0 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: "8px 12px",
                borderRadius: 6,
                backgroundColor: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <DeleteDialog
          target={deleteTarget}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function ProjectRow({
  summary,
  isFirst,
  onSelect,
  onDelete,
}: {
  summary: ProjectSummary;
  isFirst: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const StageIcon = STAGE_ICONS[summary.current_stage] ?? FileText;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="flex flex-col gap-2 cursor-pointer transition-colors"
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        borderLeft: isFirst ? "2px solid var(--accent)" : "2px solid transparent",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--surface-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {/* Row 1: Name + Stage + Continue hint */}
      <div className="flex items-center gap-2">
        <StageIcon style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
        <span
          className="min-w-0 truncate"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {summary.name}
        </span>
        {isFirst && (
          <span
            className="flex items-center gap-1 shrink-0"
            style={{
              fontSize: 11,
              color: "var(--accent)",
            }}
          >
            <ArrowRight style={{ width: 10, height: 10 }} />
            继续
          </span>
        )}
      </div>

      {/* Row 2: Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        {summary.genre && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {summary.genre}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {STAGE_LABELS[summary.current_stage] ?? summary.current_stage}
        </span>
        {summary.total_chapters > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {summary.completed_chapters}/{summary.total_chapters} 章
          </span>
        )}
        {summary.total_word_count > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatWordCount(summary.total_word_count)}
          </span>
        )}
        {summary.stale_count > 0 && (
          <span
            className="flex items-center gap-0.5"
            style={{ fontSize: 11, color: "var(--warning)" }}
          >
            <AlertTriangle style={{ width: 10, height: 10 }} />
            {summary.stale_count} 过时
          </span>
        )}
        {summary.failed_job_count > 0 && (
          <span style={{ fontSize: 11, color: "var(--danger)" }}>
            {summary.failed_job_count} 失败
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {formatDate(summary.updated_at)}
        </span>
        {/* Delete button — always visible, keyboard accessible */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center justify-center rounded-md transition-colors"
          style={{
            width: 24,
            height: 24,
            color: "var(--text-muted)",
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
          }}
          title="删除项目"
          aria-label={`删除项目 ${summary.name}`}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--danger)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-0.5 transition-colors"
      style={{
        color: active ? "var(--text-secondary)" : "var(--text-muted)",
        fontWeight: active ? 500 : 400,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontSize: 11,
      }}
    >
      {label}
      {active &&
        (dir === "asc" ? (
          <ChevronUp style={{ width: 10, height: 10 }} />
        ) : (
          <ChevronDown style={{ width: 10, height: 10 }} />
        ))}
    </button>
  );
}

function DeleteDialog({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: ProjectSummary;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 rounded-lg border"
        style={{
          width: 440,
          padding: 24,
          backgroundColor: "var(--surface-raised)",
          borderColor: "var(--border-strong)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 18,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          确认删除项目
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          确定要删除项目 "{target.name}" 吗？
        </p>
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            backgroundColor: "var(--danger-soft)",
            fontSize: 12,
            color: "var(--danger)",
          }}
        >
          所有关联数据将一并删除，包括大纲、人物、章节、正文、快照和生成记录。此操作不可撤销。
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md transition-colors"
            style={{
              height: 36,
              padding: "0 16px",
              backgroundColor: "var(--surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-strong)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-md transition-colors disabled:opacity-50"
            style={{
              height: 36,
              padding: "0 16px",
              backgroundColor: "var(--danger)",
              color: "#FFFFFF",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
