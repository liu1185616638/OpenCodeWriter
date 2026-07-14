/**
 * OutlineEditor — Carbon Frost 大纲工作台
 *
 * 主编辑区最大阅读宽度 760px。
 * AI 生成不清空当前大纲，流式结果进入草稿区。
 * 支持覆盖、追加和放弃草稿。
 * 右侧检查器显示项目设定摘要和上下文来源。
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useOutline } from "@/hooks/useOutline";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { getProjectProfile, getProjectProgress } from "@/lib/tauri";
import { stripThinking } from "@/components/shared/StreamingView";
import type { Project, ProjectProfile, ProjectProgress } from "@/types";
import {
  Sparkles, Square, Save, Check, X, ArrowRight,
  FileText, Loader2, AlertCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function OutlineEditor({ project }: { project: Project }) {
  const { outline, loading, saving, load, save } = useOutline(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel } = useAI();

  const [content, setContent] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGeneratingRef = useRef(false);

  // Load data
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (outline) setContent(outline.content);
  }, [outline]);

  // Load profile and progress for inspector
  useEffect(() => {
    async function loadContext() {
      try {
        const [p, prog] = await Promise.all([
          getProjectProfile(project.id),
          getProjectProgress(project.id),
        ]);
        setProfile(p);
        setProgress(prog);
      } catch { /* ignore */ }
    }
    loadContext();
  }, [project.id]);

  // AI generation: stream into draft area, NOT replacing current content
  useEffect(() => {
    if (generating && generatingStage === "outline") {
      setDraft(streamedContent);
    }
  }, [streamedContent, generating, generatingStage]);

  // When generation finishes, keep draft for user to apply/discard
  useEffect(() => {
    if (prevGeneratingRef.current && !generating) {
      if (streamedContent && generatingStage === "outline") {
        const cleaned = stripThinking(streamedContent);
        setDraft(cleaned);
        toast.success("大纲草稿已生成", {
          description: "请在草稿区查看并选择应用或放弃",
        });
      }
    }
    prevGeneratingRef.current = generating;
  }, [generating, streamedContent, generatingStage]);

  // Auto-save with debounce
  const doSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await save(content);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (e) {
      setSaveState("error");
      toast.error("保存失败", { description: String(e) });
    }
  }, [save, content]);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(), 600);
  }, [doSave]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // Apply draft: replace or append
  const applyDraft = useCallback((mode: "replace" | "append") => {
    if (!draft) return;
    if (mode === "replace") {
      setContent(draft);
      save(draft).then(() => {
        toast.success("大纲已覆盖保存");
        setSaveState("idle");
      }).catch(() => toast.error("保存失败"));
    } else {
      const combined = content.trim() ? content + "\n\n" + draft : draft;
      setContent(combined);
      save(combined).then(() => {
        toast.success("大纲已追加保存");
        setSaveState("idle");
      }).catch(() => toast.error("保存失败"));
    }
    setDraft(null);
  }, [draft, content, save]);

  const discardDraft = useCallback(() => {
    setDraft(null);
  }, []);

  // Generate
  const startGenerate = useCallback(async () => {
    if (!currentPreset) return;
    setDraft("");
    await generate({
      command: "generate_outline",
      stage: "outline",
      args: { projectId: project.id, presetId: currentPreset.id },
      onError: (err) => toast.error("生成失败", { description: err }),
    });
  }, [generate, project.id, currentPreset]);

  useAppEvents({
    onGenerate: startGenerate,
    onSave: doSave,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="animate-spin" style={{ width: 20, height: 20 }} />
      </div>
    );
  }

  const isGeneratingOutline = generating && generatingStage === "outline";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center justify-between shrink-0 border-b"
          style={{
            padding: "8px 18px",
            borderColor: "var(--border)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              大纲
            </span>
            <SaveBadge state={saveState} />
          </div>
          <div className="flex items-center gap-2">
            {/* Model select */}
            <select
              value={currentPresetId ?? ""}
              onChange={(e) => switchPreset(Number(e.target.value))}
              style={{
                height: 28,
                padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--canvas)",
                color: "var(--text-secondary)",
                fontSize: 12,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.model_name}</option>
              ))}
            </select>

            {/* Generate / Cancel */}
            {isGeneratingOutline ? (
              <button
                onClick={cancel}
                className="flex items-center gap-1.5 rounded-md transition-colors"
                style={{
                  height: 28, padding: "0 10px",
                  backgroundColor: "var(--danger-soft)",
                  color: "var(--danger)",
                  border: "1px solid var(--danger)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                <Square style={{ width: 10, height: 10 }} />
                停止
              </button>
            ) : (
              <button
                onClick={startGenerate}
                disabled={!currentPreset}
                className="flex items-center gap-1.5 rounded-md transition-colors disabled:opacity-40"
                style={{
                  height: 28, padding: "0 12px",
                  backgroundColor: "var(--accent)",
                  color: "#FFFFFF",
                  border: "none",
                  fontSize: 12, fontWeight: 600,
                  cursor: currentPreset ? "pointer" : "not-allowed",
                }}
              >
                <Sparkles style={{ width: 12, height: 12 }} />
                AI 生成
              </button>
            )}
          </div>
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-y-auto app-scrollbar">
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 32px" }}>
            {isGeneratingOutline && draft !== null ? (
              /* Draft streaming view */
              <DraftStreamView
                draft={draft}
                thinking={thinkingContent}
                generating={isGeneratingOutline}
              />
            ) : draft ? (
              /* Draft review: show current + draft side by side */
              <DraftReviewView
                current={content}
                draft={draft}
                onApplyReplace={() => applyDraft("replace")}
                onApplyAppend={() => applyDraft("append")}
                onDiscard={discardDraft}
              />
            ) : content.trim() ? (
              /* Normal editing */
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); scheduleSave(); }}
                placeholder="在此编写大纲，或点击 AI 生成..."
                style={{
                  width: "100%",
                  minHeight: 500,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  lineHeight: 1.8,
                  fontFamily: "var(--font-ui)",
                  resize: "none",
                }}
              />
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center gap-4" style={{ padding: 60 }}>
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{
                    width: 48, height: 48,
                    backgroundColor: "var(--surface-raised)",
                  }}
                >
                  <FileText style={{ width: 20, height: 20, color: "var(--text-muted)" }} />
                </div>
                <div className="text-center">
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>
                    大纲为空
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    点击 AI 生成或手动编写大纲
                  </p>
                </div>
                <button
                  onClick={startGenerate}
                  disabled={!currentPreset}
                  className="flex items-center gap-2 rounded-md transition-colors disabled:opacity-40"
                  style={{
                    height: 32, padding: "0 16px",
                    backgroundColor: "var(--accent)",
                    color: "#FFFFFF",
                    border: "none",
                    fontSize: 13, fontWeight: 600,
                    cursor: currentPreset ? "pointer" : "not-allowed",
                  }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  AI 生成大纲
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error bar */}
        {error && (
          <div
            className="flex items-center gap-2 shrink-0 border-t"
            style={{
              padding: "8px 18px",
              borderColor: "var(--border)",
              backgroundColor: "var(--danger-soft)",
              color: "var(--danger)",
              fontSize: 12,
            }}
          >
            <AlertCircle style={{ width: 14, height: 14 }} />
            {error}
          </div>
        )}
      </div>

      {/* Right Inspector */}
      <div
        className="shrink-0 border-l overflow-y-auto app-scrollbar"
        style={{
          width: 300,
          borderColor: "var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        <div className="flex flex-col gap-4" style={{ padding: 16 }}>
          <InspectorSection title="项目设定">
            {profile ? (
              <div className="flex flex-col gap-2">
                {profile.genre && <InspectorItem label="题材" value={profile.genre} />}
                {profile.premise && <InspectorItem label="前提" value={profile.premise} />}
                {profile.selling_point && <InspectorItem label="卖点" value={profile.selling_point} />}
                {profile.target_audience && <InspectorItem label="读者" value={profile.target_audience} />}
              </div>
            ) : (
              <InspectorEmpty label="尚未设定项目定盘" />
            )}
          </InspectorSection>

          <InspectorSection title="创作进度">
            {progress ? (
              <div className="flex flex-col gap-2">
                <InspectorItem label="大纲" value={progress.has_outline ? "已有" : "空"} />
                <InspectorItem label="人物" value={`${progress.character_count} 个`} />
                <InspectorItem label="章节" value={`${progress.chapter_count} 章`} />
                <InspectorItem label="正文" value={progress.has_content ? "已有" : "空"} />
              </div>
            ) : null}
          </InspectorSection>

          <InspectorSection title="操作">
            <button
              onClick={doSave}
              disabled={saving}
              className="flex items-center gap-2 w-full rounded-md transition-colors disabled:opacity-40"
              style={{
                height: 30,
                padding: "0 10px",
                border: "1px solid var(--border)",
                background: "var(--canvas)",
                color: "var(--text-secondary)",
                fontSize: 12, fontWeight: 500,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              <Save style={{ width: 12, height: 12 }} />
              {saving ? "保存中…" : "保存大纲"}
            </button>
          </InspectorSection>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  switch (state) {
    case "idle": return null;
    case "dirty": return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>编辑中…</span>;
    case "saving": return (
      <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--text-muted)" }}>
        <Loader2 className="animate-spin" style={{ width: 10, height: 10 }} />保存中…
      </span>
    );
    case "saved": return (
      <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--success)" }}>
        <Check style={{ width: 10, height: 10 }} />已保存
      </span>
    );
    case "error": return (
      <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--danger)" }}>
        <AlertCircle style={{ width: 10, height: 10 }} />保存失败
      </span>
    );
  }
}

