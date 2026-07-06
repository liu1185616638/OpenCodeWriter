import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAI } from "@/contexts/AIContext";
import { useSettings } from "@/hooks/useSettings";
import { useStoryAssets } from "@/hooks/useStoryAssets";
import { useCharacters } from "@/hooks/useCharacters";
import { stripThinking } from "@/components/shared/StreamingView";
import { createStoryFact, createForeshadow, createCharacterState } from "@/lib/tauri";
import { HeartPulse, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/types";

interface AftercareResult {
  new_facts: { fact_type: string; content: string }[];
  character_states: {
    character_name: string;
    state_summary: string;
    goal: string;
    emotion: string;
    location: string;
  }[];
  new_characters: { name: string; identity: string; reason: string }[];
  foreshadows: { content: string; action: string }[];
  next_chapter_hook: string;
}

interface AftercarePanelProps {
  project: Project;
  chapterId: number | null;
  hasContent: boolean;
}

export function AftercarePanel({ project, chapterId, hasContent }: AftercarePanelProps) {
  const { generating, streamedContent, generatingStage, generate, cancel } = useAI();
  const { currentPreset } = useSettings();
  const { facts, foreshadows, load: loadAssets } = useStoryAssets(project.id);
  const { characters, load: loadCharacters } = useCharacters(project.id);

  const [result, setResult] = useState<AftercareResult | null>(null);
  const [acceptedItems, setAcceptedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAssets();
    loadCharacters();
  }, [loadAssets, loadCharacters]);

  // Parse aftercare result when generation completes
  useEffect(() => {
    if (!generating && generatingStage === "aftercare" && streamedContent) {
      const cleaned = stripThinking(streamedContent);
      try {
        // Find JSON in the response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as AftercareResult;
          setResult(parsed);
          setAcceptedItems(new Set());
        } else {
          toast.error("后护理结果解析失败：未找到 JSON");
        }
      } catch {
        toast.error("后护理结果解析失败");
      }
    }
  }, [generating, generatingStage, streamedContent]);

  const handleAftercare = useCallback(async () => {
    if (!currentPreset || !chapterId) return;
    setResult(null);
    await generate({
      command: "chapter_aftercare",
      stage: "aftercare",
      args: {
        projectId: project.id,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        toast.success("后护理完成");
      },
      onError: (err) => {
        toast.error("后护理失败", { description: err });
      },
    });
  }, [currentPreset, chapterId, project.id, generate]);

  const handleAcceptFact = useCallback(async (index: number, fact: { fact_type: string; content: string }) => {
    const key = `fact-${index}`;
    try {
      await createStoryFact(project.id, fact.fact_type, fact.content, chapterId);
      setAcceptedItems(prev => new Set(prev).add(key));
      loadAssets();
      toast.success("事实已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    }
  }, [project.id, chapterId, loadAssets]);

  const handleAcceptForeshadow = useCallback(async (index: number, foreshadow: { content: string; action: string }) => {
    const key = `foreshadow-${index}`;
    try {
      if (foreshadow.action === "payoff") {
        // For payoff, update existing setup foreshadows to resolved
        // For now, create a new one with payoff status
        await createForeshadow(project.id, foreshadow.content, chapterId);
      } else {
        await createForeshadow(project.id, foreshadow.content, chapterId);
      }
      setAcceptedItems(prev => new Set(prev).add(key));
      loadAssets();
      toast.success("伏笔已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    }
  }, [project.id, chapterId, loadAssets]);

  const handleAcceptCharacterState = useCallback(async (index: number, state: {
    character_name: string;
    state_summary: string;
    goal: string;
    emotion: string;
    location: string;
  }) => {
    const key = `state-${index}`;
    // Match character by name
    const character = characters.find(c => c.name === state.character_name);
    if (!character) {
      toast.error(`未找到角色「${state.character_name}」，请先在人物页创建`);
      return;
    }
    try {
      await createCharacterState({
        projectId: project.id,
        characterId: character.id,
        chapterId,
        stateSummary: state.state_summary,
        goal: state.goal,
        emotion: state.emotion,
        location: state.location,
      });
      setAcceptedItems(prev => new Set(prev).add(key));
      toast.success("角色状态已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    }
  }, [project.id, chapterId, characters]);

  const isAftercaring = generating && generatingStage === "aftercare";

  if (!chapterId) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        选择章节后执行后护理
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">后护理</span>
        {isAftercaring ? (
          <Button size="sm" variant="destructive" onClick={cancel} className="rounded-full gap-1.5">
            <X className="h-3 w-3" />停止
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleAftercare}
            disabled={!currentPreset || !hasContent}
            className="rounded-full gap-1.5"
          >
            <HeartPulse className="h-3 w-3" />
            执行后护理
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Streaming view during generation */}
          {isAftercaring && (
            <div className="text-sm text-muted-foreground">
              <div className="animate-pulse">正在分析章节内容...</div>
            </div>
          )}

          {/* Aftercare results */}
          {result && (
            <>
              {/* New Facts */}
              {result.new_facts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">新增事实</h4>
                  {result.new_facts.map((fact, i) => {
                    const key = `fact-${i}`;
                    const accepted = acceptedItems.has(key);
                    return (
                      <div key={key} className="rounded-xl border border-border bg-card p-3 text-sm">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{fact.fact_type}</Badge>
                          {accepted && <Badge className="text-xs bg-green-500">已接受</Badge>}
                        </div>
                        <p className="mb-2 text-foreground">{fact.content}</p>
                        {!accepted && (
                          <Button size="sm" variant="outline" onClick={() => handleAcceptFact(i, fact)} className="rounded-full gap-1.5 h-7 text-xs">
                            <Check className="h-3 w-3" />接受
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Character States */}
              {result.character_states.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">角色状态变化</h4>
                  {result.character_states.map((state, i) => {
                    const key = `state-${i}`;
                    const accepted = acceptedItems.has(key);
                    return (
                      <div key={key} className="rounded-xl border border-border bg-card p-3 text-sm">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-medium">{state.character_name}</span>
                          {accepted && <Badge className="text-xs bg-green-500">已接受</Badge>}
                        </div>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          {state.state_summary && <p>状态：{state.state_summary}</p>}
                          {state.goal && <p>目标：{state.goal}</p>}
                          {state.emotion && <p>情绪：{state.emotion}</p>}
                          {state.location && <p>位置：{state.location}</p>}
                        </div>
                        {!accepted && (
                          <Button size="sm" variant="outline" onClick={() => handleAcceptCharacterState(i, state)} className="mt-2 rounded-full gap-1.5 h-7 text-xs">
                            <Check className="h-3 w-3" />接受
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New Characters */}
              {result.new_characters.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">新人物候选</h4>
                  {result.new_characters.map((char, i) => (
                    <div key={`newchar-${i}`} className="rounded-xl border border-border bg-card p-3 text-sm">
                      <div className="mb-1 font-medium">{char.name}</div>
                      <p className="text-xs text-muted-foreground">{char.identity}</p>
                      <p className="mt-1 text-xs text-muted-foreground">建议理由：{char.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground italic">请前往人物页手动创建</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Foreshadows */}
              {result.foreshadows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">伏笔</h4>
                  {result.foreshadows.map((fs, i) => {
                    const key = `foreshadow-${i}`;
                    const accepted = acceptedItems.has(key);
                    return (
                      <div key={key} className="rounded-xl border border-border bg-card p-3 text-sm">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {fs.action === "setup" ? "埋设" : "回收"}
                          </Badge>
                          {accepted && <Badge className="text-xs bg-green-500">已接受</Badge>}
                        </div>
                        <p className="mb-2 text-foreground">{fs.content}</p>
                        {!accepted && (
                          <Button size="sm" variant="outline" onClick={() => handleAcceptForeshadow(i, fs)} className="rounded-full gap-1.5 h-7 text-xs">
                            <Check className="h-3 w-3" />接受
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Next Chapter Hook */}
              {result.next_chapter_hook && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">下一章衔接建议</h4>
                  <div className="rounded-xl border border-border bg-accent p-3 text-sm">
                    {result.next_chapter_hook}
                  </div>
                </div>
              )}

              {result.new_facts.length === 0 && result.character_states.length === 0 &&
                result.new_characters.length === 0 && result.foreshadows.length === 0 &&
                !result.next_chapter_hook && (
                <p className="text-center text-sm text-muted-foreground">后护理未提取到任何内容</p>
              )}
            </>
          )}

          {/* Existing assets */}
          {!isAftercaring && !result && (
            <>
              {facts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">已知事实（最近 {facts.length} 条）</h4>
                  {facts.map(fact => (
                    <div key={fact.id} className="rounded-xl border border-border bg-card p-2 text-sm">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="secondary" className="text-xs">{fact.fact_type}</Badge>
                      </div>
                      <p className="text-foreground text-xs">{fact.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {foreshadows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">伏笔追踪</h4>
                  {foreshadows.map(fs => (
                    <div key={fs.id} className="rounded-xl border border-border bg-card p-2 text-sm">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {fs.status === "setup" ? "已埋设" : fs.status === "payoff" ? "已回收" : fs.status}
                        </Badge>
                      </div>
                      <p className="text-foreground text-xs">{fs.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {facts.length === 0 && foreshadows.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  暂无故事资产<br/>生成正文后点击「执行后护理」提取
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
