# 2026-06-29 P0 使用舒适性与便捷性逐步开发计划

## 0. 本文目标

本文把 P0 拆成可以一步步完成的开发任务，目标是让 OpenCodeWriter 从“基础功能可用”升级为“日常长时间写作舒服、AI 生成可控、内容不容易丢失、流程提示清晰”的版本。

P0 不建议一次性大改，而是按以下 4 条主线推进：

1. **统一布局、滚动、自适应、底部操作栏**。
2. **AI 生成过程可控化**。
3. **自动保存与版本快照**。
4. **下一步引导与过时原因解释**。

建议版本名：`v0.2.0-comfort-p0`。

---

## 1. 当前代码基础判断

### 1.1 前端技术基础

当前项目是 React 19 + Vite + Tauri 2 桌面应用，`package.json` 已包含：

- `react` / `react-dom`
- `@tauri-apps/api`
- `radix-ui`
- `lucide-react`
- `sonner`
- `streamdown`
- `tailwindcss`

所以 P0 不需要引入大量新依赖，优先基于现有组件体系重构体验。

### 1.2 当前主流程

当前 `App.tsx` 的视图结构已经很清楚：

```ts
AppView = "setup" | "project-list" | "workspace" | "settings"
CreationStage = "outline" | "characters" | "chapters" | "content"
```

工作区根据阶段切换：

```tsx
outline    -> OutlineEditor
characters -> CharacterEditor
chapters   -> ChapterEditor
content    -> ContentEditor
```

说明基础业务链路已经完成，下一步重点不是继续堆新模块，而是把现有页面打磨成统一、稳定、舒服的桌面工作台。

### 1.3 当前 AI 基础

`AIContext` 已经支持：

- `generating`
- `streamedContent`
- `thinkingContent`
- `error`
- `generatingStage`
- `generate()`
- `cancel()`

这说明 P0 的 AI 体验增强可以在现有上下文上加状态，不需要重写 AI 调用链。

### 1.4 当前数据库基础

当前数据库已有：

- `model_presets`
- `projects`
- `outlines`
- `characters`
- `chapters`
- `contents`
- `stale_markers`
- `style_configs`
- `settings`

P0 需要新增的表建议控制在两个以内：

- `content_snapshots`
- `generation_logs`

---

## 2. 开发前准备

### 2.1 新建开发分支

```bash
git checkout master
git pull origin master
git checkout -b feature/p0-comfort-experience
```

### 2.2 本地启动与构建检查

```bash
npm install
npm run dev
```

完成每个小阶段后执行：

```bash
npm run build
```

如果涉及 Tauri 后端改动，再执行：

```bash
npm run tauri dev
```

### 2.3 每个阶段提交一次

建议拆成 5 个提交：

```bash
git commit -m "feat(ui): add shared workspace layout components"
git commit -m "refactor(editor): unify stage editor layout"
git commit -m "feat(ai): add controlled generation flow"
git commit -m "feat(snapshot): add autosave and snapshots"
git commit -m "feat(flow): add next-step guidance and stale reason"
```

---

# 第一部分：统一布局、滚动、自适应、底部操作栏

## 3. 目标

当前大纲、人物、目录、正文页面都有自己的标题区、滚动区、底部操作栏、模型选择器。短期能跑，长期会导致体验不一致和维护困难。

本阶段目标是抽象统一编辑器布局，让所有阶段页面共享同一套骨架。

---

## 4. 新增目录结构

建议新增：

```text
src/components/editor/
  WorkspacePageLayout.tsx
  EditorActionBar.tsx
  ModelPresetSelect.tsx
  ResponsiveSplitPane.tsx
  EditorStatusText.tsx

src/components/shared/
  AppScrollArea.tsx
  EmptyState.tsx
```

---

## 5. 新增 AppScrollArea

### 5.1 文件

新增：

```text
src/components/shared/AppScrollArea.tsx
```

