# 2026-07-13 前端新规划下的现版本改造计划

## 0. 文档信息

- **分析基线**：`master` 分支提交 `04fcce508dad9e837a3250fe4f58a94eabb5c979`
- **分析范围**：当前 React/Tauri 前后端实现、`DEV-PLAN.md` 已完成项、`Design-Brief.md`、`docs/opencodewriter-pencil/` 下 8 张规划画板
- **目标**：在保留现有业务能力、SQLite 数据和 SDK-first Runtime 的前提下，把当前界面改造成新的桌面创作工作台，并补齐新界面所需的后端查询、依赖分析、AI 审阅与任务状态能力

> 说明：本次已通过 GitHub 核对 8 张 PNG 画板均存在于最新提交，文件均为 1440×960 导出图。当前 GitHub connector 对仓库二进制文件只能返回编码内容，无法在本轮直接完成逐像素渲染审查，因此页面语义与优先级以 `Design-Brief.md` 明确列出的 V2、V4、V5、V7、V8、V9、V12、V14 为基线；实施阶段必须在本地将对应 PNG 作为视觉验收基准再做一次逐页比对。

---

## 1. 总体结论

当前版本**不适合推倒重写**。项目已经具备较完整的小说创作业务底座：

- 项目、项目设定、大纲、人物、章节目录、正文；
- 世界观、人物关系、人物状态、事实、伏笔；
- 知识库、写作风格、写法规则、模型路由；
- 章节审核、修复、后护理、快照、任务、生成日志；
- `AiRuntime`、SDK Adapter、Tools、Skills、MCP 配置与审批边界。

真正需要重构的是以下三层：

1. **前端信息架构**：当前仍以 `view + currentStage + settingsTab` 和单一侧栏驱动页面，无法承载新规划中的分组导航、检查器、任务抽屉、事实/伏笔独立页面和任务中心。
2. **AI 交互安全层**：部分生成结果会直接进入当前编辑区或直接写数据库，缺少统一的“准备 → 运行 → 待审阅 → 应用/放弃”状态机。
3. **后端读模型与操作契约**：当前命令以单表 CRUD 为主，新界面需要项目摘要、工作区启动数据、上下文清单、依赖影响、统一任务项、差异预览等聚合接口。

建议把本次改造定义为：

```text
v0.9 Workbench UI & Reviewable AI
```

核心原则：

```text
保留 Domain CRUD / AiRuntime / SQLite
        ↓
新增 Workbench Read Model + AI Draft/Application Layer
        ↓
重组 React 桌面工作台与页面交互
```

---

## 2. 当前实现与开发计划完成度复核

### 2.1 已经实现、应优先复用的能力

| 范围 | 当前实现 | 改造策略 |
|---|---|---|
| 项目与阶段 | 项目 CRUD、恢复 `current_stage`、基础进度查询 | 保留数据库和命令；新增项目摘要和独立工作区路由状态 |
| 开书定盘 | 一句话生成 3 个方向、项目设定、方向生成大纲 | 保留 AI 命令；重做向导布局和事务化落库 |
| 大纲 | 编辑、生成、追加/覆盖、保存、过时提示 | 保留领域能力；生成结果改为草稿预览后应用 |
| 人物 | 人物分层、编辑、关系、状态、AI 生成 | 保留表与 CRUD；改成主列表 + 详情检查器 |
| 世界观 | 地点、势力、规则、历史、时间线、物件 CRUD | 保留；增加筛选、搜索、引用影响和详情检查器 |
| 章节规划 | 章节生成、拖拽排序、任务单、润色 | 保留；补齐视角、场景、出场人物、转折、结果字段和键盘排序 |
| 正文 | 章节列表、编辑、生成、润色、批量生成 | 保留；主编辑器升级，AI 输出与正文分离，加入专注模式 |
| 审核修复 | 评分、问题 JSON、建议、修复前快照 | 保留审核数据；修复改为差异预览后应用，问题增加可靠定位锚点 |
| 后护理 | 候选人物状态、事实、伏笔，经确认后写入 | 保留，这是符合新设计原则的现成模式 |
| 知识库 | 文本导入、FTS5、搜索、拆书分析、生成上下文召回 | 保留；补文件导入元数据、召回清单和来源可见性 |
| 写法引擎 | 风格配置、规则提取、规则启停、模型路由 | 保留；重做页面层级和待审阅规则区 |
| 任务与恢复 | `jobs`、`generation_logs`、快照、批量任务 | 保留表；增加统一任务读模型、取消/重试/跳转能力 |
| AI 底座 | Runtime Manager、SDK-backed、fallback、事件、Tools/Skills | 不重写；前端消费完整事件时间线 |
| MCP | 配置、白名单、审批、日志；真实外部执行仍受 SDK 能力限制 | 设置页必须明确“实验性/当前不可完整执行”，不能伪装在线 |

