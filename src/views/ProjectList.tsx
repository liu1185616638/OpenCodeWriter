import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useProjects } from "@/hooks/useProjects";
import type { Project, CreationStage } from "@/types";
import { CheckCircle2, Circle, BookOpen, Plus, ArrowRight, Sparkles } from "lucide-react";

const stageLabels: Record<CreationStage, string> = {
  outline: "大纲",
  characters: "人物",
  chapters: "目录",
  content: "正文",
  world: "世界观",
  knowledge: "知识库",
};

const stageOrder: CreationStage[] = ["outline", "characters", "chapters", "content"];

function getStageStatus(project: Project, stage: CreationStage): "done" | "active" | "pending" {
  const currentIndex = stageOrder.indexOf(project.current_stage as CreationStage);
  const stageIndex = stageOrder.indexOf(stage);
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "active";
  return "pending";
}

export function ProjectList({ onSelectProject, onStartIdeaWizard }: { onSelectProject: (project: Project) => void; onStartIdeaWizard: () => void; }) {
  const { projects, loading, create, remove } = useProjects();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteName, setDeleteName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await create(newName.trim());
      setNewName("");
      onSelectProject(project);
    } catch (e) {
      console.error("Failed to create project:", e);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      await remove(deleteId);
      setDeleteId(null);
      setDeleteName("");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="flex items-center justify-center h-full p-10">
      <div className="w-[600px] rounded-3xl border border-border shadow-lg bg-card">
        {/* Card Header — matches design: Welcome title + description */}
        <div className="px-10 pt-6 pb-4">
          <h2 className="text-xl font-semibold text-foreground">欢迎回来</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            选择左侧项目继续创作，或创建新项目开始你的故事
          </p>
        </div>

        {/* Card Content — Stage progress for each project */}
        <div className="px-10 py-4 space-y-3">
          {projects.length > 0 && (
            <p className="text-sm font-medium text-foreground">创作进度</p>
          )}
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-3 p-4 rounded-2xl hover:bg-accent cursor-pointer group transition-colors"
              onClick={() => onSelectProject(project)}
            >
              <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground">{project.name}</span>
              <div className="flex gap-2 ml-auto">
                {stageOrder.map((stage) => {
                  const status = getStageStatus(project, stage);
                  return (
                    <span
                      key={stage}
                      className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full ${
                        status === "done" || status === "active"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {status === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                      {stageLabels[stage]}
                    </span>
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 text-destructive rounded-full ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteId(project.id);
                  setDeleteName(project.name);
                }}
              >
                删除
              </Button>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              还没有项目，点击下方按钮开始创作
            </p>
          )}
        </div>

        {/* Card Actions — matches design: Continue + New Project buttons + shortcut */}
        <div className="flex items-center gap-2 px-10 py-4">
          {projects.length > 0 && (
            <Button
              className="rounded-full px-4 py-2.5 gap-1.5"
              onClick={() => {
                const lastProject = projects[projects.length - 1];
                if (lastProject) onSelectProject(lastProject);
              }}
            >
              <ArrowRight className="h-4 w-4" />
              继续创作
            </Button>
          )}
          <Button
            variant="secondary"
            className="rounded-full px-4 py-2.5 gap-1.5"
            onClick={onStartIdeaWizard}
          >
            <Sparkles className="h-4 w-4" />
            一句话开书
          </Button>
          <Button
            variant="outline"
            className="rounded-full px-4 py-2.5 gap-1.5"
            onClick={() => {
              // Focus the input for creating
              const input = document.querySelector<HTMLInputElement>("#new-project-input");
              if (input) input.focus();
            }}
          >
            <Plus className="h-4 w-4" />
            新建项目
          </Button>
          <span className="text-xs text-muted-foreground ml-1">Ctrl+N 新建</span>
        </div>

        {/* Inline new project input */}
        <div className="flex items-center gap-2 px-10 pb-6">
          <Input
            id="new-project-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="输入项目名称"
            className="rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded-full px-4"
          >
            创建
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p>确定要删除项目 "{deleteName}" 吗？所有关联数据将一并删除。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="rounded-full">取消</Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-full">删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