function DraftStreamView({ draft, thinking, generating }: { draft: string; thinking: string; generating: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {thinking && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.6,
            fontStyle: "italic",
          }}
        >
          {thinking}
        </div>
      )}
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          backgroundColor: "var(--accent-soft)",
          border: "1px solid var(--accent)",
          fontSize: 13,
          color: "var(--text-primary)",
          lineHeight: 1.8,
          whiteSpace: "pre-wrap",
          minHeight: 200,
        }}
      >
        {generating && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "var(--accent)" }}>
            <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
            正在生成草稿…
          </span>
        )}
        {draft || "等待 AI 响应…"}
      </div>
    </div>
  );
}

function DraftReviewView({
  current,
  draft,
  onApplyReplace,
  onApplyAppend,
  onDiscard,
}: {
  current: string;
  draft: string;
  onApplyReplace: () => void;
  onApplyAppend: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Action bar */}
      <div
        className="flex items-center justify-between rounded-md"
        style={{
          padding: "10px 14px",
          backgroundColor: "var(--accent-soft)",
          border: "1px solid var(--accent)",
        }}
      >
        <div className="flex items-center gap-2">
          <Clock style={{ width: 14, height: 14, color: "var(--accent)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            草稿已生成
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            选择应用方式
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onApplyReplace} className="flex items-center gap-1.5 rounded-md" style={applyBtnStyle}>
            <Check style={{ width: 12, height: 12 }} />
            覆盖
          </button>
          {current.trim() && (
            <button onClick={onApplyAppend} className="flex items-center gap-1.5 rounded-md" style={appendBtnStyle}>
              <ArrowRight style={{ width: 12, height: 12 }} />
              追加
            </button>
          )}
          <button onClick={onDiscard} className="flex items-center gap-1.5 rounded-md" style={discardBtnStyle}>
            <X style={{ width: 12, height: 12 }} />
            放弃
          </button>
        </div>
      </div>

      {/* Draft content */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 6,
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          fontSize: 14,
          color: "var(--text-primary)",
          lineHeight: 1.8,
          whiteSpace: "pre-wrap",
        }}
      >
        {draft}
      </div>
    </div>
  );
}

const applyBtnStyle: React.CSSProperties = {
  height: 28, padding: "0 10px",
  backgroundColor: "var(--accent)", color: "#FFFFFF",
  border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const appendBtnStyle: React.CSSProperties = {
  height: 28, padding: "0 10px",
  backgroundColor: "var(--surface-raised)", color: "var(--text-primary)",
  border: "1px solid var(--border-strong)", fontSize: 12, fontWeight: 500, cursor: "pointer",
};
const discardBtnStyle: React.CSSProperties = {
  height: 28, padding: "0 10px",
  backgroundColor: "transparent", color: "var(--text-muted)",
  border: "1px solid var(--border)", fontSize: 12, fontWeight: 500, cursor: "pointer",
};

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function InspectorItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span className="min-w-0 truncate" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

function InspectorEmpty({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
  );
}
