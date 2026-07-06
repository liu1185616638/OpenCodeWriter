import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useKnowledge } from "@/hooks/useKnowledge";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import { StreamingView } from "@/components/shared/StreamingView";
import type { Project } from "@/types";
import { Plus, Trash2, ChevronDown, Search, BookOpen, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";

const sourceTypes = [
  { key: "reference", label: "参考资料" },
  { key: "worldbuilding", label: "世界观设定" },
  { key: "character", label: "人物原型" },
  { key: "plot", label: "情节模板" },
  { key: "style", label: "写作风格" },
  { key: "other", label: "其他" },
];

const typeLabel: Record<string, string> = Object.fromEntries(sourceTypes.map(t => [t.key, t.label]));

export function KnowledgeEditor({ project }: { project: Project }) {
  const { sources, searchResults, loading, load, import: importSource, remove, search } = useKnowledge(project.id);
  const { currentPreset } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, generate, cancel } = useAI();

  const [showImport, setShowImport] = useState(false);
  const [importTitle, setImportTitle] = useState("");
  const [importType, setImportType] = useState("reference");
  const [importContent, setImportContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => { load(); }, [load]);

  const handleImport = useCallback(async () => {
    if (!importTitle.trim() || !importContent.trim()) return;
    await importSource(importTitle.trim(), importType, importContent.trim());
    setImportTitle(""); setImportContent(""); setImportType("reference");
    setShowImport(false);
    toast.success("资料已导入");
  }, [importTitle, importType, importContent, importSource]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setShowSearch(true);
    await search(searchQuery.trim(), 10);
  }, [searchQuery, search]);

  const handleAnalyze = useCallback(async (content: string) => {
    if (!currentPreset) return;
    await generate({
      command: "analyze_text",
      stage: "analyze",
      args: {
        projectId: project.id,
        content,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        toast.success("分析完成");
      },
      onError: (err) => {
        toast.error("分析失败", { description: err });
      },
    });
  }, [currentPreset, generate, project.id]);

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <WorkspacePageLayout
      title="知识库"
      description="导入参考资料，支持全文检索和拆书分析"
      status={<EditorStatusText generating={generating} idleLabel={`${sources.length} 份资料`} />}
      alerts={generating && generatingStage === "analyze" ? (
        <div className="mx-4 mb-2 sm:mx-6">
          <StreamingView content={streamedContent} thinkingContent={thinkingContent} generating={generating} />
        </div>
      ) : null}
      actionBar={
        <EditorActionBar>
          {generating && generatingStage === "analyze" ? (
            <Button variant="destructive" onClick={cancel} className="rounded-full px-4 py-2.5 gap-1.5">
              <Square className="h-4 w-4" />停止
            </Button>
          ) : null}
          <Button onClick={() => setShowImport(true)} className="rounded-full px-4 py-2.5 gap-1.5">
            <Plus className="h-4 w-4" />
            导入资料
          </Button>
        </EditorActionBar>
      }
    >
      <AppScrollArea>
        <div className="w-full min-w-0 max-w-full space-y-4 px-4 py-4 sm:px-6">
          {/* Search bar */}
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="搜索知识库..."
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSearch} className="rounded-full gap-1.5">
              <Search className="h-4 w-4" />搜索
            </Button>
            {showSearch && (
              <Button variant="ghost" onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="rounded-full">
                清除
              </Button>
            )}
          </div>

          {/* Search results */}
          {showSearch && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">搜索结果（{searchResults.length}）</h3>
              {searchResults.map((chunk, i) => (
                <div key={i} className="rounded-2xl border border-border bg-accent p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{typeLabel[chunk.source_type] || chunk.source_type}</Badge>
                    <span className="font-medium">{chunk.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{chunk.content}</p>
                </div>
              ))}
              {searchResults.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">未找到匹配的资料</p>
              )}
            </div>
          )}

          {/* Sources list */}
          {!showSearch && (
            <>
              {sources.map(source => (
                <Collapsible key={source.id}>
                  <div className="w-full min-w-0 rounded-2xl border border-border bg-card overflow-hidden">
                    <CollapsibleTrigger className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50">
                      <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="grid min-w-0 gap-0.5">
                        <span className="min-w-0 truncate font-medium text-foreground">{source.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {typeLabel[source.source_type] || source.source_type} · {source.chunk_count} 个片段
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border/50 px-4 py-3">
                        <div className="mb-3 max-h-48 overflow-y-auto app-scrollbar text-sm text-muted-foreground whitespace-pre-wrap">
                          {source.raw_content.slice(0, 1000)}
                          {source.raw_content.length > 1000 && "..."}
                        </div>
                        <div className="flex gap-2">
                          {currentPreset && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAnalyze(source.raw_content)}
                              disabled={generating}
                              className="rounded-full gap-1.5"
                            >
                              <Sparkles className="h-3 w-3" />
                              AI 拆书分析
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => remove(source.id)} className="rounded-full gap-1.5">
                            <Trash2 className="h-3 w-3" />删除
                          </Button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
              {sources.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">
                  暂无资料，点击「导入资料」开始添加<br/>
                  支持粘贴文本或导入 txt/md 内容
                </p>
              )}
            </>
          )}
        </div>
      </AppScrollArea>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入资料</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">标题</label>
                <Input
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder="资料标题"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">类型</label>
                <Select value={importType} onValueChange={setImportType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sourceTypes.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">内容（长文本将自动切分为片段以便检索）</label>
              <Textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                placeholder="粘贴资料内容，或导入的 txt/md 文本..."
                className="app-scrollbar mt-1 min-h-[240px] resize-y text-sm"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)} className="rounded-full">取消</Button>
            <Button onClick={handleImport} disabled={!importTitle.trim() || !importContent.trim()} className="rounded-full">导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageLayout>
  );
}
