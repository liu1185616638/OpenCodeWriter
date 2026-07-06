import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ModelPresetSelect } from "@/components/editor/ModelPresetSelect";
import { useSettings } from "@/hooks/useSettings";
import { useProjects } from "@/hooks/useProjects";
import { saveProjectProfile, saveOutline } from "@/lib/tauri";
import { stripThinking } from "@/components/shared/StreamingView";
import type { Project, IdeaDirection } from "@/types";
import { Sparkles, ArrowRight, ArrowLeft, Check, Loader2, Lightbulb } from "lucide-react";
import { toast } from "sonner";

type WizardStep = "input" | "directions" | "creating";

interface AiChunkPayload {
  session_id: string;
  chunk: string;
  chunk_type: string;
}

export function IdeaToProjectWizard({ onComplete, onCancel }: {
  onComplete: (project: Project) => void;
  onCancel: () => void;
}) {
  const { presets, currentPresetId, switchPreset, currentPreset } = useSettings();
  const { create } = useProjects();

  const [step, setStep] = useState<WizardStep>("input");
  const [idea, setIdea] = useState("");
  const [directions, setDirections] = useState<IdeaDirection[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [thinkingContent, setThinkingContent] = useState("");
  const [streamedContent, setStreamedContent] = useState("");
  const unlistenRef = useRef<UnlistenFn[]>([]);

  const handleGenerateDirections = useCallback(async () => {
    if (!currentPreset || !idea.trim()) return;
    setGenerating(true);
    setThinkingContent("");
    setStreamedContent("");

    const sessionId = crypto.randomUUID();

    // Listen to streaming events
    const chunkUnlisten = await listen<AiChunkPayload>("ai-chunk", (event) => {
      if (event.payload.session_id !== sessionId) return;
      const { chunk, chunk_type } = event.payload;
      if (chunk_type === "thinking") {
        setThinkingContent(prev => prev + chunk);
      } else {
        setStreamedContent(prev => prev + chunk);
      }
    });

    const doneUnlisten = await listen<{ session_id: string }>("ai-done", (event) => {
      if (event.payload.session_id !== sessionId) return;
      setGenerating(false);
    });

    const errorUnlisten = await listen<{ session_id: string; error: string }>("ai-error", (event) => {
      if (event.payload.session_id !== sessionId) return;
      setGenerating(false);
      toast.error("生成方向候选失败", { description: event.payload.error });
    });

    unlistenRef.current = [chunkUnlisten, doneUnlisten, errorUnlisten];

    try {
      const result = await invoke<string>("generate_idea_directions", {
        idea: idea.trim(),
        presetId: currentPreset.id,
        sessionId,
      });

      // Parse the JSON result
      const parsed = JSON.parse(result) as { directions: IdeaDirection[] };
      if (parsed.directions && parsed.directions.length > 0) {
        setDirections(parsed.directions);
        setSelectedIdx(null);
        setStep("directions");
      } else {
        toast.error("AI 未返回有效的方向候选");
      }
    } catch (e) {
      toast.error("生成方向候选失败", { description: String(e) });
    } finally {
      setGenerating(false);
      unlistenRef.current.forEach(fn => fn());
      unlistenRef.current = [];
    }
  }, [currentPreset, idea]);

  const handleSelectDirection = (idx: number) => {
    setSelectedIdx(idx);
  };

  const handleConfirmDirection = useCallback(async () => {
    if (selectedIdx === null || !currentPreset || !directions[selectedIdx]) return;

    const direction = directions[selectedIdx];
    setStep("creating");

    try {
      // 1. Create project with direction title as name
      const project = await create(direction.title);

      // 2. Save project profile from direction
      await saveProjectProfile(project.id, {
        premise: direction.core_conflict,
        genre: direction.genre,
        target_audience: direction.target_audience,
        selling_point: direction.selling_point,
        reader_promise: direction.reader_promise,
        narrative_pov: "third_person",
        pace_preference: "balanced",
        default_chapter_length: 3000,
        estimated_chapter_count: 30,
      });

      // 3. Generate initial outline from direction
      const sessionId = crypto.randomUUID();
      const directionJson = JSON.stringify(direction);

      setThinkingContent("");
      setStreamedContent("");

      // Listen to streaming events for outline generation
      const chunkUnlisten = await listen<AiChunkPayload>("ai-chunk", (event) => {
        if (event.payload.session_id !== sessionId) return;
        const { chunk, chunk_type } = event.payload;
        if (chunk_type === "thinking") {
          setThinkingContent(prev => prev + chunk);
        } else {
          setStreamedContent(prev => prev + chunk);
        }
      });

      const doneUnlisten = await listen<{ session_id: string }>("ai-done", (event) => {
        if (event.payload.session_id !== sessionId) return;
      });

      const errorUnlisten = await listen<{ session_id: string; error: string }>("ai-error", (event) => {
        if (event.payload.session_id !== sessionId) return;
        toast.error("大纲生成失败", { description: event.payload.error });
      });

      unlistenRef.current = [chunkUnlisten, doneUnlisten, errorUnlisten];

      await invoke<string>("generate_outline_from_direction", {
        projectId: project.id,
        directionJson,
        presetId: currentPreset.id,
        sessionId,
      });

      // 4. Save the generated outline
      const cleaned = stripThinking(streamedContentRef.current);
      if (cleaned.trim()) {
        await saveOutline(project.id, cleaned);
      }

      unlistenRef.current.forEach(fn => fn());
      unlistenRef.current = [];

      toast.success("项目创建成功", { description: "已生成初始大纲，进入编辑" });
      onComplete(project);
    } catch (e) {
      toast.error("创建项目失败", { description: String(e) });
      setStep("directions");
    }
  }, [selectedIdx, directions, currentPreset, create, onComplete]);

  // Ref to access streamed content in callback
  const streamedContentRef = useRef("");
  streamedContentRef.current = streamedContent;

  return (
    <div className="flex items-center justify-center h-full p-10">
      <div className="w-[640px] rounded-3xl border border-border shadow-lg bg-card">
        {/* Header */}
        <div className="px-10 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">一句话开书</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            输入一句话灵感，AI 生成多个方向候选，选定后自动创建项目并生成初始大纲
          </p>
        </div>

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="px-10 py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">你的灵感</label>
              <Textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="例如：一个退休刑警在养老院发现连环命案，但没人相信他..."
                className="rounded-xl min-h-[80px] resize-none"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2">
              <ModelPresetSelect
                value={currentPresetId ?? null}
                presets={presets}
                onChange={(v) => switchPreset(v)}
                placeholder="选择模型"
              />
              <Button
                onClick={handleGenerateDirections}
                disabled={!idea.trim() || !currentPreset || generating}
                className="rounded-full px-4 py-2.5 gap-1.5"
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />生成中...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />生成方向</>
                )}
              </Button>
            </div>

            {generating && (
              <div className="rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground max-h-[200px] overflow-y-auto">
                {thinkingContent && (
                  <div className="mb-2 text-xs text-muted-foreground/70">
                    {thinkingContent.slice(-200)}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{streamedContent}</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={onCancel} className="rounded-full">
                取消
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Select Direction */}
        {step === "directions" && (
          <div className="px-10 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">选择一个方向</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStep("input"); setDirections([]); setSelectedIdx(null); }}
                className="rounded-full gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
            </div>

            {directions.map((dir, idx) => (
              <Card
                key={idx}
                className={`p-4 cursor-pointer transition-all rounded-2xl border-2 ${
                  selectedIdx === idx
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
                onClick={() => handleSelectDirection(idx)}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selectedIdx === idx ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                  }`}>
                    {selectedIdx === idx && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{dir.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{dir.genre}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{dir.selling_point}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div><span className="font-medium">目标读者：</span>{dir.target_audience}</div>
                      <div><span className="font-medium">核心冲突：</span>{dir.core_conflict}</div>
                      <div className="col-span-2"><span className="font-medium">前 30 章承诺：</span>{dir.reader_promise}</div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => { setStep("input"); setDirections([]); setSelectedIdx(null); }} className="rounded-full">
                取消
              </Button>
              <Button
                onClick={handleConfirmDirection}
                disabled={selectedIdx === null}
                className="rounded-full px-4 py-2.5 gap-1.5"
              >
                确认方向
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Creating */}
        {step === "creating" && (
          <div className="px-10 py-8 space-y-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-medium text-foreground">正在创建项目并生成初始大纲...</p>
              <p className="text-sm text-muted-foreground mt-1">这可能需要一分钟，请稍候</p>
            </div>
            {streamedContent && (
              <div className="rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground max-h-[200px] overflow-y-auto text-left">
                {thinkingContent && (
                  <div className="mb-2 text-xs text-muted-foreground/70">
                    {thinkingContent.slice(-200)}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{streamedContent}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
