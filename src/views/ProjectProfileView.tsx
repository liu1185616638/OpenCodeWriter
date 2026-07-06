import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import { getProjectProfile, saveProjectProfile } from "@/lib/tauri";
import type { Project } from "@/types";
import { Save } from "lucide-react";
import { toast } from "sonner";

const narrativePovOptions = [
  { value: "first_person", label: "第一人称" },
  { value: "third_person", label: "第三人称" },
  { value: "omniscient", label: "全知视角" },
];

const paceOptions = [
  { value: "fast", label: "快节奏" },
  { value: "balanced", label: "均衡" },
  { value: "slow", label: "慢热" },
];

export function ProjectProfileView({ project }: { project: Project }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);

  // Edit state
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [sellingPoint, setSellingPoint] = useState("");
  const [readerPromise, setReaderPromise] = useState("");
  const [narrativePov, setNarrativePov] = useState("third_person");
  const [pacePreference, setPacePreference] = useState("balanced");
  const [defaultChapterLength, setDefaultChapterLength] = useState(3000);
  const [estimatedChapterCount, setEstimatedChapterCount] = useState(30);

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjectProfile(project.id);
        setPremise(p.premise);
        setGenre(p.genre);
        setTargetAudience(p.target_audience);
        setSellingPoint(p.selling_point);
        setReaderPromise(p.reader_promise);
        setNarrativePov(p.narrative_pov);
        setPacePreference(p.pace_preference);
        setDefaultChapterLength(p.default_chapter_length);
        setEstimatedChapterCount(p.estimated_chapter_count);
      } catch {
        // Profile doesn't exist yet — use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [project.id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveProjectProfile(project.id, {
        premise,
        genre,
        target_audience: targetAudience,
        selling_point: sellingPoint,
        reader_promise: readerPromise,
        narrative_pov: narrativePov,
        pace_preference: pacePreference,
        default_chapter_length: defaultChapterLength,
        estimated_chapter_count: estimatedChapterCount,
      });
      setEdited(false);
      toast.success("项目设定已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [project.id, premise, genre, targetAudience, sellingPoint, readerPromise, narrativePov, pacePreference, defaultChapterLength, estimatedChapterCount]);

  const markEdited = () => setEdited(true);

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  const saved = !saving && !edited;

  return (
    <WorkspacePageLayout
      title="项目设定"
      description="设定题材、卖点、目标读者和叙事偏好，AI 生成时自动注入"
      status={<EditorStatusText generating={false} saved={saved} />}
      actionBar={
        <EditorActionBar>
          <Button
            onClick={handleSave}
            disabled={saving || !edited}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Save className="h-4 w-4" />
            保存
          </Button>
        </EditorActionBar>
      }
    >
      <AppScrollArea>
        <div className="space-y-6 px-6 py-4 max-w-2xl">
          {/* 核心设定 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">核心设定</h3>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">题材类型</label>
              <Input
                value={genre}
                onChange={(e) => { setGenre(e.target.value); markEdited(); }}
                placeholder="如：都市悬疑、仙侠、科幻..."
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">一句话前提（Premise）</label>
              <Textarea
                value={premise}
                onChange={(e) => { setPremise(e.target.value); markEdited(); }}
                placeholder="用一句话概括故事核心：谁，在什么情况下，要做什么，面临什么阻碍"
                className="rounded-xl min-h-[60px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">核心卖点</label>
              <Input
                value={sellingPoint}
                onChange={(e) => { setSellingPoint(e.target.value); markEdited(); }}
                placeholder="一句话说明为什么读者会追这本书"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">目标读者</label>
              <Input
                value={targetAudience}
                onChange={(e) => { setTargetAudience(e.target.value); markEdited(); }}
                placeholder="如：18-30岁男性，喜欢快节奏都市文"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">前 30 章承诺</label>
              <Textarea
                value={readerPromise}
                onChange={(e) => { setReaderPromise(e.target.value); markEdited(); }}
                placeholder="前 30 章承诺给读者的体验：什么爽点、什么期待、什么情感"
                className="rounded-xl min-h-[60px] resize-none"
              />
            </div>
          </div>

          {/* 创作偏好 */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground">创作偏好</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">叙事视角</label>
                <Select value={narrativePov} onValueChange={(v) => { setNarrativePov(v); markEdited(); }}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {narrativePovOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">节奏偏好</label>
                <Select value={pacePreference} onValueChange={(v) => { setPacePreference(v); markEdited(); }}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paceOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">默认章节字数</label>
                <Input
                  type="number"
                  value={defaultChapterLength}
                  onChange={(e) => { setDefaultChapterLength(Number(e.target.value)); markEdited(); }}
                  className="rounded-xl"
                  min={500}
                  max={10000}
                  step={500}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">预计章节数</label>
                <Input
                  type="number"
                  value={estimatedChapterCount}
                  onChange={(e) => { setEstimatedChapterCount(Number(e.target.value)); markEdited(); }}
                  className="rounded-xl"
                  min={5}
                  max={500}
                  step={5}
                />
              </div>
            </div>
          </div>
        </div>
      </AppScrollArea>
    </WorkspacePageLayout>
  );
}
