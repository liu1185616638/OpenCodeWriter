import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCharacters } from "@/hooks/useCharacters";
import { useOutline } from "@/hooks/useOutline";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { StreamingView } from "@/components/shared/StreamingView";
import type { Project, Character, CharacterTier } from "@/types";
import { Sparkles, Trash2, ChevronDown, Square, Cpu, UserPlus, Shield, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
      <div className={`rounded-2xl border overflow-hidden ${isMain ? "border-border bg-card shadow-sm" : isSupporting ? "border-transparent bg-tile" : "border-transparent bg-accent"}`}>
        <CollapsibleTrigger className="flex min-w-0 items-center gap-2 w-full px-4 py-4 text-left transition-colors hover:bg-accent/50 sm:px-6">
          <TierIcon className={`h-5 w-5 shrink-0 ${tierColor}`} />
          <span className="min-w-0 truncate font-semibold text-foreground">{character.name}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${isMain ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {tierLabel}
          </span>
          {subtitle && !expanded && (
            <span className="ml-2 hidden min-w-0 flex-1 truncate text-right text-sm text-muted-foreground md:block">
              {subtitle}
            </span>
          )}
          <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
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

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newTier, setNewTier] = useState<CharacterTier>("supporting");

  useEffect(() => { load(); }, [load]);
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
    await generate("generate_character_from_description", {
      projectId: project.id,
      presetId: currentPreset.id,
      description: newDescription.trim(),
      tier: newTier,
    });
    load();
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Editor Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">人物小传</h2>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">维护主要角色、配角和关键人物关系</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-primary">生成中...</span>
            </>
          ) : `${characters.length} 个角色`}
        </span>
      </div>

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

      {/* Three-tier list — adaptive scroll area */}
      <ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-8 sm:py-5">
        <div className="space-y-6 pr-2 sm:pr-3">
          {generating && generatingStage === "characters" && (
            <StreamingView
              content={streamedContent}
              thinkingContent={thinkingContent}
              generating={generating}
            />
          )}

          {main.length > 0 && (
            <div className="space-y-2">
              <h3 className="px-2 text-sm font-semibold text-primary">主要角色</h3>
              {main.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
            </div>
          )}

          {supporting.length > 0 && (
            <div className="space-y-2">
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
      </ScrollArea>

      {/* Action Bar — AI + Model + 手动添加 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
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
        <div className="inline-flex h-10 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm text-secondary-foreground">
          <Cpu className="h-4 w-4 shrink-0" />
          <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
            <SelectTrigger className="h-auto w-[min(240px,55vw)] border-0 bg-transparent p-0 text-secondary-foreground focus:ring-0">
              <SelectValue placeholder="模型 ▼" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.model_name})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => setShowAddDialog(true)} className="rounded-full px-4 py-2.5 gap-1.5">
          <UserPlus className="h-4 w-4" />
          手动添加
        </Button>
      </div>

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
              disabled
              className="rounded-full gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              AI 生成（暂未开放）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