### 2.2 仍然缺少的验证

`DEV-PLAN.md` 中多数业务任务已经标记实现，但多个阶段仍缺：

- `pnpm tauri dev` 的人工入口回归；
- 旧数据库迁移后的完整操作验证；
- AI 失败、取消、切换页面、切换项目时的数据保护验证；
- 两阶段代码审查；
- 8 张重点规划画板对应页面的视觉验收。

因此本次改造开始前，必须把当前版本做成可回归基线，不能直接在未验证状态上大面积替换。

---

## 3. 当前界面与新规划的主要差距

### 3.1 应用外壳

当前：

- `App.tsx` 直接维护 `view`、`currentStage`、`settingsTab`；
- `AppSidebar` 同时承担项目、创作阶段、设置入口和部分状态；
- `WorkspacePageLayout` 只有标题、提示、内容和底部操作栏；
- 生成历史放在侧栏菜单弹出的面板中。

新规划要求：

- 左侧分组导航，可在 248px 和 56px 间切换；
- 56px 顶部任务栏；
- 中央主工作区；
- 约 320px 可调整右侧检查器；
- 底部任务抽屉，折叠时保留任务状态条；
- 支持专注模式、命令面板和跨页面跳转。

结论：`AppSidebar + WorkspacePageLayout` 需要升级为真正的 `AppShell/WorkbenchShell`，不是继续堆 className。

### 3.2 导航与创作进度被混在一起

当前 `CreationStage` 同时代表：

- 导航页面；
- 创作顺序；
- 项目恢复位置；
- 侧栏状态。

但新信息架构还包含项目设定、世界观、事实与伏笔、知识库、写法引擎、任务中心、设置，它们不是同一种“阶段”。

必须拆分为：

```ts
type WorkspaceRoute =
  | "project-profile"
  | "outline"
  | "characters"
  | "world"
  | "chapters"
  | "content"
  | "facts"
  | "knowledge"
  | "style"
  | "tasks"
  | "settings";

type CreationProgressStage =
  | "framing"
  | "outline"
  | "characters"
  | "chapters"
  | "content";
```

`current_stage` 不再直接决定全部导航结构，只用于创作进度或兼容旧数据；恢复位置单独保存。

### 3.3 项目库信息不足

当前项目列表只返回项目基础字段，页面自己绘制四阶段胶囊；缺少：

- 项目类型/题材；
- 总字数、章节完成数；
- 最近编辑章节和时间；
- 运行中/失败任务；
- 过时项数量；
- 封面或项目标识；
- 真正的“最近打开”记录。

另外当前“继续创作”取数组最后一个项目，而后端按 `updated_at DESC` 返回，实际可能进入最旧项目，必须在改造前修复。

### 3.4 AI 结果应用方式不统一

当前存在三种不一致模式：

1. 大纲/正文生成时，前端将当前内容清空并用流式结果替换，结束后自动保存；
2. 人物、章节生成和章节润色由后端解析后直接写数据库；
3. 后护理先生成候选，再由用户确认写入。

新设计要求统一为：

```text
准备上下文
→ 用户确认模型与影响
→ 运行并展示流式事件
→ 生成结果进入待审阅区
→ 用户选择应用、部分应用或放弃
→ 应用前创建快照
→ 事务写入并记录日志
```

后护理现有模式应成为其他 AI 功能的参考实现。

