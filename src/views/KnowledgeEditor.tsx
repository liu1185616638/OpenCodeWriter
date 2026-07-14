/**
 * KnowledgeEditor — 知识库工作区 (Phase G)
 *
 * 增强：
 * - 文件导入（txt/md）
 * - 资料列表、详情、搜索结果分区
 * - 显示分块数、来源类型、导入时间
 * - 召回记录（最近生成日志）
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useKnowledge } from "@/hooks/useKnowledge";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import { StreamingView } from "@/components/shared/StreamingView";
import { listGenerationLogs } from "@/lib/tauri";
import type { Project, GenerationLog } from "@/types";
import { Plus, Trash2, ChevronDown, Search, BookOpen, Sparkles, Square, Upload, FileText, Clock } from "lucide-react";
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
  const [activeSection, setActiveSection] = useState<"sources" | "search" | "recall">("sources");
  const [recentLogs, setRecentLogs] = useState<GenerationLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [load]);

  // Load recent generation logs as recall records
  useEffect(() => {
    listGenerationLogs(project.id, 10).then(setRecentLogs).catch(() => {});
  }, [project.id, generating]);

  const handleImport = useCallback(async () => {
    if (!importTitle.trim() || !importContent.trim()) return;
    await importSource(importTitle.trim(), importType, importContent.trim());
    setImportTitle(""); setImportContent(""); setImportType("reference");
    setShowImport(false);
    toast.success("资料已导入");
  }, [importTitle, importType, importContent, importSource]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast.error("文件内容为空");
        return;
      }
      const fileName = file.name.replace(/\.[^.]+$/, "");
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext && !["txt", "md", "markdown", "text"].includes(ext)) {
        toast.warning("仅支持 txt/md 文件");
        return;
      }
      await importSource(fileName, "reference", text);
      toast.success(`已导入文件：${file.name}`);
    } catch (err) {
      toast.error("文件导入失败", { description: String(err) });
    } finally {
      // Reset input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [importSource]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setShowSearch(true);
    setActiveSection("search");
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.text"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Upload className="h-4 w-4" />
            导入文件
          </Button>
          <Button onClick={() => setShowImport(true)} className="rounded-full px-4 py-2.5 gap-1.5">
            <Plus className="h-4 w-4" />
            粘贴资料
          </Button>
        </EditorActionBar>
      }
    >
      <AppScrollArea>
        <div className="w-full min-w-0 max-w-full space-y-4 px-4 py-4 sm:px-6">
          {/* Section tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            {([
              { key: "sources", label: `资料列表 (${sources.length})` },
              { key: "search", label: "搜索" },
              { key: "recall", label: "召回记录" },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeSection === tab.key
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sources list section */}
          {activeSection === "sources" && (
            <>
              {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                  <BookOpen className="h-8 w-8 opacity-50" />
                  <p className="text-sm">暂无资料</p>
                  <p className="text-xs">点击「导入文件」选择 txt/md 文件，或「粘贴资料」手动添加</p>
                </div>
              ) : (
                sources.map(source => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    onAnalyze={handleAnalyze}
                    onDelete={() => remove(source.id)}
                    canAnalyze={!!currentPreset && !generating}
                  />
                ))
              )}
            </>
          )}

          {/* Search section */}
          {activeSection === "search" && (
            <div className="space-y-3">
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
              </div>
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">搜索结果（{searchResults.length}）</h3>
                  {searchResults.map((chunk, i) => (
                    <div key={i} className="rounded-lg border border-border bg-accent p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{typeLabel[chunk.source_type] || chunk.source_type}</Badge>
                        <span className="font-medium">{chunk.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              ) : showSearch ? (
                <p className="py-4 text-center text-sm text-muted-foreground">未找到匹配的资料</p>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">输入关键词搜索知识库</p>
              )}
            </div>
          )}

          {/* Recall records section */}
          {activeSection === "recall" && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">最近生成记录</h3>
              <p className="text-xs text-muted-foreground mb-2">
                以下记录展示了 AI 生成时可能引用了知识库内容的历史调用
              </p>
              {recentLogs.length > 0 ? (
                recentLogs.map(log => (
                  <div key={log.id} className="rounded-lg border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">{log.command}</Badge>
                      <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-xs">
                        {log.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(log.started_at).toLocaleString("zh-CN")}
                      </span>
                      {log.model_name && <span>{log.model_name}</span>}
                      <span>输入 {log.input_chars} 字 / 输出 {log.output_chars} 字</span>
                    </div>
                    {log.error && <p className="text-xs text-destructive">{log.error}</p>}
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无生成记录</p>
              )}
            </div>
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

// ── Source Card Component ─────────────────────────────────────

function SourceCard({
  source,
  onAnalyze,
  onDelete,
  canAnalyze,
}: {
  source: import("@/types").KnowledgeSource;
  onAnalyze: (content: string) => void;
  onDelete: () => void;
  canAnalyze: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const charCount = source.raw_content.length;

  return (
    <div className="w-full min-w-0 rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
        onClick={() => setExpanded(!expanded)}
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="grid min-w-0 gap-0.5">
          <span className="min-w-0 truncate font-medium text-foreground">{source.title}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {typeLabel[source.source_type] || source.source_type}
            </Badge>
            <span>{source.chunk_count} 个片段</span>
            <span>{charCount.toLocaleString()} 字</span>
            <span>{new Date(source.created_at).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          {/* Content preview */}
          <div className="max-h-48 overflow-y-auto app-scrollbar text-sm text-muted-foreground whitespace-pre-wrap rounded-md bg-muted/30 p-3">
            {source.raw_content.slice(0, 2000)}
            {source.raw_content.length > 2000 && "\n\n... (内容已截断)"}
          </div>

          {/* Import metadata */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>创建时间：{new Date(source.created_at).toLocaleString("zh-CN")}</span>
            <span>ID: {source.id}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {canAnalyze && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAnalyze(source.raw_content)}
                className="rounded-full gap-1.5"
              >
                <Sparkles className="h-3 w-3" />
                AI 拆书分析
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={onDelete} className="rounded-full gap-1.5">
              <Trash2 className="h-3 w-3" />删除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
