/**
 * ContentEditor — Carbon Frost 正文工作室 (Phase E / V8)
 *
 * 左侧章节导航（210px，可收起）
 * 中央正文编辑器（最大阅读宽度 760px，16px 字体，1.75 行高）
 * 右侧检查器（320px，可切换：上下文/审核/后护理/快照）
 * 专注模式隐藏导航和检查器
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useChapters } from "@/hooks/useChapters";
import { useContent } from "@/hooks/useContent";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useStopwords } from "@/hooks/useStopwords";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useWorkbench } from "@/app/WorkbenchContext";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { FlowGuide } from "@/components/flow/FlowGuide";
import { StreamingView, stripThinking } from "@/components/shared/StreamingView";
import { STOPWORD_SUGGESTIONS } from "@/lib/stopwords";
import { Badge } from "@/components/ui/badge";
import { GenerationStatusBar } from "@/components/ai/GenerationStatusBar";
import { GenerateConfirmDialog } from "@/components/ai/GenerateConfirmDialog";
import { ChapterQualityPanel } from "@/components/ai/ChapterQualityPanel";
import { AftercarePanel } from "@/components/ai/AftercarePanel";
import type { GenerationApplyMode } from "@/types/ai";
import type { Project, ContentWorkspace } from "@/types";
import { saveContent, batchGenerateChapters, getContentWorkspace } from "@/lib/tauri";
import { Save, Sparkles, Square, WandSparkles, ClipboardCheck, HeartPulse, Zap, CheckCircle2, PanelLeft, PanelRight, Focus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type InspectorTab = "context" | "review" | "aftercare" | "snapshots";

export function ContentEditor({ project }: { project: Project }) {
  const { chapters, loading: chaptersLoading, load: loadChapters } = useChapters(project.id);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const { content, saving, load: loadContent, save } = useContent(selectedChapterId ?? 0);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, generate, cancel, generationMeta, generatedCharCount, elapsedMs, generationStatus, lastCompletedStage } = useAI();
  const { focusMode, toggleFocusMode } = useWorkbench();
  const [text, setText] = useState("");
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("context");
  const [chapterRailOpen, setChapterRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showBatchGenerateDialog, setShowBatchGenerateDialog] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [workspace, setWorkspace] = useState<ContentWorkspace | null>(null);
  const applyModeRef = useRef<GenerationApplyMode>("replace");

  const stopwords = useStopwords(text);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  // Restore last selected chapter
  useEffect(() => {
    if (chaptersLoading || chapters.length === 0 || selectedChapterId !== null) return;
    const saved = localStorage.getItem(`lastChapter_${project.id}`);
    if (saved) {
      const savedId = parseInt(saved, 10);
      if (chapters.some(c => c.id === savedId)) {
        setSelectedChapterId(savedId);
        return;
      }
    }
    setSelectedChapterId(chapters[0].id);
  }, [chaptersLoading, chapters, project.id, selectedChapterId]);

  useEffect(() => {
    if (selectedChapterId !== null) {
      localStorage.setItem(`lastChapter_${project.id}`, String(selectedChapterId));
    }
  }, [selectedChapterId, project.id]);

  // Load content workspace data
  useEffect(() => {
    if (selectedChapterId) {
      loadContent();
      getContentWorkspace(selectedChapterId).then(setWorkspace).catch(() => setWorkspace(null));
    } else {
      setText("");
      setWorkspace(null);
    }
  }, [selectedChapterId, loadContent]);

  useEffect(() => {
    if (content) {
      setText(content.content);
    } else {
      setText("");
    }
  }, [content]);

  // Sync streamed text during generation
  useEffect(() => {
    if (generating && (generatingStage === "content" || generatingStage === "repair")) {
      setText(streamedContent);
    }
  }, [streamedContent, generating, generatingStage]);

  // Auto-save when content generation finishes successfully
  // Only save on "completed" status — never on "failed" or "cancelled"
  const prevGeneratingRef = useRef(false);
  const generatingChapterIdRef = useRef<number | null>(null);
  const textBeforeGenerationRef = useRef("");

  useEffect(() => {
    if (prevGeneratingRef.current && !generating) {
      prevGeneratingRef.current = false;

      // Only save if generation completed successfully for the content stage
      if (generationStatus === "completed" && lastCompletedStage === "content") {
        const chapterId = generatingChapterIdRef.current;
        if (!chapterId || !streamedContent) return;
        const cleaned = stripThinking(streamedContent);
        const timer = setTimeout(() => {
          if (applyModeRef.current === "append" && textBeforeGenerationRef.current.trim()) {
            const combined = textBeforeGenerationRef.current + "\n\n" + cleaned;
            setText(combined);
            saveContent(project.id, chapterId, combined)
              .then(() => toast.success("正文已自动保存（追加）"))
              .catch(() => toast.error("自动保存失败"));
          } else {
            setText(cleaned);
            saveContent(project.id, chapterId, cleaned)
              .then(() => toast.success("正文已自动保存"))
              .catch(() => toast.error("自动保存失败"));
          }
        }, 50);
        return () => clearTimeout(timer);
      }

      // On failure or cancel, restore the original text
      if (generationStatus === "failed" || generationStatus === "cancelled") {
        if (lastCompletedStage === "content" || lastCompletedStage === "repair") {
          setText(textBeforeGenerationRef.current);
        }
      }
    }
    prevGeneratingRef.current = generating;
  }, [generating, streamedContent, project.id, generationStatus, lastCompletedStage]);

  const handleSave = useCallback(async () => {
    if (selectedChapterId) {
      await save(project.id, text);
    }
  }, [selectedChapterId, save, project.id, text]);

  const startGenerate = useCallback(async (mode: GenerationApplyMode) => {
    setShowGenerateConfirm(false);
    applyModeRef.current = mode;
    generatingChapterIdRef.current = selectedChapterId;
    textBeforeGenerationRef.current = text;
    if (mode === "replace") setText("");
    await generate({
      command: "generate_content",
      stage: "content",
      args: {
        projectId: project.id,
        chapterId: selectedChapterId!,
        presetId: currentPreset!.id,
      },
      onComplete: () => {},
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [generate, project.id, selectedChapterId, currentPreset]);

  const handleGenerateClick = useCallback(() => {
    if (!currentPreset || !selectedChapterId || generating) return;
    if (text.trim()) {
      setShowGenerateConfirm(true);
      return;
    }
    startGenerate("replace");
  }, [currentPreset, selectedChapterId, generating, text, startGenerate]);

  const handlePolish = useCallback(async () => {
    if (!currentPreset || !selectedChapterId) return;
    applyModeRef.current = "replace";
    generatingChapterIdRef.current = selectedChapterId;
    textBeforeGenerationRef.current = text;
    await generate({
      command: "polish_content",
      stage: "content",
      args: {
        projectId: project.id,
        chapterId: selectedChapterId,
        presetId: currentPreset.id,
      },
      onComplete: () => {},
      onError: (err) => {
        toast.error("润色失败", { description: err });
      },
    });
  }, [currentPreset, selectedChapterId, generate, project.id]);

  const handleBatchGenerate = useCallback(async () => {
    if (!currentPreset || selectedChapterIds.length === 0) return;
    setBatchGenerating(true);
    try {
      await batchGenerateChapters(project.id, selectedChapterIds, currentPreset.id);
      toast.success(`批量生成任务已创建,可在任务中心查看进度`);
      setShowBatchGenerateDialog(false);
      setSelectedChapterIds([]);
    } catch (err) {
      toast.error("批量生成失败", { description: String(err) });
    } finally {
      setBatchGenerating(false);
    }
  }, [currentPreset, selectedChapterIds, project.id]);

  const toggleChapterSelection = useCallback((chapterId: number) => {
    setSelectedChapterIds(prev =>
      prev.includes(chapterId)
        ? prev.filter(id => id !== chapterId)
        : [...prev, chapterId]
    );
  }, []);

  useAppEvents({
    onGenerate: handleGenerateClick,
    onSave: handleSave,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  const selectedChapter = chapters.find(c => c.id === selectedChapterId);
  const charCount = text.length;

  if (chaptersLoading) return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>加载中...</div>;

  return (
    <>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left: Chapter Rail (210px, collapsible) ── */}
        {chapterRailOpen && !focusMode && (
          <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: 210, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            {/* Chapter rail header */}
            <div className="flex items-center justify-between shrink-0" style={{ height: 40, padding: "0 12px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>章节</span>
              <button onClick={() => setChapterRailOpen(false)} title="收起章节列表" style={{ padding: 2 }}>
                <PanelLeft className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            {/* Chapter list */}
            <div className="flex-1 overflow-y-auto">
              {chapters.map((chapter) => {
                const isSelected = selectedChapterId === chapter.id;
                return (
                  <button
                    key={chapter.id}
                    onClick={() => setSelectedChapterId(chapter.id)}
                    className="w-full text-left transition-colors"
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--border)",
                      backgroundColor: isSelected ? "var(--surface-selected)" : "transparent",
                      borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: 12, color: "var(--text-muted)", minWidth: 20 }}>
                        {chapter.chapter_number}
                      </span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}>
                        {chapter.title || "未命名"}
                      </span>
                    </div>
                  </button>
                );
              })}
              {chapters.length === 0 && (
                <div className="flex items-center justify-center" style={{ height: 80, color: "var(--text-muted)" }}>
                  <span style={{ fontSize: 12 }}>暂无章节</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Center: Manuscript Editor ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
          {/* Editor toolbar */}
          <div className="flex items-center justify-between shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              {!chapterRailOpen && !focusMode && (
                <button onClick={() => setChapterRailOpen(true)} title="展开章节列表" style={{ padding: 4 }}>
                  <PanelLeft className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                </button>
              )}
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {selectedChapter ? `第${selectedChapter.chapter_number}章 ${selectedChapter.title || "未命名"}` : "正文"}
              </span>
              {saving && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>保存中...</span>}
              {!saving && content && <span style={{ fontSize: 11, color: "var(--success)" }}>已保存</span>}
            </div>
            <div className="flex items-center gap-2">
              {generating && generatingStage === "content" ? (
                <GenerationStatusBar
                  stageLabel="正文"
                  modelName={generationMeta?.modelName}
                  charCount={generatedCharCount}
                  elapsedMs={elapsedMs}
                />
              ) : (
                <>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 12, color: "var(--text-muted)" }}>
                    {charCount.toLocaleString()} 字
                  </span>
                  {stopwords.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--warning)" }}>
                      高频词 {stopwords.length}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
            {generating ? (
              <Button variant="destructive" size="sm" onClick={cancel} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
                <Square className="h-3.5 w-3.5" />停止
              </Button>
            ) : (
              <Button size="sm" onClick={handleGenerateClick} disabled={!currentPreset || !selectedChapterId} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
                <Sparkles className="h-3.5 w-3.5" />生成正文
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePolish} disabled={!currentPreset || !selectedChapterId || !text.trim() || generating} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
              <WandSparkles className="h-3.5 w-3.5" />润色
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBatchGenerateDialog(true)} disabled={!currentPreset || chapters.length === 0} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
              <Zap className="h-3.5 w-3.5" />批量生成
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || !selectedChapterId || generating} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
              <Save className="h-3.5 w-3.5" />保存
            </Button>
            <div className="flex-1" />
            <button
              onClick={() => setInspectorTab("review")}
              title="质量审核"
              className="flex items-center gap-1"
              style={{
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: inspectorTab === "review" ? "var(--accent)" : "var(--text-muted)",
                backgroundColor: inspectorTab === "review" ? "var(--accent-soft)" : "transparent",
              }}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />审核
            </button>
            <button
              onClick={() => setInspectorTab("aftercare")}
              title="后护理"
              className="flex items-center gap-1"
              style={{
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: inspectorTab === "aftercare" ? "var(--accent)" : "var(--text-muted)",
                backgroundColor: inspectorTab === "aftercare" ? "var(--accent-soft)" : "transparent",
              }}
            >
              <HeartPulse className="h-3.5 w-3.5" />后护理
            </button>
            {!focusMode && (
              <button onClick={toggleFocusMode} title="专注模式" style={{ padding: 4 }}>
                <Focus className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </button>
            )}
            {focusMode && (
              <Button variant="outline" size="sm" onClick={toggleFocusMode} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
                退出专注
              </Button>
            )}
          </div>

          {/* Editor area */}
          <div className="flex-1 overflow-y-auto">
            {selectedChapterId ? (
              <div className="flex flex-col" style={{ minHeight: "100%" }}>
                {/* Flow guide */}
                {!focusMode && (
                  <div style={{ padding: "8px 16px 0" }}>
                    <FlowGuide stage="content" input={{ chapterCount: chapters.length, selectedChapterId }} />
                  </div>
                )}
                {generating && generatingStage !== "review" ? (
                  <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 32px", width: "100%" }}>
                    <StreamingView
                      content={text}
                      thinkingContent={thinkingContent}
                      generating={generating}
                    />
                  </div>
                ) : (
                  <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 32px", width: "100%", flex: 1 }}>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="app-scrollbar"
                      style={{
                        minHeight: "420px",
                        width: "100%",
                        resize: "none",
                        backgroundColor: "transparent",
                        border: "none",
                        boxShadow: "none",
                        outline: "none",
                        fontSize: "var(--editor-font-size, 16px)",
                        lineHeight: 1.75,
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-ui)",
                      }}
                      placeholder="正文内容..."
                    />
                    {/* Stopword highlights */}
                    {stopwords.length > 0 && !generating && (
                      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 16, padding: 12, borderRadius: "var(--radius-md)", backgroundColor: "var(--surface)" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 4 }}>高频词：</span>
                        {stopwords.map(({ word, count }) => (
                          <span key={word} className="group relative">
                            <Badge
                              variant="secondary"
                              style={{ fontSize: 11, cursor: "help", border: "1px solid var(--warning-soft)", borderRadius: "var(--radius-sm)", padding: "2px 6px", backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}
                            >
                              {word} ×{count}
                            </Badge>
                            {STOPWORD_SUGGESTIONS[word] && (
                              <span style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 4, display: "none" }} className="group-hover:flex">
                                <span style={{ backgroundColor: "var(--surface-raised)", color: "var(--text-primary)", fontSize: 11, borderRadius: "var(--radius-sm)", padding: "4px 8px", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                                  建议：{STOPWORD_SUGGESTIONS[word].join("、")}
                                </span>
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Stale alert */}
                    {!focusMode && (
                      <div style={{ marginTop: 8 }}>
                        <StaleAlert projectId={project.id} targetType="contents" onRegenerate={handleGenerateClick} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center" style={{ height: "100%", color: "var(--text-muted)" }}>
                <span style={{ fontSize: 14 }}>选择左侧章节开始编辑</span>
              </div>
            )}
          </div>

          {/* Bottom navigation (adjacent chapters) */}
          {workspace && !focusMode && (
            <div className="flex items-center justify-between shrink-0" style={{ height: 40, borderTop: "1px solid var(--border)", backgroundColor: "var(--surface)", padding: "0 16px" }}>
              {workspace.prev_chapter ? (
                <button
                  onClick={() => setSelectedChapterId(workspace.prev_chapter!.id)}
                  className="flex items-center gap-1 transition-colors hover:opacity-80"
                  style={{ fontSize: 12, color: "var(--text-secondary)" }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  第{workspace.prev_chapter.chapter_number}章 {workspace.prev_chapter.title || "未命名"}
                </button>
              ) : <span />}
              {workspace.next_chapter ? (
                <button
                  onClick={() => setSelectedChapterId(workspace.next_chapter!.id)}
                  className="flex items-center gap-1 transition-colors hover:opacity-80"
                  style={{ fontSize: 12, color: "var(--text-secondary)" }}
                >
                  第{workspace.next_chapter.chapter_number}章 {workspace.next_chapter.title || "未命名"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : <span />}
            </div>
          )}
        </div>

        {/* ── Right: Inspector (320px) ── */}
        {inspectorOpen && !focusMode && (
          <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: 320, borderLeft: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            {/* Inspector header with tabs */}
            <div className="flex items-center shrink-0" style={{ height: 40, borderBottom: "1px solid var(--border)" }}>
              {(["context", "review", "aftercare", "snapshots"] as InspectorTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setInspectorTab(tab)}
                  style={{
                    flex: 1,
                    height: "100%",
                    fontSize: 12,
                    fontWeight: inspectorTab === tab ? 600 : 400,
                    color: inspectorTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                    borderBottom: inspectorTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                    backgroundColor: "transparent",
                  }}
                >
                  {tab === "context" ? "上下文" : tab === "review" ? "审核" : tab === "aftercare" ? "后护理" : "快照"}
                </button>
              ))}
            </div>

            {/* Inspector content */}
            <div className="flex-1 overflow-y-auto">
              {inspectorTab === "context" && workspace && (
                <div style={{ padding: 16 }}>
                  <div className="flex flex-col" style={{ gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>章节目标</label>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.goal || "未设定"}</p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>视角</label>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.viewpoint || "未设定"}</p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>场景</label>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.scene || "未设定"}</p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>冲突等级</label>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.conflict_level} / 5</p>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>目标字数</label>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.target_word_count.toLocaleString()} 字</p>
                    </div>
                    {workspace.chapter.hook && (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>开篇钩子</label>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.hook}</p>
                      </div>
                    )}
                    {workspace.chapter.payoff && (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>收束回报</label>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.payoff}</p>
                      </div>
                    )}
                    {workspace.chapter.must_avoid && (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>禁止事项</label>
                        <p style={{ fontSize: 13, color: "var(--warning)", marginTop: 4 }}>{workspace.chapter.must_avoid}</p>
                      </div>
                    )}
                    {workspace.chapter.turning_point && (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>转折点</label>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{workspace.chapter.turning_point}</p>
                      </div>
                    )}
                    {workspace.latest_review && (
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>最新审核</label>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                          总分：{workspace.latest_review.overall_score}
                          {workspace.latest_review.issues_json !== "[]" && workspace.latest_review.issues_json !== "" && (
                            <span style={{ marginLeft: 8, color: "var(--warning)" }}>
                              {(() => {
                                try { return JSON.parse(workspace.latest_review.issues_json).length; } catch { return 0; }
                              })()} 个问题
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {inspectorTab === "review" && (
                <ChapterQualityPanel
                  projectId={project.id}
                  chapterId={selectedChapterId}
                  hasContent={text.trim().length > 0}
                  currentContent={text}
                  onContentRepaired={(repairedText) => setText(repairedText)}
                  onLocateIssue={(start, end) => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="正文内容..."]');
                    if (textarea) {
                      textarea.focus();
                      textarea.setSelectionRange(start, end);
                      // Scroll to the selection
                      const lineHeight = 28; // 16px font * 1.75 line-height
                      const linesBefore = textarea.value.substring(0, start).split("\n").length;
                      textarea.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
                    }
                  }}
                />
              )}

              {inspectorTab === "aftercare" && (
                <AftercarePanel
                  project={project}
                  chapterId={selectedChapterId}
                  hasContent={text.trim().length > 0}
                />
              )}

              {inspectorTab === "snapshots" && (
                <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
                  快照功能将在 Phase F 中完善
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toggle inspector button when closed */}
        {!inspectorOpen && !focusMode && (
          <button
            onClick={() => setInspectorOpen(true)}
            title="展开检查器"
            style={{ width: 28, display: "flex", justifyContent: "center", alignItems: "center", borderLeft: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
          >
            <PanelRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          </button>
        )}
      </div>

      <GenerateConfirmDialog
        open={showGenerateConfirm}
        onOpenChange={setShowGenerateConfirm}
        onConfirm={startGenerate}
      />

      <Dialog open={showBatchGenerateDialog} onOpenChange={setShowBatchGenerateDialog}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              批量生成正文
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[360px] overflow-y-auto">
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedChapterIds.includes(chapter.id)
                      ? "bg-primary/10 border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                  onClick={() => toggleChapterSelection(chapter.id)}
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                    selectedChapterIds.includes(chapter.id)
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border"
                  }`}>
                    {selectedChapterIds.includes(chapter.id) && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      第{chapter.chapter_number}章 {chapter.title || "未命名"}
                    </p>
                    {chapter.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {chapter.summary}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchGenerateDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleBatchGenerate}
              disabled={batchGenerating || selectedChapterIds.length === 0}
            >
              {batchGenerating ? "生成中..." : `生成 ${selectedChapterIds.length} 章`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