### 3.5 页面结构仍偏卡片化

当前大量使用 `rounded-2xl/rounded-3xl`、整块 Card、胶囊按钮和阴影。新设计明确要求桌面生产力工具形态：

- 依靠间距、对齐、字重和分隔线建立层级；
- 阴影只用于浮层；
- 控件圆角 6px、面板 8px、浮层 12px；
- 主操作与次操作要有明确层级；
- 不能把所有信息都包装为卡片或胶囊。

设计令牌虽然已有 Pencil 色值，但语义命名、字体栈、圆角和控件密度仍需统一。

### 3.6 关键页面差距

| 页面 | 当前形态 | 主要改造 |
|---|---|---|
| V2 项目库 | 居中 600px 大卡片 | 全宽项目列表/最近项目区，显示摘要、进度、字数、任务与最近编辑 |
| V4 大纲 | 单一 Textarea + 底部操作栏 | 中央大纲编辑器，右侧上下文/版本检查器，AI 草稿预览与差异应用 |
| V5 人物 | 折叠卡 + 人物/关系/状态标签 | 左侧人物列表，中间详情，右侧关系与状态检查器；支持筛选和影响提示 |
| V6 世界观 | 按类型折叠卡 | 类型筛选 + 条目列表 + 详情检查器，支持搜索和引用影响 |
| V7 章节规划 | 左侧章节 + 中间任务单 | 章节行、中心摘要/目标、右侧完整任务单；补字段和键盘排序 |
| V8 正文 | 章节列表 + Textarea + 可选审核栏 | 专注长文编辑器、章节导航、右侧上下文/问题检查器、底部 AI 任务抽屉 |
| V9 审核修复 | 右侧固定面板 | 问题列表可定位正文，修复先展示 diff，支持逐项应用 |
| V10 事实伏笔 | 仅有后端与后护理入口 | 新增独立页面，按事实/伏笔分栏，支持状态、来源章节和回收提醒 |
| V11 知识库 | 搜索 + 折叠资料 | 资料列表、来源详情、搜索结果、注入预览与召回记录 |
| V12 写法 | 设置大文件内多个区块 | 拆成风格概览、参考文本、规则池、待审阅规则，显示来源与启用状态 |
| V13 任务中心 | 日志面板、jobs、快照分散 | 底部抽屉 + 独立任务中心，任务/日志/快照分标签 |
| V14 设置 | 单文件、多卡片 | 分区设置页，明确 Runtime 边界、MCP 实验状态、外观/字号/密度 |

---

## 4. 目标前端架构

### 4.1 建议目录

```text
src/
  app/
    AppBootstrap.tsx
    AppNavigationContext.tsx
    route-types.ts
    route-registry.tsx

  components/workbench/
    AppShell.tsx
    NavigationPane.tsx
    TopTaskbar.tsx
    MainWorkspace.tsx
    InspectorPane.tsx
    TaskDrawer.tsx
    ResizablePane.tsx
    CommandPalette.tsx
    FocusModeBoundary.tsx

  components/ai/
    AiTaskLauncher.tsx
    ContextPreviewDialog.tsx
    GenerationTimeline.tsx
    GenerationDraftPanel.tsx
    GenerationDiffView.tsx
    PermissionRequestCard.tsx

  features/projects/
  features/profile/
  features/outline/
  features/characters/
  features/world/
  features/chapters/
  features/content/
  features/review/
  features/story-assets/
  features/knowledge/
  features/style/
  features/tasks/
  features/settings/

  lib/tauri/
    projects.ts
    workspace.ts
    ai.ts
    tasks.ts
    assets.ts
    settings.ts
```

### 4.2 路由方案

第一轮不必立刻引入浏览器 URL 路由。建议先将当前三个 state 合并为带参数的判别联合：

```ts
type AppRoute =
  | { name: "setup" }
  | { name: "project-library" }
  | { name: "idea-wizard" }
  | { name: "workspace"; projectId: number; section: WorkspaceRoute; targetId?: number }
  | { name: "settings"; tab: SettingsSection };
```

配套提供：

