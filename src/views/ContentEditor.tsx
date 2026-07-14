/**
 * ContentEditor — Carbon Frost 正文工作室 (Phase E / V8)
 *
 * AI 正文生成和润色不再直接改写正文：流式结果先进入本地待审阅草稿，
 * 用户确认后通过后端事务创建快照、校验基础版本并应用。
 */

import { useEffect, useState, useCallback } from "react";
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
import { applyContentDraft, batchGenerateChapters, getContentWorkspace } from "@/lib/tauri";
import { Save, Sparkles, Square, WandSparkles, ClipboardCheck, HeartPulse, Zap, CheckCircle2, PanelLeft, PanelRight, Focus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

type InspectorTab = "context" | "review" | "aftercare" | "snapshots";
type ManuscriptDraftKind = "content" | "polish";

interface PendingManuscriptDraft {
  kind: ManuscriptDraftKind;
  chapterId: number;
  baseUpdatedAt: string | null;
  baseText: string;
  content: string;
  mode: GenerationApplyMode;
}

export function ContentEditor({ project }: { project: Project }) {
  const { chapters, loading: chaptersLoading, load: loadChapters } = useChapters(project.id);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const { content, saving, load: loadContent, save } = useContent(selectedChapterId ?? 0);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, generate, cancel, generationMeta, generatedCharCount, elapsedMs } = useAI();
  const { focusMode, toggleFocusMode } = useWorkbench();
  const [text, setText] = useState("");
  const [pendingDraft, setPendingDraft] = useState<PendingManuscriptDraft | null>(null);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("context");
  const [chapterRailOpen, setChapterRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showBatchGenerateDialog, setShowBatchGenerateDialog] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [workspace, setWorkspace] = useState<ContentWorkspace | null>(null);

  const stopwords = useStopwords(text);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  useEffect(() => {
    if (chaptersLoading || chapters.length === 0 || selectedChapterId !== null) return;
    const saved = localStorage.getItem(`lastChapter_${project.id}`);
    if (saved) {
      const savedId = parseInt(saved, 10);
      if (chapters.some((chapter) => chapter.id === savedId)) {
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

  useEffect(() => {
    setPendingDraft(null);
    if (selectedChapterId) {
      loadContent();
      getContentWorkspace(selectedChapterId).then(setWorkspace).catch(() => setWorkspace(null));
    } else {
      setText("");
      setWorkspace(null);
    }
  }, [selectedChapterId, loadContent]);

  useEffect(() => {
    setText(content?.content ?? "");
  }, [content]);

  const handleSave = useCallback(async () => {
    if (selectedChapterId) {
      await save(project.id, text);
    }
  }, [selectedChapterId, save, project.id, text]);

  const createDraftFromResult = useCallback((
    kind: ManuscriptDraftKind,
    mode: GenerationApplyMode,
    chapterId: number,
    baseText: string,
    baseUpdatedAt: string | null,
    generated: string,
  ) => {
    const cleaned = stripThinking(generated);
    if (!cleaned.trim()) {
      toast.error("模型没有返回可应用的正文");
      return;
    }
    setPendingDraft({ kind, mode, chapterId, baseText, baseUpdatedAt, content: cleaned });
    toast.success(kind === "polish" ? "润色草稿已生成" : "正文草稿已生成", {
      description: "请检查草稿后选择应用或放弃",
    });
  }, []);

  const startGenerate = useCallback(async (mode: GenerationApplyMode) => {
    if (!currentPreset || !selectedChapterId) return;
    setShowGenerateConfirm(false);
    const chapterId = selectedChapterId;
    const baseText = text;
    const baseUpdatedAt = content?.updated_at ?? null;
    setPendingDraft(null);

    await generate({
      command: "generate_content",
      stage: "content",
      args: {
        projectId: project.id,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: (generated) => {
        createDraftFromResult("content", mode, chapterId, baseText, baseUpdatedAt, generated);
      },
      onError: (err) => toast.error("生成失败", { description: err }),
      onCancel: () => toast.info("已取消正文生成，原文未发生变化"),
    });
  }, [currentPreset, selectedChapterId, text, content?.updated_at, generate, project.id, createDraftFromResult]);

  const handleGenerateClick = useCallback(() => {
    if (!currentPreset || !selectedChapterId || generating) return;
    if (text.trim()) {
      setShowGenerateConfirm(true);
      return;
    }
    void startGenerate("replace");
  }, [currentPreset, selectedChapterId, generating, text, startGenerate]);

  const handlePolish = useCallback(async () => {
    if (!currentPreset || !selectedChapterId || !text.trim()) return;
    const chapterId = selectedChapterId;
    const baseText = text;
    const baseUpdatedAt = content?.updated_at ?? null;
    setPendingDraft(null);

    await generate({
      command: "polish_content",
      stage: "polish",
      args: {
        projectId: project.id,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: (generated) => {
        createDraftFromResult("polish", "replace", chapterId, baseText, baseUpdatedAt, generated);
      },
      onError: (err) => toast.error("润色失败", { description: err }),
      onCancel: () => toast.info("已取消润色，原文未发生变化"),
    });
  }, [currentPreset, selectedChapterId, text, content?.updated_at, generate, project.id, createDraftFromResult]);

  const handleApplyDraft = useCallback(async () => {
    if (!pendingDraft) return;
    const finalText = pendingDraft.mode === "append" && pendingDraft.baseText.trim()
      ? `${pendingDraft.baseText}\n\n${pendingDraft.content}`
      : pendingDraft.content;

    setApplyingDraft(true);
    try {
      const applied = await applyContentDraft({
        projectId: project.id,
        chapterId: pendingDraft.chapterId,
        content: finalText,
        expectedUpdatedAt: pendingDraft.baseUpdatedAt,
        reason: pendingDraft.kind === "polish" ? "AI 润色应用前快照" : "AI 正文草稿应用前快照",
      });
      setText(applied.content);
      setPendingDraft(null);
      await loadContent();
      getContentWorkspace(pendingDraft.chapterId).then(setWorkspace).catch(() => {});
      toast.success(pendingDraft.kind === "polish" ? "润色草稿已应用" : "正文草稿已应用");
    } catch (error) {
      toast.error("应用草稿失败", { description: String(error) });
    } finally {
      setApplyingDraft(false);
    }
  }, [pendingDraft, project.id, loadContent]);

  const handleDiscardDraft = useCallback(() => {
    setPendingDraft(null);
    toast.info("已放弃生成草稿，原文未发生变化");
  }, []);

  const handleBatchGenerate = useCallback(async () => {
    if (!currentPreset || selectedChapterIds.length === 0) return;
    setBatchGenerating(true);
    try {
      await batchGenerateChapters(project.id, selectedChapterIds, currentPreset.id);
      toast.success("批量生成任务已创建，可在任务中心查看进度");
      setShowBatchGenerateDialog(false);
      setSelectedChapterIds([]);
    } catch (err) {
      toast.error("批量生成失败", { description: String(err) });
    } finally {
      setBatchGenerating(false);
    }
  }, [currentPreset, selectedChapterIds, project.id]);

  const toggleChapterSelection = useCallback((chapterId: number) => {
    setSelectedChapterIds((previous) =>
      previous.includes(chapterId)
        ? previous.filter((id) => id !== chapterId)
        : [...previous, chapterId]
    );
  }, []);

  useAppEvents({
    onGenerate: handleGenerateClick,
    onSave: handleSave,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const index = presets.findIndex((preset) => preset.id === currentPresetId);
        const next = presets[(index + 1) % presets.length];
        void switchPreset(next.id);
      }
    },
  });

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
  const charCount = text.length;
  const isMainGeneration = generating && (generatingStage === "content" || generatingStage === "polish");

  if (chaptersLoading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>加载中...</div>;
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {chapterRailOpen && !focusMode && (
          <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: 210, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            <div className="flex items-center justify-between shrink-0" style={{ height: 40, padding: "0 12px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>章节</span>
              <button onClick={() => setChapterRailOpen(false)} title="收起章节列表" style={{ padding: 2 }}>
                <PanelLeft className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
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

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
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
              {!saving && content && !pendingDraft && <span style={{ fontSize: 11, color: "var(--success)" }}>已保存</span>}
              {pendingDraft && <span style={{ fontSize: 11, color: "var(--warning)" }}>待审阅草稿</span>}
            </div>
            <div className="flex items-center gap-2">
              {isMainGeneration ? (
                <GenerationStatusBar
                  stageLabel={generatingStage === "polish" ? "润色" : "正文"}
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
                    <span style={{ fontSize: 11, color: "var(--warning)" }}>高频词 {stopwords.length}</span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
            {generating ? (
              <Button variant="destructive" size="sm" onClick={() => void cancel()} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
                <Square className="h-3.5 w-3.5" />停止
              </Button>
            ) : (
              <Button size="sm" onClick={handleGenerateClick} disabled={!currentPreset || !selectedChapterId || Boolean(pendingDraft)} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
                <Sparkles className="h-3.5 w-3.5" />生成正文
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void handlePolish()} disabled={!currentPreset || !selectedChapterId || !text.trim() || generating || Boolean(pendingDraft)} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
              <WandSparkles className="h-3.5 w-3.5" />润色
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBatchGenerateDialog(true)} disabled={!currentPreset || chapters.length === 0 || generating} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
              <Zap className="h-3.5 w-3.5" />批量生成
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={saving || !selectedChapterId || generating || Boolean(pendingDraft)} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
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

          <div className="flex-1 overflow-y-auto">
            {selectedChapterId ? (
              <div className="flex flex-col" style={{ minHeight: "100%" }}>
                {!focusMode && (
                  <div style={{ padding: "8px 16px 0" }}>
                    <FlowGuide stage="content" input={{ chapterCount: chapters.length, selectedChapterId }} />
                  </div>
                )}

                {isMainGeneration ? (
                  <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 32px", width: "100%" }}>
                    <StreamingView
                      content={streamedContent}
                      thinkingContent={thinkingContent}
                      generating={generating}
                    />
                    <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                      当前正文保持不变，生成完成后将进入待审阅草稿。
                    </p>
                  </div>
                ) : pendingDraft ? (
                  <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 32px", width: "100%", flex: 1 }}>
                    <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--surface)" }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                          {pendingDraft.kind === "polish" ? "润色草稿待审阅" : "正文草稿待审阅"}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          应用时会先创建原文快照，并检查正文是否在生成期间被其他操作修改。
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" onClick={() => void handleApplyDraft()} disabled={applyingDraft} style={{ height: 30, borderRadius: "var(--radius-sm)" }}>
                          {applyingDraft ? "应用中..." : pendingDraft.mode === "append" ? "追加应用" : "覆盖应用"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleDiscardDraft} disabled={applyingDraft} style={{ height: 30, borderRadius: "var(--radius-sm)", gap: 4 }}>
                          <X className="h-3.5 w-3.5" />放弃
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={pendingDraft.content}
                      readOnly
                      className="app-scrollbar"
                      style={{
                        minHeight: "420px",
                        width: "100%",
                        resize: "none",
                        backgroundColor: "transparent",
                        borderColor: "var(--border)",
                        fontSize: "var(--editor-font-size, 16px)",
                        lineHeight: 1.75,
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-ui)",
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 32px", width: "100%", flex: 1 }}>
                    <Textarea
                      value={text}
                      onChange={(event) => setText(event.target.value)}
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

        {inspectorOpen && !focusMode && (
          <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: 320, borderLeft: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            <div className="flex items-center shrink-0" style={{ height: 40, borderBottom: "1px solid var(--border)" }}>
              {(["context", "review", "aftercare", "snapshots"] as InspectorTab[]).map((tab) => (
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
                  currentContentUpdatedAt={content?.updated_at ?? null}
                  onContentRepaired={(repairedText) => {
                    setText(repairedText);
                    void loadContent();
                  }}
                  onLocateIssue={(start, end) => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="正文内容..."]');
                    if (textarea) {
                      textarea.focus();
                      textarea.setSelectionRange(start, end);
                      const lineHeight = 28;
                      const linesBefore = textarea.value.substring(0, start).split("\n").length;
                      textarea.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
                    }
                  }}
                />
              )}

              {inspectorTab === "aftercare" && (
                <AftercarePanel project={project} chapterId={selectedChapterId} hasContent={text.trim().length > 0} />
              )}

              {inspectorTab === "snapshots" && (
                <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
                  快照已在应用 AI 草稿和修复前自动创建；列表与恢复界面将在后续任务中心改造中接入。
                </div>
              )}
            </div>
          </div>
        )}

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

      <GenerateConfirmDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm} onConfirm={startGenerate} />

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
                      <p className="text-xs text-muted-foreground line-clamp-1">{chapter.summary}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchGenerateDialog(false)}>取消</Button>
            <Button onClick={() => void handleBatchGenerate()} disabled={batchGenerating || selectedChapterIds.length === 0}>
              {batchGenerating ? "生成中..." : `生成 ${selectedChapterIds.length} 章`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
