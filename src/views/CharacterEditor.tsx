import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCharacters } from "@/hooks/useCharacters";
import { useOutline } from "@/hooks/useOutline";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { FlowGuide } from "@/components/flow/FlowGuide";
import { StreamingView } from "@/components/shared/StreamingView";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { ModelPresetSelect } from "@/components/editor/ModelPresetSelect";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import type { Project, Character, CharacterTier } from "@/types";
import { Sparkles, Trash2, ChevronDown, Square, UserPlus, Shield, Star, Heart, Users } from "lucide-react";
import { toast } from "sonner";
import { useCharacterAssets } from "@/hooks/useCharacterAssets";
import { Badge } from "@/components/ui/badge";

const tierLabels: Record<CharacterTier, string> = {
  main: "主角",
  supporting: "配角",
  minor: "其他",
};

const tierIcons: Record<CharacterTier, React.ElementType> = {
  main: Star,
  supporting: Shield,
  minor: UserPlus,
};

const tierColors: Record<CharacterTier, string> = {
  main: "text-primary",
  supporting: "text-foreground",
  minor: "text-muted-foreground",
};

const multilineFields = new Set(["appearance", "personality", "motivation", "relationships", "key_events"]);

function CharacterField({
  fieldKey,
  value,
  onChange,
  placeholder,
}: {
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const shouldMultiline = multilineFields.has(fieldKey) || value.length > 48 || value.includes("\n");

  if (shouldMultiline) {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="app-scrollbar min-h-[76px] max-h-[240px] resize-y overflow-y-auto bg-background text-sm leading-6"
      />
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-background text-sm"
    />
  );
}

function CharacterCard({ character, onUpdate, onDelete }: {
  character: Character;
  onUpdate: (id: number, fields: Record<string, string>) => Promise<Character>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const handleSave = async () => {
    await onUpdate(character.id, editing);
    setEditing({});
    setExpanded(false);
  };

  const fields: { key: string; label: string; placeholder: string }[] = [
    { key: "identity", label: "身份", placeholder: "角色身份" },
    { key: "appearance", label: "外貌", placeholder: "外貌描写" },
    { key: "personality", label: "性格", placeholder: "性格特征" },
    { key: "motivation", label: "动机", placeholder: "角色动机" },
    { key: "relationships", label: "关系", placeholder: "人物关系" },
    { key: "key_events", label: "关键事件", placeholder: "关键事件" },
  ];

  const TierIcon = tierIcons[character.tier as CharacterTier] || UserPlus;
  const tierLabel = tierLabels[character.tier as CharacterTier] || character.tier;
  const tierColor = tierColors[character.tier as CharacterTier] || "text-muted-foreground";

  const identity = character.identity || editing.identity || "";
  const motivation = character.motivation || editing.motivation || "";
  const subtitleParts = [identity && `身份：${identity}`, motivation && `动机：${motivation}`].filter(Boolean);
  const subtitle = subtitleParts.join(" | ");

  const isMain = character.tier === "main";
  const isSupporting = character.tier === "supporting";

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className={`w-full min-w-0 rounded-2xl border overflow-hidden ${isMain ? "border-border bg-card shadow-sm" : isSupporting ? "border-transparent bg-tile" : "border-transparent bg-accent"}`}>
        <CollapsibleTrigger className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent/50 sm:px-6">
          <TierIcon className={`h-5 w-5 shrink-0 ${tierColor}`} />
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="max-w-40 shrink-0 truncate font-semibold text-foreground sm:max-w-56 lg:max-w-72" title={character.name}>
                {character.name}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${isMain ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {tierLabel}
              </span>
            </div>
            {subtitle && !expanded && (
              <span className="block min-w-0 truncate text-sm text-muted-foreground" title={subtitle}>
                {subtitle}
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/50 px-4 py-4 sm:px-6">
            {fields.map(({ key, label, placeholder }) => (
              <div key={key} className="grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-start">
                <label className="pt-2 text-xs text-muted-foreground">{label}</label>
                <div className="min-w-0">
                  <CharacterField
                    fieldKey={key}
                    value={editing[key] ?? (character[key as keyof Character] as string) ?? ""}
                    onChange={(v) => setEditing(prev => ({ ...prev, [key]: v }))}
                    placeholder={placeholder}
                  />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={handleSave} className="rounded-full">保存</Button>
              <Button size="sm" variant="destructive" className="rounded-full" onClick={() => onDelete(character.id)}>
                <Trash2 className="h-3 w-3" />删除
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function CharacterEditor({ project }: { project: Project }) {
  const { characters, main, supporting, minor, loading, load, update, remove } = useCharacters(project.id);
  const { outline, load: loadOutline } = useOutline(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel } = useAI();
  const { relations, states, load: loadAssets, createRelation, removeRelation, removeState } = useCharacterAssets(project.id);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newTier, setNewTier] = useState<CharacterTier>("supporting");
  const [activeTab, setActiveTab] = useState<"characters" | "relations" | "states">("characters");
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [newRelSource, setNewRelSource] = useState<number | null>(null);
  const [newRelTarget, setNewRelTarget] = useState<number | null>(null);
  const [newRelType, setNewRelType] = useState("");

  useEffect(() => { load(); loadAssets(); }, [load, loadAssets]);
  useEffect(() => { loadOutline(); }, [loadOutline]);

  const outlineEmpty = !outline || outline.status === "empty" || !outline.content;

  const handleGenerate = useCallback(async () => {
    if (!currentPreset) return;
    await generate({
      command: "generate_characters",
      stage: "characters",
      args: {
        projectId: project.id,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        load();
        toast.success("人物已生成");
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [currentPreset, generate, project.id, load]);

  const handleGenerateFromDescription = useCallback(async () => {
    if (!currentPreset || !newDescription.trim()) return;
    await generate({
      command: "generate_character_from_description",
      stage: "characters",
      args: {
        projectId: project.id,
        presetId: currentPreset.id,
        description: newDescription.trim(),
        tier: newTier,
      },
      onComplete: () => {
        load();
        toast.success("人物已生成并保存");
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
    setNewDescription("");
    setShowAddDialog(false);
  }, [currentPreset, generate, project.id, newDescription, newTier, load]);

  useAppEvents({
    onGenerate: handleGenerate,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  const alertsContent = (
    <>
      <FlowGuide stage="characters" input={{ outlineContent: outline?.content, characterCount: characters.length }} />
      <StaleAlert projectId={project.id} targetType="characters" onRegenerate={handleGenerate} />
      {outlineEmpty && (
        <div className="mx-4 mb-2 sm:mx-6">
          <Alert>
            <AlertDescription>请先完成大纲编写，再进行人物设计</AlertDescription>
          </Alert>
        </div>
      )}
      {error && (
        <div className="mx-4 mb-2 sm:mx-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );

  const actionBarContent = (
    <EditorActionBar>
      {generating ? (
        <Button variant="destructive" onClick={cancel} className="rounded-full px-4 py-2.5 gap-1.5">
          <Square className="h-4 w-4" />停止生成
        </Button>
      ) : (
        <Button onClick={handleGenerate} disabled={!currentPreset || outlineEmpty} className="rounded-full px-4 py-2.5 gap-1.5">
          <Sparkles className="h-4 w-4" />
          AI 生成人物
        </Button>
      )}
      <ModelPresetSelect
        value={currentPresetId ?? null}
        presets={presets}
        onChange={(v) => switchPreset(v)}
        placeholder="选择模型"
      />
      {!generating && (
        <Button variant="outline" onClick={() => setShowAddDialog(true)} className="rounded-full px-4 py-2.5 gap-1.5">
          <UserPlus className="h-4 w-4" />
          手动添加
        </Button>
      )}
    </EditorActionBar>
  );

  return (
    <WorkspacePageLayout
      title="人物小传"
      description="维护主要角色、配角和关键人物关系"
      status={<EditorStatusText generating={generating} idleLabel={`${characters.length} 个角色`} />}
      alerts={alertsContent}
      actionBar={actionBarContent}
    >
      {/* Tab switcher */}
      <div className="flex gap-1 px-4 pt-2 sm:px-6">
        <Button
          size="sm"
          variant={activeTab === "characters" ? "default" : "ghost"}
          onClick={() => setActiveTab("characters")}
          className="rounded-full gap-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" />人物
        </Button>
        <Button
          size="sm"
          variant={activeTab === "relations" ? "default" : "ghost"}
          onClick={() => setActiveTab("relations")}
          className="rounded-full gap-1.5"
        >
          <Users className="h-3.5 w-3.5" />关系
        </Button>
        <Button
          size="sm"
          variant={activeTab === "states" ? "default" : "ghost"}
          onClick={() => setActiveTab("states")}
          className="rounded-full gap-1.5"
        >
          <Heart className="h-3.5 w-3.5" />状态
        </Button>
      </div>

      {activeTab === "characters" && (
      <AppScrollArea>
        <div className="w-full min-w-0 max-w-full space-y-6">
          {generating && generatingStage === "characters" && (
            <StreamingView
              content={streamedContent}
              thinkingContent={thinkingContent}
              generating={generating}
            />
          )}

          {main.length > 0 && (
            <div className="w-full min-w-0 space-y-2">
              <h3 className="px-2 text-sm font-semibold text-primary">主要角色</h3>
              {main.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
            </div>
          )}

          {supporting.length > 0 && (
            <div className="w-full min-w-0 space-y-2">
              <h3 className="px-2 text-sm font-semibold text-foreground">重要配角</h3>
              {supporting.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
            </div>
          )}

          {minor.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 px-2 py-1 text-sm font-semibold text-muted-foreground">
                <ChevronDown className="h-4 w-4" />
                其他角色（已折叠）
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {minor.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
              </CollapsibleContent>
            </Collapsible>
          )}

          {characters.length === 0 && !generating && (
            <p className="py-8 text-center text-muted-foreground">暂无人物，点击 AI 生成或手动添加</p>
          )}
        </div>
      </AppScrollArea>
      )}

      {activeTab === "relations" && (
        <AppScrollArea>
          <div className="w-full min-w-0 max-w-full space-y-4 px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">角色关系</h3>
              <Button size="sm" variant="outline" onClick={() => setShowAddRelation(!showAddRelation)} className="rounded-full gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />添加关系
              </Button>
            </div>

            {showAddRelation && (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-muted-foreground">角色 A</label>
                    <Select value={String(newRelSource ?? "")} onValueChange={(v) => setNewRelSource(Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="选择" /></SelectTrigger>
                      <SelectContent>
                        {characters.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">角色 B</label>
                    <Select value={String(newRelTarget ?? "")} onValueChange={(v) => setNewRelTarget(Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="选择" /></SelectTrigger>
                      <SelectContent>
                        {characters.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">关系类型</label>
                    <Input value={newRelType} onChange={(e) => setNewRelType(e.target.value)} placeholder="如：师徒、仇敌、恋人" className="mt-1" />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!newRelSource || !newRelTarget || !newRelType.trim()}
                  onClick={async () => {
                    await createRelation(newRelSource!, newRelTarget!, newRelType.trim());
                    setNewRelSource(null); setNewRelTarget(null); setNewRelType("");
                    setShowAddRelation(false);
                    toast.success("关系已创建");
                  }}
                  className="rounded-full"
                >创建</Button>
              </div>
            )}

            {relations.map(rel => {
              const source = characters.find(c => c.id === rel.source_character_id);
              const target = characters.find(c => c.id === rel.target_character_id);
              return (
                <div key={rel.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{source?.name || "?"}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{target?.name || "?"}</span>
                      <Badge variant="secondary" className="text-xs">{rel.relation_type || "未分类"}</Badge>
                      {rel.tension && <Badge variant="destructive" className="text-xs">{rel.tension}</Badge>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeRelation(rel.id)} className="rounded-full h-7 w-7 p-0">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {rel.summary && <p className="mt-1 text-xs text-muted-foreground">{rel.summary}</p>}
                </div>
              );
            })}

            {relations.length === 0 && !showAddRelation && (
              <p className="py-8 text-center text-muted-foreground">暂无角色关系，点击「添加关系」开始创建</p>
            )}
          </div>
        </AppScrollArea>
      )}

      {activeTab === "states" && (
        <AppScrollArea>
          <div className="w-full min-w-0 max-w-full space-y-4 px-4 py-4 sm:px-6">
            <h3 className="text-sm font-semibold text-foreground">角色状态</h3>
            {states.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">暂无角色状态记录<br/>执行章节后护理后可自动提取</p>
            )}
            {states.map(st => {
              const char = characters.find(c => c.id === st.character_id);
              return (
                <div key={st.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{char?.name || "未知角色"}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeState(st.id)} className="rounded-full h-7 w-7 p-0">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {st.state_summary && <p>状态：{st.state_summary}</p>}
                    {st.goal && <p>目标：{st.goal}</p>}
                    {st.emotion && <p>情绪：{st.emotion}</p>}
                    {st.location && <p>位置：{st.location}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </AppScrollArea>
      )}

      {/* New character dialog — description-first approach */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加人物</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">描述你想要的角色</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="例如：一个冷酷的帝国将军，表面效忠皇帝但暗中策划推翻..."
                className="app-scrollbar mt-1 min-h-[120px] resize-y"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">角色层级</label>
              <Select value={newTier} onValueChange={(v) => setNewTier(v as CharacterTier)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="选择层级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">主角</SelectItem>
                  <SelectItem value="supporting">配角</SelectItem>
                  <SelectItem value="minor">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">取消</Button>
            <Button
              onClick={handleGenerateFromDescription}
              disabled={!currentPreset || !newDescription.trim()}
              className="rounded-full gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              AI 生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageLayout>
  );
}