### 5.2 目标

统一所有页面滚动体验，避免每个页面都重复写：

```tsx
<ScrollArea className="min-h-0 min-w-0 flex-1 px-4 py-4 sm:px-8 sm:py-5">
```

### 5.3 建议实现

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";

interface AppScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  padded?: boolean;
}

export function AppScrollArea({
  children,
  className,
  contentClassName,
  padded = true,
}: AppScrollAreaProps) {
  return (
    <ScrollArea
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-x-hidden",
        padded && "px-4 py-4 sm:px-8 sm:py-5",
        className,
      )}
    >
      <div className={cn("min-h-full w-full min-w-0 pr-2 sm:pr-3", contentClassName)}>
        {children}
      </div>
    </ScrollArea>
  );
}
```

### 5.4 替换范围

优先替换：

- `OutlineEditor.tsx`
- `CharacterEditor.tsx`
- `ChapterEditor.tsx`
- `ContentEditor.tsx`
- `Settings.tsx` 中大的滚动容器可以后续再替换

### 5.5 验收标准

- 暗色模式滚动条不突兀。
- 横向不会出现意外滚动条。
- 页面内容不会被底部操作栏遮挡。
- 主内容区滚动，标题和底部操作栏固定。

---

## 6. 新增 WorkspacePageLayout

### 6.1 文件

新增：

```text
src/components/editor/WorkspacePageLayout.tsx
```

### 6.2 目标

统一四个编辑页面的结构：

```text
页面容器
  顶部标题区
  可选提示区
  主内容区
  错误区
  底部操作栏
```

### 6.3 建议实现

```tsx
import { cn } from "@/lib/cn";

interface WorkspacePageLayoutProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
  alerts?: React.ReactNode;
  children: React.ReactNode;
  error?: React.ReactNode;
  actionBar?: React.ReactNode;
  className?: string;
}

export function WorkspacePageLayout({
  title,
  description,
  status,
  alerts,
  children,
  error,
  actionBar,
  className,
}: WorkspacePageLayoutProps) {
  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{description}</p>
          ) : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>

      {alerts ? <div className="shrink-0">{alerts}</div> : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {children}
      </div>

      {error ? <div className="shrink-0 px-4 pb-2 text-sm text-destructive sm:px-6">{error}</div> : null}

      {actionBar ? (
        <div className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6">
          {actionBar}
        </div>
      ) : null}
    </div>
  );
}
```

### 6.4 先迁移 OutlineEditor

先只迁移 `OutlineEditor.tsx`，确认无问题后再迁移其他页面。

迁移前：

```tsx
return (
  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    ...
  </div>
)
```

迁移后：

```tsx
return (
  <WorkspacePageLayout
    title="大纲"
    status={<EditorStatusText generating={generating} saved={saved} />}
    alerts={<StaleAlert projectId={project.id} targetType="outline" />}
    error={error}
    actionBar={<OutlineActionBar ... />}
  >
    <AppScrollArea>
      ...
    </AppScrollArea>
  </WorkspacePageLayout>
)
```

### 6.5 验收标准

- 大纲页面视觉不退化。
- 保存状态显示正常。
- AI 生成中状态正常。
- 底部按钮仍可使用。
- `npm run build` 通过。

---

## 7. 新增 EditorActionBar

### 7.1 文件

新增：

```text
src/components/editor/EditorActionBar.tsx
```

### 7.2 目标

统一底部操作栏，避免四个页面重复写：

- AI 生成按钮
- 停止生成按钮
- 模型选择
- 保存按钮
- 润色按钮
- 手动添加按钮

### 7.3 建议实现

```tsx
import { cn } from "@/lib/cn";

interface EditorActionBarProps {
  children: React.ReactNode;
  className?: string;
}