- `navigate(route)`；
- `goBack()`；
- `openTaskTarget(task)`；
- `openEntity(entityType, id)`；
- `restoreLastProjectRoute(projectId)`。

后续若需要历史栈和深链，再接 `MemoryRouter`，避免本轮同时扩大依赖面。

### 4.3 状态边界

拆分当前 `AIContext`：

- `AiExecutionProvider`：监听 Tauri AI 事件，维护 session；
- `TaskCenterProvider`：统一运行中、失败、完成任务；
- `WorkbenchProvider`：侧栏、检查器、抽屉、专注模式和宽度；
- 页面只消费自身领域 hook，不再直接读取所有全局生成字段。

### 4.4 编辑器选型

结构化字段继续使用 Input/Textarea；正文主编辑器建议引入 **CodeMirror 6**：

- 仍是纯文本，不引入富文本格式污染；
- 支持中文长文、查找、选择、行列定位、装饰标记；
- 可实现审核问题下划线、点击问题跳转、修复差异和滚动同步；
- 支持专注模式和键盘命令。

若继续使用原生 Textarea，只能做粗略字符串定位，无法稳定实现新设计中的问题标注与差异交互。

### 4.5 可调整面板

建议使用轻量的 `react-resizable-panels`，统一：

- 导航栏 248/56；
- 章节/人物列表宽度；
- 右侧检查器约 320px；
- 底部任务抽屉最大约 35%。

宽度和开关状态写入工作区偏好。

---

## 5. 目标后端架构

现有命令继续作为 Domain Command；新增四类服务，不把 UI 聚合逻辑散落到 React：

```text
commands/domain/**          现有 CRUD 与业务写入
queries/workbench/**        项目摘要、页面启动数据、筛选分页
services/impact/**          依赖与变更影响分析
services/generation/**      上下文预览、生成草稿、应用/放弃
services/task_center/**     jobs/logs/snapshots/tool events 统一读模型
```

### 5.1 工作区读模型

新增 DTO：

```rust
ProjectSummary
WorkspaceBootstrap
WorkspaceStageSummary
EntityListItem
ChapterWorkspaceSummary
TaskCenterItem
```

避免前端为了打开一个页面连续调用 5～10 个命令，也避免像当前侧栏那样把 `world/knowledge` 进度硬编码为 false。

### 5.2 AI 草稿层

新增 `generation_drafts`，用于承载尚未应用的 AI 结果：

```sql
CREATE TABLE generation_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  base_snapshot_id INTEGER,
  base_version TEXT DEFAULT '',
  content TEXT DEFAULT '',
  structured_json TEXT DEFAULT '{}',
  status TEXT DEFAULT 'pending_review',
  created_at TEXT DEFAULT (datetime('now')),
  applied_at TEXT
);
```

适用范围：

- 大纲生成/润色；
- 人物候选；
- 章节候选与目录润色；
- 正文生成/润色；
- 修复结果；
- 写法规则候选。

应用命令必须：

1. 检查目标版本是否变化；
2. 创建快照；
3. 在事务中写入；
4. 标记草稿已应用；
5. 更新日志和过时标记；
6. 返回最新目标和受影响项。

### 5.3 上下文清单

新增 `preview_ai_context`，返回实际将注入模型的来源，而不是只返回拼接后的 prompt：

```ts
interface ContextManifest {
  taskType: string;
  model: string;
  target: { type: string; id?: number };
  sections: Array<{
    key: string;
    label: string;
    sourceType: string;
    sourceId?: number;
    charCount: number;
    required: boolean;
    included: boolean;
    preview: string;
  }>;
  estimatedInputChars: number;
  warnings: string[];
}
```

该清单同时写入生成日志，保证后续可排障。

### 5.4 依赖影响服务

新增 `preview_change_impact` / `preview_delete_impact`，覆盖：

- 项目设定改动会使哪些大纲/章节/正文过时；
- 人物删除会影响哪些关系、状态、章节任务单、事实和正文；
- 世界观条目删除被哪些内容引用；
- 章节删除会删除正文、审核、状态、事实、伏笔和快照；
- 知识资料删除会影响哪些生成记录的上下文来源。

