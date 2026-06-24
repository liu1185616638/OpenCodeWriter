import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

function hasLineBreaks(text: string): boolean {
  return text.includes("\n");
}

function SmartInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [multiline, setMultiline] = useState(hasLineBreaks(value));

  const handleChange = (v: string) => {
    onChange(v);
    if (hasLineBreaks(v)) {
      setMultiline(true);
    }
  };

  if (multiline) {
    return (
      <Textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[60px] resize-none text-sm bg-background"
      />
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      className="text-sm bg-background"
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

  // Build subtitle: "身份：... | 动机：..."
  const identity = character.identity || editing.identity || "";
  const motivation = character.motivation || editing.motivation || "";
  const subtitleParts = [identity && `身份：${identity}`, motivation && `动机：${motivation}`].filter(Boolean);
  const subtitle = subtitleParts.join(" | ");

  const isMain = character.tier === "main";
  const isSupporting = character.tier === "supporting";

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className={`rounded-2xl border overflow-hidden ${isMain ? "border-border bg-card shadow-sm" : isSupporting ? "border-transparent bg-tile" : "border-transparent bg-accent"}`}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-6 py-4 hover:bg-accent/50 transition-colors">
          <TierIcon className={`h-5 w-5 shrink-0 ${tierColor}`} />
          <span className="font-semibold text-foreground">{character.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isMain ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {tierLabel}
          </span>
          {subtitle && !expanded && (
            <span className="text-sm text-muted-foreground ml-2 truncate flex-1 text-right">
              {subtitle}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto shrink-0 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 py-3 space-y-2 border-t border-border/50">
            {fields.map(({ key, label, placeholder }) => (
              <div key={key} className="flex items-start gap-3">
                <label className="text-xs text-muted-foreground w-14 shrink-0 pt-2">{label}</label>
                <div className="flex-1">
                  <SmartInput
                    value={editing[key] ?? (character[key as keyof Character] as string) ?? ""}
                    onChange={(v) => setEditing(prev => ({ ...prev, [key]: v }))}
                    placeholder={placeholder}
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
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
  const { generating, error, generate, cancel } = useAI();
  // thinkingContent available but not used for non-text editors

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

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">人物小传</h2>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              <span className="text-primary">生成中...</span>
            </>
          ) : `${characters.length} 个角色`}
        </span>
      </div>

      <StaleAlert projectId={project.id} targetType="characters" onRegenerate={handleGenerate} />

      {outlineEmpty && (
        <div className="mx-6 mb-2">
          <Alert>
            <AlertDescription>请先完成大纲编写，再进行人物设计</AlertDescription>
          </Alert>
        </div>
      )}

      {error && (
        <div className="mx-6 mb-2">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Three-tier list — matches design */}
      <div className="flex-1 px-8 py-5 overflow-auto space-y-6">
        {main.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-primary px-2">主要角色</h3>
            {main.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
          </div>
        )}

        {supporting.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground px-2">重要配角</h3>
            {supporting.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
          </div>
        )}

        {minor.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-muted-foreground px-2 py-1">
              <ChevronDown className="h-4 w-4" />
              其他角色（已折叠）
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {minor.map(c => <CharacterCard key={c.id} character={c} onUpdate={update} onDelete={remove} />)}
            </CollapsibleContent>
          </Collapsible>
        )}

        {characters.length === 0 && !generating && (
          <p className="text-muted-foreground text-center py-8">暂无人物，点击 AI 生成或手动添加</p>
        )}
      </div>

      {/* Action Bar — matches design: AI + Model + 手动添加 */}
      <div className="flex items-center gap-2 px-6 py-2">
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
        <Button variant="secondary" className="rounded-full px-4 py-2.5 gap-1.5">
          <Cpu className="h-4 w-4" />
          <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
            <SelectTrigger className="border-0 bg-transparent p-0 h-auto w-auto focus:ring-0 text-secondary-foreground">
              <SelectValue placeholder="模型 ▼" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.model_name})</SelectItem>)}
            </SelectContent>
          </Select>
        </Button>
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
                className="min-h-[100px] resize-none mt-1"
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
              disabled={!newDescription.trim() || !currentPreset}
              className="rounded-full gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              AI 生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