export function EditorActionBar({ children, className }: EditorActionBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
```

这个组件先保持简单，只统一布局，不强行封装所有按钮逻辑。

### 7.4 验收标准

- 大纲、人物、目录、正文底部按钮高度一致。
- 小窗口下按钮自动换行。
- 模型选择不会挤压主按钮。

---

## 8. 新增 ModelPresetSelect

### 8.1 文件

新增：

```text
src/components/editor/ModelPresetSelect.tsx
```

### 8.2 目标

当前四个页面都有类似模型选择代码，应抽成一个组件。

### 8.3 建议实现

```tsx
import { Cpu } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModelPreset } from "@/types";

interface ModelPresetSelectProps {
  value: number | null | undefined;
  presets: ModelPreset[];
  onChange: (id: number) => void;
  placeholder?: string;
}

export function ModelPresetSelect({
  value,
  presets,
  onChange,
  placeholder = "选择模型",
}: ModelPresetSelectProps) {
  return (
    <div className="inline-flex h-10 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm text-secondary-foreground">
      <Cpu className="h-4 w-4 shrink-0" />
      <Select value={String(value ?? "")} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-auto w-[min(240px,55vw)] border-0 bg-transparent p-0 text-secondary-foreground focus:ring-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name} ({p.model_name})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### 8.4 替换范围

替换：

- `OutlineEditor.tsx`
- `CharacterEditor.tsx`
- `ChapterEditor.tsx`
- `ContentEditor.tsx`

### 8.5 验收标准

- 四个阶段模型选择显示一致。
- `Ctrl+M` 切换模型仍正常。
- 没有模型时，AI 生成按钮仍禁用。

---

## 9. 新增 ResponsiveSplitPane

### 9.1 文件

新增：

```text
src/components/editor/ResponsiveSplitPane.tsx
```

### 9.2 目标

目录和正文都有“左侧列表 + 右侧编辑区”的结构。当前左侧固定宽度，窗口变小时容易挤压右侧。

### 9.3 建议实现

```tsx
import { cn } from "@/lib/cn";

interface ResponsiveSplitPaneProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarClassName?: string;
  contentClassName?: string;
}

export function ResponsiveSplitPane({
  sidebar,
  children,
  sidebarClassName,
  contentClassName,
}: ResponsiveSplitPaneProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex-row">
      <div
        className={cn(
          "max-h-48 shrink-0 border-b border-border md:max-h-none md:w-56 md:border-b-0 md:border-r",
          sidebarClassName,
        )}
      >
        {sidebar}
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
```

### 9.4 先迁移 ContentEditor

正文页最能体现收益。先将：

```tsx
<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
```

改成：

```tsx
<ResponsiveSplitPane sidebar={...chapterList...}>
  ...editor...
</ResponsiveSplitPane>
```

### 9.5 验收标准

- 宽屏下仍是左右分栏。
- 小窗口下变成上下布局。
- 左侧章节列表不会把正文区域挤没。
- 章节列表可独立滚动。

---

## 10. 第一部分完成后的页面迁移顺序

不要四个页面一起改，按下面顺序：

1. `OutlineEditor.tsx`：最简单，用来验证 `WorkspacePageLayout`。
2. `ContentEditor.tsx`：验证 `ResponsiveSplitPane`。
3. `ChapterEditor.tsx`：复用分栏能力。
4. `CharacterEditor.tsx`：处理人物卡片自适应。

每迁移一个页面，都执行：

```bash
npm run build
```

---

# 第二部分：AI 生成过程可控化

## 11. 目标

当前 AI 可以生成、流式显示、取消和显示错误，但缺少这些体验：

- 生成前是否覆盖已有内容？
- 停止生成后已生成内容怎么办？
- 失败后怎么恢复？
- 用户如何知道生成了多久、多少字、用的是哪个模型？

本阶段目标是把 AI 生成从“按钮触发”升级为“可控任务”。

---

## 12. 新增 AI 类型定义

### 12.1 文件

新增：

```text
src/types/ai.ts
```

### 12.2 建议内容

```ts
export type GenerationApplyMode = "replace" | "append" | "draft";

export type GenerationStatus =
  | "idle"
  | "confirming"
  | "generating"
  | "cancelled"
  | "failed"
  | "completed";

export interface GenerationTaskMeta {
  stage?: string;
  command?: string;
  presetId?: number;
  modelName?: string;
  startedAt?: number;
  endedAt?: number;
  applyMode?: GenerationApplyMode;
}
```

---

## 13. 扩展 AIContext

### 13.1 修改文件

```text
src/contexts/AIContext.tsx
```

### 13.2 增加状态

在 `AiContextValue` 中增加：

```ts
generationStatus: GenerationStatus;
generationMeta: GenerationTaskMeta | null;
generatedCharCount: number;
elapsedMs: number;
lastError: string | null;
lastGeneratedContent: string;
resetGeneration: () => void;
```

### 13.3 实现要点

1. `generate()` 开始时记录：

```ts
setGenerationStatus("generating");
setGenerationMeta({
  stage,
  command,
  startedAt: Date.now(),
});
```

2. `streamedContent` 更新时同步字数：

```ts
setGeneratedCharCount(next.length);
```

3. `ai-done` 时记录完成：

```ts
setGenerationStatus("completed");
setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : prev);
```

4. `ai-error` 时记录失败：

```ts
setGenerationStatus("failed");
setLastError(event.payload.error);
```

5. `cancel()` 时不要清空内容：

```ts
setGenerationStatus("cancelled");
setLastGeneratedContent(streamedContentRef.current);
```

### 13.4 注意点

当前 `cancel()` 只是前端停止监听和状态切换，如果后端没有真正中断请求，后续可以再做后端取消。P0 先保证“前端停止后已有内容不丢失”。

---

## 14. 新增 GenerateConfirmDialog

### 14.1 文件

```text
src/components/ai/GenerateConfirmDialog.tsx
```

### 14.2 目标

当当前编辑区已有内容时，点击 AI 生成不要直接清空，而是让用户选择。

### 14.3 建议交互

弹窗标题：

```text
生成方式
```

选项：

```text
替换当前内容
追加到当前内容后面
保存为草稿，不覆盖当前内容
```

按钮：

```text
取消
开始生成
```

### 14.4 建议实现方式

先只在大纲和正文做：

- 大纲：已有 `content.trim()` 时弹出。
- 正文：已有 `text.trim()` 时弹出。

人物和目录属于结构化生成，可以第二轮加。

---

## 15. 新增 GenerationStatusBar

### 15.1 文件

```text
src/components/ai/GenerationStatusBar.tsx
```

### 15.2 目标

在生成过程中展示清晰状态。

### 15.3 建议显示

```text
生成中 · 正文 · 当前模型：xxx · 1,280 字 · 00:38
```

### 15.4 建议 props

```ts
interface GenerationStatusBarProps {
  stageLabel?: string;
  modelName?: string;
  charCount: number;
  elapsedMs: number;
  status: GenerationStatus;
}
```

---

## 16. 新增 GenerationRecoveryPanel

### 16.1 文件

```text
src/components/ai/GenerationRecoveryPanel.tsx
```

### 16.2 目标

处理失败或取消后的下一步。

### 16.3 失败时显示

```text
生成失败
[重试] [切换模型重试] [复制错误]
```

### 16.4 停止后显示

```text
已停止生成，当前已生成 1,280 字
[保存已生成内容] [丢弃] [继续生成]
```

### 16.5 第一版可以先做

- 保存已生成内容
- 丢弃
- 复制错误
- 重试

“继续生成”可以先预留按钮，后续实现。

---

## 17. 修改生成调用方式

### 17.1 以 OutlineEditor 为例

当前逻辑：

```ts
setContent("");
await generate(...)
```

建议改成：

```ts
if (content.trim()) {
  setShowGenerateConfirm(true);
  return;
}
startGenerate("replace");
```

然后：

```ts
const startGenerate = async (applyMode: GenerationApplyMode) => {
  if (!currentPreset || generating) return;

  if (applyMode === "replace") setContent("");

  await generate({
    command: "generate_outline",
    stage: "outline",
    args: {
      projectId: project.id,
      presetId: currentPreset.id,
      applyMode,
    },
    onComplete: (generated) => {
      if (applyMode === "append") {
        const next = `${content}\n\n${generated}`;
        setContent(next);
        save(next);
      }
    },
  });
};
```

### 17.2 第一版建议只完整支持 replace 和 append

`draft` 可以先创建 UI，但暂时提示：

```text
草稿模式将在快照功能完成后启用
```

等第三部分 `content_snapshots` 完成后再接入。

---

## 18. 第二部分验收标准

- 有内容时点击 AI 生成，不会直接清空。
- 用户可以选择替换或追加。
- 生成中能看到阶段、模型、字数、耗时。
- 停止生成后已生成内容仍在界面上。
- 失败后可以复制错误和重试。
- `npm run build` 通过。

---

# 第三部分：自动保存与版本快照

## 19. 目标

让用户不用担心内容丢失。

P0 的保存策略：

1. 手动编辑自动保存。
2. AI 生成前自动快照。
3. AI 润色前自动快照。
4. 用户可以查看最近快照并恢复。

---

## 20. 新增数据库表

### 20.1 修改文件

```text
src-tauri/src/db/migrations.rs
```

### 20.2 新增 MIGRATION_002

```rust
const MIGRATION_002: &str = "
CREATE TABLE IF NOT EXISTS content_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_snapshots_target
ON content_snapshots(project_id, target_type, target_id, created_at);

CREATE TABLE IF NOT EXISTS generation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  command TEXT NOT NULL,
  model_name TEXT DEFAULT '',
  status TEXT NOT NULL,
  error TEXT DEFAULT '',
  input_chars INTEGER DEFAULT 0,
  output_chars INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);
";
```

### 20.3 修改 run

```rust
pub fn run(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(MIGRATION_001)?;
    conn.execute_batch(MIGRATION_002)?;
    Ok(())
}
```

当前项目没有 migration version 表，P0 先继续使用 `CREATE TABLE IF NOT EXISTS`，后续再补正式迁移版本管理。

---

## 21. 新增快照后端命令

### 21.1 新增文件

```text
src-tauri/src/commands/snapshots.rs
```

### 21.2 建议命令

```rust
#[tauri::command]
pub fn create_snapshot(
    state: State<DbState>,
    project_id: i64,
    target_type: String,
    target_id: Option<i64>,
    content: String,
    reason: String,
) -> Result<i64, String> {}

#[tauri::command]
pub fn list_snapshots(
    state: State<DbState>,
    project_id: i64,
    target_type: String,
    target_id: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<ContentSnapshot>, String> {}

#[tauri::command]
pub fn delete_old_snapshots(
    state: State<DbState>,
    project_id: i64,
    target_type: String,
    target_id: Option<i64>,
    keep: i64,
) -> Result<(), String> {}
```

### 21.3 注册命令

修改：

```text
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
```

在 `lib.rs` 的 `invoke_handler` 中增加：

```rust
commands::snapshots::create_snapshot,
commands::snapshots::list_snapshots,
commands::snapshots::delete_old_snapshots,
```

---

## 22. 新增前端封装

### 22.1 修改文件

```text
src/lib/tauri.ts
```

### 22.2 新增方法

```ts
export async function createSnapshot(params: {
  projectId: number;
  targetType: string;
  targetId?: number | null;
  content: string;
  reason: string;
}) {
  return invoke<number>("create_snapshot", params);
}

export async function listSnapshots(params: {
  projectId: number;
  targetType: string;
  targetId?: number | null;
  limit?: number;
}) {
  return invoke<ContentSnapshot[]>("list_snapshots", params);
}
```

---

## 23. 新增 useAutosave

### 23.1 文件

```text
src/hooks/useAutosave.ts
```

### 23.2 目标

统一处理输入后自动保存。

### 23.3 建议实现

```ts
import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

interface UseAutosaveOptions {
  value: string;
  enabled: boolean;
  delay?: number;
  onSave: (value: string) => Promise<void>;
}

export function useAutosave({ value, enabled, delay = 800, onSave }: UseAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const lastSavedRef = useRef(value);

  useEffect(() => {
    if (!enabled) return;
    if (value === lastSavedRef.current) return;

    setStatus("dirty");
    const timer = window.setTimeout(async () => {
      setStatus("saving");
      try {
        await onSave(value);
        lastSavedRef.current = value;
        setStatus("saved");
      } catch {
        setStatus("failed");
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, enabled, delay, onSave]);

  return status;
}
```

### 23.4 先接入 OutlineEditor 和 ContentEditor

大纲：

```ts
const autosaveStatus = useAutosave({
  value: content,
  enabled: !generating && !loading,
  onSave: save,
});
```

正文：

```ts
const autosaveStatus = useAutosave({
  value: text,
  enabled: Boolean(selectedChapterId) && !generating,
  onSave: async (value) => save(project.id, value),
});
```

### 23.5 注意

刚加载服务端内容时不要立即触发自动保存。可以在 `useAutosave` 内用 `lastSavedRef` 初始化规避，也可以在页面加载后手动同步。

---

## 24. 新增 SnapshotPanel

### 24.1 文件

```text
src/components/editor/SnapshotPanel.tsx
```

### 24.2 目标

允许用户查看和恢复最近快照。

### 24.3 第一版入口

先放在底部操作栏：

```text
[历史版本]
```

点击弹窗显示最近 10 条：

```text
2026-06-29 10:20  AI 生成前
2026-06-29 10:31  润色前
2026-06-29 10:45  手动保存
```

每条支持：

```text
预览
恢复
```

---

## 25. 快照触发策略

### 25.1 AI 生成前

大纲：

```ts
if (content.trim()) {
  await createSnapshot({
    projectId: project.id,
    targetType: "outline",
    targetId: null,
    content,
    reason: "AI 生成前",
  });
}
```

正文：

```ts
if (selectedChapterId && text.trim()) {
  await createSnapshot({
    projectId: project.id,
    targetType: "content",
    targetId: selectedChapterId,
    content: text,
    reason: "AI 生成前",
  });
}
```

### 25.2 润色前

正文和目录润色前都创建快照。

### 25.3 手动保存前

可选。P0 第一版可以只做 AI 操作前快照。

---

## 26. 第三部分验收标准

- 手动编辑大纲后 800ms 左右自动保存。
- 手动编辑正文后自动保存。
- AI 生成前自动产生快照。
- 润色前自动产生快照。
- 可以打开历史版本弹窗。
- 可以恢复历史版本。
- 恢复后自动保存当前内容。
- `npm run build` 和 `npm run tauri dev` 通过。

---

# 第四部分：下一步引导与过时原因解释

## 27. 目标

让用户始终知道：

- 我现在在哪一步？
- 下一步应该做什么？
- 为什么这个内容过时？
- 重新生成会影响什么？

---

## 28. 新增 FlowGuide

### 28.1 文件

```text
src/components/flow/FlowGuide.tsx
```

### 28.2 输入

```ts
interface FlowGuideProps {
  stage: CreationStage;
  hasOutline?: boolean;
  characterCount?: number;
  chapterCount?: number;
  selectedChapterId?: number | null;
}
```

### 28.3 文案规则

大纲阶段：

```text
先完成故事核心设定、主线冲突和结局方向。完成后进入人物设计。
```

人物阶段：

```text
根据大纲补全主要角色、动机和关系。人物完成后进入章节目录。
```

目录阶段：

```text
根据大纲和人物拆分章节节奏。目录完成后进入正文创作。
```

正文阶段：

```text
选择左侧章节后生成或编辑正文。建议每章完成后再继续下一章。
```

### 28.4 显示位置

放在 `WorkspacePageLayout` 的 `alerts` 区域，但要弱提示，不要抢 StaleAlert 的优先级。

---

## 29. 增强 StaleAlert

### 29.1 当前问题

当前只提示内容过时，但用户不一定知道为什么。

### 29.2 建议后端增加

当前 `stale_markers` 已有：

```sql
target_type
source_type
created_at
```

建议新增命令：

```rust
#[tauri::command]
pub fn list_stale_reasons(
    state: State<DbState>,
    project_id: i64,
    target_type: String,
) -> Result<Vec<StaleReason>, String> {}
```

返回：

```ts
interface StaleReason {
  source_type: string;
  created_at: string;
}
```

### 29.3 前端文案映射

```ts
const sourceLabels: Record<string, string> = {
  outline: "大纲已修改",
  characters: "人物设定已修改",
  chapters: "章节目录已修改",
  content: "正文已修改",
};
```

显示：

```text
该内容可能已过时：大纲已修改。建议重新生成或手动检查。
```

---

## 30. 增加阶段完成条件

### 30.1 文件

新增：

```text
src/lib/stageProgress.ts
```

### 30.2 建议实现

```ts
import type { CreationStage } from "@/types";

export interface StageProgressInput {
  outlineContent?: string;
  characterCount?: number;
  chapterCount?: number;
  selectedChapterId?: number | null;
}

export function getNextStep(stage: CreationStage, input: StageProgressInput) {
  switch (stage) {
    case "outline":
      return input.outlineContent?.trim()
        ? "大纲已有内容，可以进入人物设计。"
        : "先生成或编写故事大纲。";
    case "characters":
      return input.characterCount
        ? "人物已有内容，可以进入章节目录。"
        : "先根据大纲生成人物。";
    case "chapters":
      return input.chapterCount
        ? "章节目录已有内容，可以进入正文创作。"
        : "先根据大纲和人物生成章节目录。";
    case "content":
      return input.selectedChapterId
        ? "可以生成或编辑当前章节正文。"
        : "先选择一个章节。";
  }
}
```

---

## 31. 第四部分验收标准

- 每个阶段顶部都有轻量下一步提示。
- 缺少上游内容时，提示明确，不只是禁用按钮。
- 过时提示能显示来源。
- 用户修改大纲后，人物/目录/正文能看到原因说明。
- 提示不遮挡主编辑区。

---

# 第五部分：P0 总验收清单

## 32. 功能验收

### 布局体验

- [ ] 大纲页面滚动正常。
- [ ] 人物页面展开角色后输入框不被挤压。
- [ ] 目录页面小窗口下左侧列表不挤压右侧。
- [ ] 正文页面小窗口下章节列表和正文区可用。
- [ ] 底部操作栏始终固定。
- [ ] 暗色模式滚动条观感统一。

### AI 生成体验

- [ ] 有内容时生成会弹出确认。
- [ ] 支持替换生成。
- [ ] 支持追加生成。
- [ ] 生成中显示字数和耗时。
- [ ] 停止后内容不丢失。
- [ ] 失败后可以复制错误。
- [ ] 失败后可以重试。

### 保存和快照

- [ ] 大纲自动保存。
- [ ] 正文自动保存。
- [ ] AI 生成前自动快照。
- [ ] 润色前自动快照。
- [ ] 可以查看最近快照。
- [ ] 可以恢复快照。

### 流程引导

- [ ] 大纲阶段提示下一步。
- [ ] 人物阶段提示下一步。
- [ ] 目录阶段提示下一步。
- [ ] 正文阶段提示下一步。
- [ ] 过时提示显示来源原因。

---

## 33. 技术验收

每个阶段完成后执行：

```bash
npm run build
```

涉及 Tauri 后端后执行：

```bash
npm run tauri dev
```

最终合并前检查：

```bash
git status
npm run build
```

---

# 第六部分：推荐实际执行顺序

## 第 1 天：布局组件

1. 新增 `AppScrollArea`。
2. 新增 `WorkspacePageLayout`。
3. 新增 `EditorActionBar`。
4. 新增 `ModelPresetSelect`。
5. 迁移 `OutlineEditor`。
6. 执行 `npm run build`。

## 第 2 天：分栏和其他页面迁移

1. 新增 `ResponsiveSplitPane`。
2. 迁移 `ContentEditor`。
3. 迁移 `ChapterEditor`。
4. 优化 `CharacterEditor` 展开内容自适应。
5. 执行 `npm run build`。

## 第 3 天：AI 生成确认和状态

1. 新增 `src/types/ai.ts`。
2. 扩展 `AIContext`。
3. 新增 `GenerateConfirmDialog`。
4. 新增 `GenerationStatusBar`。
5. 先接入大纲和正文。
6. 执行 `npm run build`。

## 第 4 天：失败恢复和停止处理

1. 新增 `GenerationRecoveryPanel`。
2. 失败后支持复制错误。
3. 失败后支持重试。
4. 停止后保留内容。
5. 执行 `npm run build`。

## 第 5 天：快照后端

1. 新增 `MIGRATION_002`。
2. 新增 `commands/snapshots.rs`。
3. 注册 Tauri 命令。
4. 新增前端 `tauri.ts` 封装。
5. 执行 `npm run tauri dev`。

## 第 6 天：自动保存和历史版本

1. 新增 `useAutosave`。
2. 接入大纲。
3. 接入正文。
4. 新增 `SnapshotPanel`。
5. AI 生成前创建快照。
6. 润色前创建快照。
7. 执行 `npm run build`。

## 第 7 天：流程引导和过时原因

1. 新增 `FlowGuide`。
2. 新增 `stageProgress.ts`。
3. 增强 `StaleAlert`。
4. 如需要，新增 `list_stale_reasons` 命令。
5. 完整回归四个阶段。
6. 执行 `npm run build`。

---

# 第七部分：容易踩坑的点

## 34. 不要一次性迁移四个页面

先迁移大纲，再迁移正文。大纲最简单，正文最复杂，这两个跑通后再处理人物和目录。

## 35. 自动保存不要和 AI 生成互相打架

自动保存条件必须包含：

```ts
!generating
```

否则 AI 流式输出时会频繁保存，影响性能。

## 36. 快照不要无限增长

每次创建快照后可以调用：

```ts
deleteOldSnapshots(..., keep: 10)
```

先保留最近 10 条即可。

## 37. 生成取消不等于后端取消

P0 先做前端体验，即停止显示、停止应用内容、保留已生成文本。后续如果要真正取消 HTTP 请求，需要后端 AI 请求支持 abort handle。

## 38. 小窗口优先保证可用，不追求完美

Tauri 桌面应用中用户可能缩到很小，第一版要求：

- 不遮挡。
- 不横向溢出。
- 能滚动。
- 按钮能换行。

不要一开始就做复杂拖拽分栏。

---

# 第八部分：P0 完成后的效果

完成后，用户体验会变成：

1. 打开任意阶段，布局一致。
2. 小窗口、暗色模式下仍然舒服。
3. AI 生成前会询问如何处理已有内容。
4. AI 生成中知道用了多久、生成多少字、用哪个模型。
5. 停止或失败后不会丢内容。
6. 手动编辑会自动保存。
7. AI 覆盖或润色前有快照可恢复。
8. 用户知道当前阶段下一步该做什么。
9. 内容过时时知道原因。

这就是 P0 的核心价值：**不增加复杂业务，但显著提升长期写作安全感和舒适度**。