第一版可通过 SQL 动态查询，不必先建设通用图数据库。

### 5.5 统一任务中心

新增聚合命令：

```rust
list_task_center_items(project_id, filter, cursor)
get_task_detail(task_id)
cancel_task(task_id)
retry_task(task_id, retry_scope)
list_target_snapshots(...)
preview_snapshot(snapshot_id)
restore_snapshot(snapshot_id)
```

`TaskCenterItem` 统一映射：

- `jobs`：批量、可恢复任务；
- `generation_logs`：单次 AI 调用；
- `tool_call_logs`：工具/Skill/MCP；
- `content_snapshots`：恢复记录。

底层表可以继续分开，UI 不应直接解析四种表结构。

---

## 6. 数据库迁移建议

新增 `MIGRATION_009`，所有字段均提供默认值，保证旧库启动。

### 6.1 章节任务单补字段

```sql
ALTER TABLE chapters ADD COLUMN viewpoint TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN scene TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN cast_character_ids_json TEXT DEFAULT '[]';
ALTER TABLE chapters ADD COLUMN turning_point TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN outcome TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN status TEXT DEFAULT 'planned';
```

现有字段 `goal/conflict_level/hook/payoff/must_avoid/target_word_count` 保留。

### 6.2 工作区恢复状态

```sql
CREATE TABLE project_workspace_states (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_route TEXT DEFAULT 'outline',
  last_target_id INTEGER,
  navigation_collapsed INTEGER DEFAULT 0,
  inspector_open INTEGER DEFAULT 1,
  inspector_width INTEGER DEFAULT 320,
  task_drawer_open INTEGER DEFAULT 0,
  task_drawer_height INTEGER DEFAULT 240,
  focus_mode INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

全局主题、密度、编辑器字号继续使用 `settings` 表即可。

### 6.3 生成与任务字段

建议给 `generation_logs` 增加：

- `session_id`；
- `task_type`；
- `context_manifest_json`；
- `result_state`；
- `draft_id`。

建议给 `jobs` 增加：

- `progress_current`；
- `progress_total`；
- `cancel_requested`；
- `retry_of_job_id`。

不要长期依赖前端解析 `payload_json/result_json` 才能显示基础进度。

### 6.4 审核定位

`chapter_reviews.issues_json` 中每项升级为：

```json
{
  "type": "continuity",
  "severity": "warning",
  "description": "...",
  "quote": "原文片段",
  "start": 120,
  "end": 145,
  "context_before": "...",
  "context_after": "..."
}
```

审核时记录正文内容 hash 或快照 ID；正文已变化时先重新匹配 quote，无法匹配则标记“定位已失效”，不能跳到错误位置。

### 6.5 知识来源元数据

给 `knowledge_sources` 增加：

- `source_path`；
- `source_hash`；
- `import_status`；
- `updated_at`。

用于文件重新导入、重复检测和状态展示。

---

## 7. 分阶段实施计划

## Phase A：建立回归基线与契约

### 前端

- 为现有 14 类用户路径建立人工回归清单；
- 为 8 张重点画板建立截图对照表；
- 修复“继续创作进入旧项目”问题；
- 建立典型演示项目数据：空项目、半完成项目、完整项目、失败任务项目。

### 后端

- 用旧数据库副本验证所有迁移；
- 为项目、人物、章节、正文、审核、任务、快照建立最小集成测试；
- 固化现有 Tauri 命令返回契约，记录哪些命令会直接写数据。

### 验收

```bash
pnpm build
cd src-tauri && cargo test --lib
cd src-tauri && cargo check
pnpm tauri dev
```

必须记录人工入口结果，不能只看编译通过。

---

## Phase B：设计令牌与 Workbench Shell

### 前端

1. 将颜色令牌改为 `canvas/surface/surface-raised/text-*/border/accent-*` 语义；
2. UI 字体改为中文系统无衬线栈；
3. 统一 32/36/40px 控件高度和 6/8/12px 圆角；
4. 删除页面级常驻阴影和过量胶囊样式；
5. 新建 `AppShell`、分组导航、顶部任务栏、检查器、任务抽屉；
6. 新建 `AppRoute` 与 route registry；
7. 提供 1100×720、1280×800、1440×960 三档布局；
8. 实现专注模式和面板宽度调整；
9. 所有拖动操作保留按钮/快捷键替代。

### 后端

- `get_app_bootstrap`：设置、模型可用性、最近项目、运行中任务摘要；
- `get_workspace_bootstrap(project_id, route)`；
- `get_stage_summaries(project_id)`；
- `get/save_project_workspace_state`。

### 验收

- 页面切换不丢项目与任务状态；
- 侧栏折叠后功能图标仍完整可用；
- 检查器和任务抽屉互不遮挡；
- 页面不出现意外横向滚动；
- 键盘焦点始终可见。

---

## Phase C：项目库、配置向导与项目设定

### 前端

#### 项目库

- 改为生产力列表，不使用单一大卡片；
- 每行显示项目名称、题材、当前创作进度、完成章节/总章节、总字数、最近编辑、过时数量和失败任务；
- 继续创作进入真正的 `last_route + last_target_id`；
- 删除按钮始终可被键盘访问，不只依赖 hover；
- 搜索、排序、空状态和新建入口独立。

#### 首次配置

- 分为 API 地址、Key、模型确认三步；
- “测试连接”只测试，不立即完成向导；
- 用户确认后才创建/更新预设并写 `setup_complete`；
- 成功页明确进入“创建第一本书”。

#### 项目设定

- 改为分组表单和自动保存；
- 500～800ms 防抖；
- 保存前显示会过时的下游内容；
- 保存失败持续显示并可重试。

### 后端

- `list_project_summaries` 聚合字数、章节、任务、过时项；
- `test_model_connection` 与 `create_model_preset` 分离；
- `complete_setup` 使用事务；
- `preview_profile_change_impact`；
- `save_project_profile` 支持 `expected_updated_at` 乐观并发；
- `touch_project_opened` 或工作区状态记录 `last_opened_at`。

---

## Phase D：大纲、人物、世界观工作区

### 大纲

#### 前端

- 中央主编辑区最大阅读宽度 760px；
- 右侧检查器显示项目设定、上下文来源、快照和过时原因；
- AI 生成不清空当前大纲；
- 流式结果进入草稿区；
- 支持覆盖、追加、选择片段应用和放弃；
- 应用前显示快照时间。

#### 后端

- `preview_ai_context(outline)`；
- `generate_outline_draft`；
- `apply_generation_draft`；
- `discard_generation_draft`；
- 大纲保存增加版本检查和真实保存状态。

### 人物

#### 前端

- 左侧人物列表支持分层、搜索和排序；
- 中央显示人物核心资料；
- 右侧检查器显示关系、状态、出场章节和引用；
- 长字段统一多行自适应；
- 删除前展示影响；
- AI 生成人物先进入候选区，可逐个接受。

#### 后端

- `list_character_summaries`；
- `get_character_workspace(character_id)` 聚合关系、状态、章节引用；
- `preview_character_delete_impact`；
- `apply_character_candidates` 事务写入；
- 关系创建接口支持 tension、summary，而不是只传 relation_type。

### 世界观

#### 前端

- 类型分段筛选、搜索、列表、详情检查器；
- 详情中显示规则、引用章节和相关人物；
- 删除和改名显示依赖影响；
- 支持空、加载、保存中和失败状态。

#### 后端

- `list_world_item_summaries(project_id, type, query, cursor)`；
- `get_world_item_workspace(id)`；
- `preview_world_item_change_impact`。

---

## Phase E：章节规划与正文工作室

### 章节规划

#### 前端

- 左侧章节行显示章节号、标题、状态、目标字数、正文完成度和问题数量；
- 中央编辑标题、摘要和核心目标；
- 右侧检查器编辑完整任务单；
- 补齐当前视角、场景、出场人物、转折点和结果；
- 拖拽排序，同时提供上移/下移和快捷键；
- AI 生成目录和润色均进入候选差异视图。

#### 后端

- 章节表新增字段；
- `list_chapter_workspace_summaries` 聚合正文、审核和字数；
- `update_chapter_task_sheet` 支持完整字段和版本检查；
- `move_chapter(id, before_id/after_id)`，避免前端每次提交全量 ID；
- `generate_chapter_candidates`、`apply_chapter_candidates`。

### 正文

#### 前端

- CodeMirror 主编辑器，正文 16px、1.75 行高、最大 760px；
- 左侧章节导航可收起；
- 右侧检查器可切换上下文、审核、后护理、快照；
- 顶部保留标题、保存状态、字数和少量主操作；
- 次要 AI 操作进入命令菜单，避免底部堆满同级按钮；
- 专注模式隐藏导航、检查器和任务抽屉，只保留退出入口；
- AI 生成、润色、修复始终进入独立草稿/差异区；
- 高频词与审核问题通过编辑器 decoration 标注，侧栏点击可定位。

#### 后端

- `get_content_workspace(chapter_id)` 一次返回章节、正文、相邻章节摘要、任务单、最新审核和状态；
- `save_content(expected_updated_at/content_hash)`；
- `generate_content_draft`、`polish_content_draft`；
- `apply_generation_draft` 创建快照后事务覆盖/追加；
- 取消任务必须传递到 Runtime/Adapter，不只把前端状态改为 cancelled；
- 批量任务按章节保存独立子任务状态。

---

## Phase F：AI 上下文、任务抽屉与可恢复执行

### 前端

- 所有 AI 按钮统一走 `AiTaskLauncher`；
- 运行前显示模型、上下文来源、预计影响和覆盖方式；
- 任务抽屉展示 thinking/content/tool/skill/mcp/error/done 时间线；
- 页面切换和项目切换不丢运行任务；
- 可取消、重试、切换备用模型；
- 成功任务可跳转目标；
- 失败任务显示已完成子结果和重试范围；
- MCP 审批纳入任务抽屉或统一浮层，不由 `AIContext` 单独硬编码全屏弹窗。

### 后端

- 统一 `session_id` 贯穿日志、草稿、工具和任务；
- AI 事件增加 `task_id/target/progress/timestamp`；
- `cancel_ai_session(session_id)` 连接到实际执行取消令牌；
- `retry_generation(session_id, preset_id?)`；
- 生成上下文清单写日志；
- `list_task_center_items` 支持运行/失败/完成筛选和游标分页。

---

## Phase G：审核修复、事实伏笔、知识库、写法与设置

### 审核与修复

- 审核问题带 quote、offset 和内容版本；
- 点击问题定位并选中文本；
- 修复返回草稿和 diff，不直接覆盖；
- 支持逐项应用、全部应用、忽略；
- 正文已变化时提示重新审核或重新定位。

### 事实与伏笔

- 新增独立工作区页面；
- 事实显示类型、内容、置信度、来源章节；
- 伏笔显示埋设章节、计划回收章节、状态和逾期提醒；
- 可从正文/后护理跳转到对应条目；
- 后端增加筛选、分页、状态更新和来源聚合。

### 知识库

- 增加 Tauri 文件选择和 txt/md 实际导入；
- 资料列表、详情、搜索结果分区；
- 显示分块数、来源路径、导入状态、重复提示；
- AI 运行前展示实际召回片段，可临时排除；
- 记录每次生成使用的 source/chunk ID。

### 写法引擎

- 风格配置、参考文本和规则池分区；
- 超过 2000 字即时提示截断；
- 提取结果先进入待审阅区；
- 规则显示来源、启用状态和最近使用；
- 禁用规则不删除。

### 设置

拆分为：

```text
模型预设
模型路由
工具与权限
MCP（实验性）
外观
快捷键
关于
```

要求：

- API Key 默认隐藏；
- 普通用户不看到 Runtime 切换；
- MCP 当前真实执行链不完整时明确禁用说明；
- 外观增加界面密度、编辑器字号；
- 关于页显示真实版本、数据目录和 SDK Adapter 状态；
- 快捷键与 Design Brief 统一，不能继续显示旧的 Ctrl+G/Ctrl+M 方案。

---

## Phase H：性能、可访问性与最终验收

### 前端

- 按 feature 动态加载，拆分当前大 chunk；
- `Settings.tsx` 拆文件；
- `src/lib/tauri.ts` 按领域拆分；
- 大列表虚拟化门槛：章节/人物/知识条目超过 200 时启用；
- 所有图标按钮有名称和 tooltip；
- 对话框初始焦点正确并可 Esc 关闭；
- 色彩对比、键盘导航、屏幕阅读语义检查；
- AI 流式输出只有用户位于末尾时自动跟随。

### 后端

- 为项目摘要、章节摘要、任务中心和资产筛选增加索引；
- 所有分页命令使用游标或稳定排序；
- 迁移测试覆盖空库、旧库和重复启动；
- 生成草稿应用、快照恢复、删除影响使用事务；
- Runtime、fallback、MCP 拒绝和任务取消增加测试。

### 最终门禁

```bash
pnpm build
cd src-tauri && cargo test --lib
cd src-tauri && cargo check
pnpm tauri build --debug
```

人工验收至少覆盖：

- 8 张重点画板在 1440×960 的视觉对应；
- 1280×800 与 1100×720 可用；
- 明暗主题；
- 全键盘完成常见操作；
- AI 成功、失败、取消、待审阅、应用、放弃；
- 旧数据库升级且数据不丢；
- 快照预览、恢复以及恢复前再快照；
- 运行中切换页面和项目，任务仍可追踪。

---

## 8. 推荐 PR 拆分

不要把全部改造放在一个 PR 中，建议按以下顺序：

1. `refactor(app): introduce typed navigation and workbench shell`
2. `feat(workbench): add inspector task drawer and workspace persistence`
3. `refactor(design): align semantic tokens typography density and radius`
4. `feat(projects): add project summaries setup confirmation and profile impact`
5. `refactor(assets): rebuild character and world master-detail workspaces`
6. `feat(chapters): extend chapter task sheet and workspace summaries`
7. `refactor(content): add CodeMirror editor focus mode and inspector`
8. `feat(ai): add context manifest generation drafts and apply workflow`
9. `feat(tasks): unify task center cancellation retry logs and snapshots`
10. `feat(review): add anchored issues diff repair and partial apply`
11. `feat(library): add facts foreshadows knowledge and style workspaces`
12. `refactor(settings): split settings and clarify runtime/mcp boundaries`
13. `test(ui): add migration integration accessibility and visual regression gates`

每个 PR 必须保持可编译、可启动，避免先删除旧页面再等待后续补齐。

---

## 9. 明确不做的内容

本轮不建议同时引入：

- 在线协作、账号系统和云同步；
- Qdrant、LangGraph 或新的大型 Agent Runtime；
- 富文本排版系统；
- 漫画、短剧或复杂生产流程；
- 普通用户可见的 Runtime 切换；
- 在 SDK 未提供稳定接口前伪装 MCP 已可真实调用；
- 全量通用依赖图数据库。

保持产品定位：**本地优先、可恢复、上下文透明、适合长篇小说创作的桌面工作台**。

---

## 10. 优先级结论

### P0：必须先完成

- 回归基线；
- Workbench Shell；
- typed route；
- 项目摘要；
- 真实保存状态；
- AI 草稿/应用层；
- 上下文预览；
- 任务抽屉；
- 正文编辑器与审核定位；
- 章节任务单字段补齐。

### P1：紧随完成

- 人物/世界观主从详情；
- 事实与伏笔页面；
- 任务中心独立页；
- 知识召回清单；
- 写法规则待审阅；
- 设置拆分；
- 快照恢复预览。

### P2：稳定性与体验优化

- 大列表虚拟化；
- 更细的差异应用；
- 命令面板搜索；
- 性能分包；
- 自动化视觉回归；
- 更完整的键盘无障碍。

最终判断：**先重构工作台和 AI 应用边界，再逐页搬迁；后端以新增聚合查询和草稿事务层为主，不重写现有小说领域能力和 SDK-first Runtime。**
