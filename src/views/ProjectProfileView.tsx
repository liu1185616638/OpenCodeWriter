/**
 * ProjectProfileView — Carbon Frost 项目定盘
 *
 * 改为分组表单和自动保存（600ms 防抖）。
 * 保存前显示会过时的下游内容（preview_profile_change_impact）。
 * 保存失败持续显示并可重试。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getProjectProfile,
  saveProjectProfile,
  previewProfileChangeImpact,
} from "@/lib/tauri";
import type { Project, ProfileChangeImpact } from "@/types";
import {
  Save, Loader2, AlertCircle, Check,
  ChevronDown, ChevronUp,
} from "lucide-react";

const narrativePovOptions = [
  { value: "first_person", label: "第一人称" },
  { value: "third_person", label: "第三人称" },
  { value: "omniscient", label: "全知视角" },
];

const paceOptions = [
  { value: "fast", label: "快节奏" },
  { value: "balanced", label: "均衡" },
  { value: "slow", label: "慢热" },
];

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function ProjectProfileView({ project }: { project: Project }) {
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [impact, setImpact] = useState<ProfileChangeImpact | null>(null);
  const [showImpact, setShowImpact] = useState(false);

  // Form state
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [sellingPoint, setSellingPoint] = useState("");
  const [readerPromise, setReaderPromise] = useState("");
  const [narrativePov, setNarrativePov] = useState("third_person");
  const [pacePreference, setPacePreference] = useState("balanced");
  const [defaultChapterLength, setDefaultChapterLength] = useState(3000);
  const [estimatedChapterCount, setEstimatedChapterCount] = useState(30);

  // Track if form has been edited since last save
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load profile and impact
  useEffect(() => {
    async function load() {
      try {
        const [p, imp] = await Promise.all([
          getProjectProfile(project.id),
          previewProfileChangeImpact(project.id),
        ]);
        setPremise(p.premise);
        setGenre(p.genre);
        setTargetAudience(p.target_audience);
        setSellingPoint(p.selling_point);
        setReaderPromise(p.reader_promise);
        setNarrativePov(p.narrative_pov);
        setPacePreference(p.pace_preference);
        setDefaultChapterLength(p.default_chapter_length);
        setEstimatedChapterCount(p.estimated_chapter_count);
        setImpact(imp);
      } catch {
        // Profile doesn't exist yet — use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [project.id]);

  // Auto-save with debounce
  const doSave = useCallback(async () => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await saveProjectProfile(project.id, {
        premise,
        genre,
        target_audience: targetAudience,
        selling_point: sellingPoint,
        reader_promise: readerPromise,
        narrative_pov: narrativePov,
        pace_preference: pacePreference,
        default_chapter_length: defaultChapterLength,
        estimated_chapter_count: estimatedChapterCount,
      });
      dirtyRef.current = false;
      setSaveState("saved");
      // Clear "saved" indicator after 2 seconds
      setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (e) {
      setSaveError(String(e));
      setSaveState("error");
    }
  }, [project.id, premise, genre, targetAudience, sellingPoint, readerPromise, narrativePov, pacePreference, defaultChapterLength, estimatedChapterCount]);

  // Schedule auto-save on changes
  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave();
    }, 600);
  }, [doSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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

  const hasImpact = impact && (impact.outline_stale > 0 || impact.chapter_stale > 0 || impact.content_stale > 0);

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      {/* Header with save status */}
      <div
        className="flex items-center justify-between shrink-0 border-b"
        style={{
          padding: "12px 24px",
          borderColor: "var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        <div className="flex flex-col">
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            项目定盘
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            设定题材、卖点、目标读者和叙事偏好，AI 生成时自动注入
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveStatusBadge state={saveState} error={saveError} />
          {saveState === "error" && (
            <button
              onClick={doSave}
              className="flex items-center gap-1 rounded-md transition-colors"
              style={{
                height: 28,
                padding: "0 10px",
                backgroundColor: "var(--accent)",
                color: "#FFFFFF",
                border: "none",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Save style={{ width: 12, height: 12 }} />
              重试
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto app-scrollbar" style={{ padding: "24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }} className="flex flex-col gap-6">
          {/* Impact warning */}
          {hasImpact && showImpact && (
            <div
              className="flex flex-col gap-2 rounded-md border"
              style={{
                padding: 12,
                borderColor: "var(--warning)",
                backgroundColor: "var(--warning-soft)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--warning)",
                  }}
                >
                  修改影响预览
                </span>
                <button
                  onClick={() => setShowImpact(false)}
                  className="rounded transition-colors"
                  style={{
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  收起
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {impact!.summary}
              </p>
            </div>
          )}
          {hasImpact && !showImpact && (
            <button
              onClick={() => setShowImpact(true)}
              className="flex items-center gap-2 self-start rounded-md transition-colors"
              style={{
                padding: "6px 10px",
                border: "1px solid var(--warning)",
                backgroundColor: "var(--warning-soft)",
                color: "var(--warning)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <AlertCircle style={{ width: 12, height: 12 }} />
              {impact!.summary}
              <ChevronDown style={{ width: 12, height: 12 }} />
            </button>
          )}

          {/* Group 1: 核心设定 */}
          <FormSection title="核心设定" description="故事的基本框架和卖点">
            <FormField label="题材类型">
              <input
                value={genre}
                onChange={(e) => { setGenre(e.target.value); scheduleSave(); }}
                placeholder="如：都市悬疑、仙侠、科幻…"
                style={inputStyle}
              />
            </FormField>

            <FormField label="一句话前提" hint="用一句话概括故事核心：谁，在什么情况下，要做什么，面临什么阻碍">
              <textarea
                value={premise}
                onChange={(e) => { setPremise(e.target.value); scheduleSave(); }}
                placeholder="用一句话概括故事核心：谁，在什么情况下，要做什么，面临什么阻碍"
                style={{ ...inputStyle, minHeight: 60, resize: "none", paddingTop: 8 }}
              />
            </FormField>

            <FormField label="核心卖点" hint="一句话说明为什么读者会追这本书">
              <input
                value={sellingPoint}
                onChange={(e) => { setSellingPoint(e.target.value); scheduleSave(); }}
                placeholder="一句话说明为什么读者会追这本书"
                style={inputStyle}
              />
            </FormField>

            <FormField label="目标读者">
              <input
                value={targetAudience}
                onChange={(e) => { setTargetAudience(e.target.value); scheduleSave(); }}
                placeholder="如：18-30岁男性，喜欢快节奏都市文"
                style={inputStyle}
              />
            </FormField>

            <FormField label="前 30 章承诺" hint="承诺给读者的体验：什么爽点、什么期待、什么情感">
              <textarea
                value={readerPromise}
                onChange={(e) => { setReaderPromise(e.target.value); scheduleSave(); }}
                placeholder="前 30 章承诺给读者的体验：什么爽点、什么期待、什么情感"
                style={{ ...inputStyle, minHeight: 60, resize: "none", paddingTop: 8 }}
              />
            </FormField>
          </FormSection>

          {/* Group 2: 创作偏好 */}
          <FormSection title="创作偏好" description="叙事视角、节奏和篇幅控制">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="叙事视角">
                <SelectField
                  value={narrativePov}
                  onChange={(v) => { setNarrativePov(v); scheduleSave(); }}
                  options={narrativePovOptions}
                />
              </FormField>

              <FormField label="节奏偏好">
                <SelectField
                  value={pacePreference}
                  onChange={(v) => { setPacePreference(v); scheduleSave(); }}
                  options={paceOptions}
                />
              </FormField>

              <FormField label="默认章节字数">
                <input
                  type="number"
                  value={defaultChapterLength}
                  onChange={(e) => {
                    setDefaultChapterLength(Number(e.target.value));
                    scheduleSave();
                  }}
                  min={500}
                  max={10000}
                  step={500}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="预计章节数">
                <input
                  type="number"
                  value={estimatedChapterCount}
                  onChange={(e) => {
                    setEstimatedChapterCount(Number(e.target.value));
                    scheduleSave();
                  }}
                  min={5}
                  max={500}
                  step={5}
                  style={inputStyle}
                />
              </FormField>
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function SaveStatusBadge({ state }: { state: SaveState; error: string | null }) {
  switch (state) {
    case "idle":
      return null;
    case "dirty":
      return (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          编辑中…
        </span>
      );
    case "saving":
      return (
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
          保存中…
        </span>
      );
    case "saved":
      return (
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--success)" }}>
          <Check style={{ width: 12, height: 12 }} />
          已保存
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--danger)" }}>
          <AlertCircle style={{ width: 12, height: 12 }} />
          保存失败
        </span>
      );
  }
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--surface)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
        style={{
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <div className="flex flex-col items-start">
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </span>
          {description && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {description}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
        )}
      </button>
      {expanded && (
        <div
          className="flex flex-col gap-4 border-t"
          style={{
            padding: "16px",
            borderColor: "var(--border)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle,
        cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F7D8E' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        paddingRight: 28,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--canvas)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--font-ui)",
};
