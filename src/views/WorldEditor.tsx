import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorldItems } from "@/hooks/useWorldItems";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import type { Project, WorldItemType } from "@/types";
import { Plus, Trash2, ChevronDown, MapPin, Swords, Scroll, Clock, Calendar, Package } from "lucide-react";
import { toast } from "sonner";

const itemTypes: { key: WorldItemType; label: string; icon: React.ElementType }[] = [
  { key: "location", label: "地点", icon: MapPin },
  { key: "faction", label: "势力", icon: Swords },
  { key: "rule", label: "规则", icon: Scroll },
  { key: "history", label: "历史", icon: Clock },
  { key: "timeline", label: "时间线", icon: Calendar },
  { key: "object", label: "物件", icon: Package },
];

const typeIcon: Record<string, React.ElementType> = Object.fromEntries(itemTypes.map(t => [t.key, t.icon]));

export function WorldEditor({ project }: { project: Project }) {
  const { items, loading, load, create, update, remove } = useWorldItems(project.id);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newType, setNewType] = useState<WorldItemType>("location");
  const [newName, setNewName] = useState("");

  useEffect(() => { load(); }, [load]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await create(newType, newName.trim());
    setNewName("");
    setShowAddDialog(false);
    toast.success("已创建");
  }, [create, newType, newName]);

  // Group items by type
  const grouped = itemTypes.map(({ key, label, icon: Icon }) => ({
    key, label, Icon,
    items: items.filter(i => i.item_type === key),
  }));

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <WorkspacePageLayout
      title="世界观"
      description="维护地点、势力、规则、历史、时间线和物件"
      status={<EditorStatusText generating={false} idleLabel={`${items.length} 个条目`} />}
      actionBar={
        <EditorActionBar>
          <Button onClick={() => setShowAddDialog(true)} className="rounded-full px-4 py-2.5 gap-1.5">
            <Plus className="h-4 w-4" />
            新增条目
          </Button>
        </EditorActionBar>
      }
    >
      <AppScrollArea>
        <div className="w-full min-w-0 max-w-full space-y-4 px-4 py-4 sm:px-6">
          {grouped.map(({ key, label, Icon, items: groupItems }) => (
            <Collapsible key={key} defaultOpen={groupItems.length > 0}>
              <CollapsibleTrigger className="flex items-center gap-2 px-2 py-1 text-sm font-semibold text-foreground">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
                <span className="text-xs text-muted-foreground">（{groupItems.length}）</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {groupItems.map(item => (
                  <WorldItemCard
                    key={item.id}
                    item={item}
                    onUpdate={async (fields) => { await update(item.id, fields); }}
                    onDelete={() => remove(item.id)}
                  />
                ))}
                {groupItems.length === 0 && (
                  <p className="px-2 py-2 text-sm text-muted-foreground">暂无{label}条目</p>
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}
          {items.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">暂无世界观条目，点击「新增条目」开始创建</p>
          )}
        </div>
      </AppScrollArea>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增世界观条目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">类型</label>
              <Select value={newType} onValueChange={(v) => setNewType(v as WorldItemType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {itemTypes.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">名称</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="条目名称"
                className="mt-1"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">取消</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()} className="rounded-full">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageLayout>
  );
}

function WorldItemCard({ item, onUpdate, onDelete }: {
  item: import("@/types").WorldItem;
  onUpdate: (fields: Partial<Pick<import("@/types").WorldItem, 'name' | 'description' | 'rules'>>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editDesc, setEditDesc] = useState(item.description);
  const [editRules, setEditRules] = useState(item.rules);
  const [dirty, setDirty] = useState(false);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    await onUpdate({ name: editName, description: editDesc, rules: editRules });
    setDirty(false);
    setExpanded(false);
  };

  const handleExpand = (open: boolean) => {
    if (open) {
      setEditName(item.name);
      setEditDesc(item.description);
      setEditRules(item.rules);
      setDirty(false);
    }
    setExpanded(open);
  };

  const TypeIcon = typeIcon[item.item_type] || Package;

  return (
    <Collapsible open={expanded} onOpenChange={handleExpand}>
      <div className="w-full min-w-0 rounded-2xl border border-border bg-card overflow-hidden">
        <CollapsibleTrigger className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50">
          <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/50 px-4 py-3">
            <div>
              <label className="text-xs text-muted-foreground">名称</label>
              <Input value={editName} onChange={(e) => { setEditName(e.target.value); markDirty(); }} className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">描述</label>
              <Textarea value={editDesc} onChange={(e) => { setEditDesc(e.target.value); markDirty(); }} className="app-scrollbar mt-1 min-h-[80px] resize-y text-sm" placeholder="描述这个条目..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">规则/约束</label>
              <Textarea value={editRules} onChange={(e) => { setEditRules(e.target.value); markDirty(); }} className="app-scrollbar mt-1 min-h-[60px] resize-y text-sm" placeholder="这个世界元素有什么规则或约束..." />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={!dirty} className="rounded-full">保存</Button>
              <Button size="sm" variant="destructive" onClick={onDelete} className="rounded-full">
                <Trash2 className="h-3 w-3" />删除
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
