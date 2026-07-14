# 2026-07-14 当前前端改造实现审查

## 0. 审查信息

- **问题**：已经按照设计计划完成对应开发，目前还存在哪些问题？
- **仓库**：`liu1185616638/OpenCodeWriter`
- **审查分支**：`master`
- **审查基线**：`28808bec6430265f0ef75537372e5c6f10017119`（更新前端设计）
- **对照计划**：`docs/ArchitectsReply/2026-07-13-frontend-redesign-current-version-refactor-plan.md`
- **审查方式**：GitHub 最新代码静态审查、前后端接口对照、状态流和数据写入路径检查
- **限制**：当前提交没有 GitHub CI 状态；审查环境无法拉取仓库源码执行 `pnpm build`、`cargo test` 和 Tauri 人工运行，因此构建与桌面实际表现仍需本地验证。

---

## 1. 总体判断

本轮改造已经完成了大量**界面结构搭建**：

- typed route 和新导航数据结构；
- `AppShell`、顶部任务栏、导航栏、任务抽屉、状态栏；
- 项目库、人物、章节、正文、事实与伏笔、写法引擎等新版页面；
- 项目摘要、章节工作区、正文工作区、任务中心等后端聚合查询；
- 章节任务单新字段、生成日志 session/task 字段、任务进度字段；
- 设置页拆分和知识库文件导入。

但目前还不能认为“设计计划已经完整落地”。实现状态更接近：

```text
工作台视觉骨架：基本完成
页面主从布局：部分完成
聚合查询：部分完成
AI 可审阅应用层：未完成
任务取消与恢复：未完成
全局状态统一：未完成
桌面窗口能力：存在阻断问题
发布验证：未完成
```

当前最重要的问题不是继续补视觉细节，而是先修复：

1. 桌面窗口无法正常移动/关闭；
2. AI 取消不是真取消；
3. 生成失败或取消后可能覆盖正文；
4. 自动保存可能丢失最后一次输入；
5. 设置导航和全局状态出现分叉；
6. 计划中的统一 AI 草稿/应用层仍未实现。

---

# 2. P0：发布前必须修复

## P0-1 无系统标题栏，但新顶栏没有窗口控制和拖动区域

### 现状

`src-tauri/tauri.conf.json` 设置：

```json
"decorations": false
```

意味着系统标题栏、最小化、最大化和关闭按钮全部被关闭。

新版 `TopTaskbar.tsx`：

- 没有最小化按钮；
- 没有最大化/恢复按钮；
- 没有关闭按钮；
- 没有 `data-tauri-drag-region`；
- 没有调用 Tauri Window API。

目前只有 `NavigationPane` 品牌区域带拖动属性。项目库和一句话开书页面通过 `hideSidebar` 隐藏导航栏，因此这些页面甚至没有明显可拖动区域。

### 影响

- 项目库窗口可能无法拖动；
- 用户无法通过界面最小化、最大化或关闭应用；
- 首次配置页也缺少窗口控制；
- 这是桌面应用阻断级问题。

### 修复建议

新增统一 `WindowControls`：

```text
TopTaskbar
├── drag region
├── minimize
├── toggle maximize
└── close
```

要求：

- 顶栏空白区域可拖动；
- 所有无侧栏页面也保留拖动区；
- 按钮使用 `@tauri-apps/api/window`；
- Windows 下支持双击顶栏最大化/恢复；
- 交互按钮本身排除 drag region。

---

## P0-2 “取消生成”只改日志和前端状态，没有终止 Runtime

### 现状

`cancel_ai_session` 当前只做三件事：

1. 将 `generation_logs.status` 更新为 `cancelled`；
2. 发出 `ai-error` 事件；
3. 返回 session ID。

它没有持有或调用：

- Runtime abort handle；
- cancellation token；
- SDK session abort；
- HTTP request abort；
- 子进程终止。

与此同时，`AiTaskService` 在 Runtime 正常结束后会无条件：

```rust
finish_generation_log(..., "success", ...)
emit_done(...)
```

因此可能出现：

```text
用户点击取消
→ 日志暂时变为 cancelled
→ 前端停止显示
→ 后台 Runtime 继续执行
→ Runtime 完成
→ 日志被重新写成 success
→ 后续数据库写入继续执行
```

### 影响

- 用户以为任务已停止，实际仍在消耗 Token；
- 人物、章节生成可能在取消后继续写数据库；
- `cancelled` 状态会被覆盖为 `success`；
- 页面状态和任务中心状态不一致。

### 修复建议

建立真正的 `AiSessionRegistry`：

```rust
session_id -> CancellationToken / AbortHandle / RuntimeSessionHandle
```

执行要求：

- 所有 Runtime 循环每次处理 delta 前检查 cancellation token；
- SDK-backed 调用 SDK abort/session cancel；
- OpenAI-compatible 使用请求 abort；
- 取消后 Runtime 返回独立 `Cancelled` 错误；
- `finish_generation_log` 使用条件更新，已取消的日志不能再改回成功；
- 数据库应用阶段再次检查 session 是否取消。

---

## P0-3 正文生成失败或取消后，可能把部分流式文本覆盖到原正文

### 现状

`ContentEditor.tsx` 仍采用旧的直接覆盖流程：

```text
生成开始
→ replace 模式先 setText("")
→ 流式内容持续写入 text
→ generating 从 true 变 false
→ 自动保存 streamedContent
```

自动保存 effect 只判断：

```ts
if (prevGeneratingRef.current && !generating)
```

没有判断最终状态是：

- completed；
- failed；
- cancelled；
- timeout。

因此 AIContext 在失败或取消时将 `generating=false` 后，正文页仍可能将已经收到的部分流式内容保存到数据库。

### 影响

- 原正文可能被部分输出覆盖；
- “取消”可能反而保存不完整结果；
- 网络中断可能造成正文数据损坏；
- replace 模式在开始生成时即清空屏幕，用户无法继续查看原稿。

### 修复建议

正文必须改成：

```text
originalText 保持不变
→ streamedContent 写入 generation draft
→ completed 后进入待审阅
→ apply 时创建快照
→ transaction 保存
```

禁止使用 `generating=false` 作为“成功完成”的判断依据，应使用明确的：

```ts
generationStatus === "completed"
```

失败、取消和超时均不得调用 `saveContent`。

---

## P0-4 大纲和项目定盘的 600ms 自动保存存在旧状态闭包问题

### 现状

`OutlineEditor` 和 `ProjectProfileView` 的输入事件模式均为：

```ts
setState(newValue)
scheduleSave()
```

而 `scheduleSave()` 内部保存的是当前 render 创建的 `doSave`，`doSave` 捕获的是 `setState` 前的旧值。

典型结果：

```text
用户输入最后一个字
→ state 异步更新
→ 定时器捕获更新前的内容
→ 用户停止输入
→ 600ms 后保存少最后一个字的版本
```

连续输入时通常会保存“落后一拍”的值。

### 影响

- 大纲最后一次编辑可能没有落库；
- 项目定盘最后修改的字段可能没有落库；
- 页面显示“已保存”，数据库却是旧值；
- 切换页面后用户会发现最后一次输入丢失。

### 修复建议

采用以下任一模式：

1. effect 驱动防抖：

```ts
useEffect(() => {
  const timer = setTimeout(() => save(latestState), 600)
  return () => clearTimeout(timer)
}, [latestState])
```

2. 使用 ref 保存最新表单快照；
3. `scheduleSave(nextValue)` 显式传入下一值。

另外必须增加：

- 页面卸载前 flush；
- 项目切换前 flush；
- 保存请求序列号，防止旧请求晚返回覆盖新状态；
- dirty 状态与实际保存版本对应。

---

## P0-5 设置路由重复，侧栏设置入口不能正确访问设置子页面

### 现状

当前同时存在：

```ts
WorkspaceRoute = ... | "settings"
AppRoute = { name: "settings", tab: SettingsRoute }
```

也就是两套设置路由：

1. 工作区内的 `workspace/settings`；
2. 独立的 `settings/:tab`。

侧栏 `NAV_ITEMS` 中的设置会调用工作区 `onNavigate("settings")`，进入：

```ts
route.name === "workspace"
route.section === "settings"
```

但是 `settingsTab` 的计算只在：

```ts
route.name === "settings"
```

时才映射，否则固定为 `writing-style`。新版 `Settings` 不再支持 `writing-style`，最终 default 到模型预设页。

同时 `Settings.tsx` 本身只有内容 switch，没有设置子导航。结果是：

- 侧栏点设置通常只能看到模型预设；
- 模型路由、MCP、外观、快捷键、关于没有稳定可达入口；
- `Ctrl+,` 进入的是另一套设置路由；
- 返回和侧栏高亮可能不一致。

### 修复建议

删除 `WorkspaceRoute` 中的 `settings`，设置只保留：

```ts
{ name: "settings", tab: SettingsRoute }
```

新增设置二级导航，或让主导航点击设置后进入默认 tab，并允许切换：

```text
模型预设
模型路由
工具与权限
MCP
外观
快捷键
关于
```

---

## P0-6 统一 AI 草稿/审阅/应用层仍未实现

### 设计计划要求

```text
准备上下文
→ 运行
→ 待审阅
→ 应用/部分应用/放弃
→ 应用前快照
→ 事务写入
```

### 当前实际情况

- 大纲：仅使用组件本地 `draft`，未持久化；
- 正文：仍直接流入编辑器并自动保存；
- 人物：后端解析完成后直接插入数据库；
- 章节：后端解析完成后直接插入数据库；
- 章节润色：后端直接更新章节；
- 修复：有局部 diff UI，但未形成统一草稿模型；
- 仓库没有 `generation_drafts` 或同类持久化实体。

### 影响

- 切换页面后草稿丢失；
- 应用流程在不同页面完全不一致；
- 人物和章节无法逐条选择；
- 后端写入中途失败可能留下半套数据；
- 任务中心无法恢复待审阅结果。

### 修复建议

新增统一表：

```sql
generation_drafts(
  id,
  session_id,
  project_id,
  target_type,
  target_id,
  task_type,
  base_version,
  payload_json,
  status,
  created_at,
  applied_at
)
```

所有 AI 写操作先生成 draft，应用命令单独执行事务。

---

## P0-7 审核/修复完成监听依赖已被清空的 generatingStage

### 现状

AIContext 收到完成事件时顺序为：

```ts
setGenerating(false)
setGeneratingStage(undefined)
onComplete(...)
```

但多个页面 effect 使用：

```ts
if (!generating && generatingStage === "review")
if (!generating && generatingStage === "repair")
if (!generating && generatingStage === "outline")
```

当 React 完成状态更新后，`generatingStage` 通常已经是 `undefined`，因此这些完成分支不可靠。

`ChapterQualityPanel` 的修复 `onComplete` 又是空函数，diff 草稿依赖上述 effect 生成，可能导致修复完成后没有预览结果。

### 修复建议

- 完成处理放进 `onComplete(content)`；
- 或保留 `lastCompletedTask`；
- 不要依赖 `generating=false + generatingStage` 组合推导刚完成的任务；
- timeline/session 状态必须按 session 保存，而不是单一全局布尔值。

---

## P0-8 当前没有构建、测试和桌面运行门禁

### 现状

- 最新提交没有 GitHub CI 状态；
- `package.json` 没有前端测试脚本；
- 大改一次提交约 60 个文件；
- 没有看到工作流执行 `pnpm build`、`cargo test`、`cargo check` 或 Tauri build。

### 风险

TypeScript 配置启用了：

```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true
```

大量页面重写后，任何未使用变量、类型不一致或 Tauri 命令漏注册都会阻止构建。

### 最低门禁

```bash
pnpm install --frozen-lockfile
pnpm build
cd src-tauri && cargo test --lib
cd src-tauri && cargo check
pnpm tauri build --debug
```

再增加 Windows 人工冒烟测试：

- 首次配置；
- 创建项目；
- 窗口移动/最小化/最大化/关闭；
- 大纲输入后立即切页；
- 正文生成中取消；
- 人物/章节生成中取消；
- 设置各子页访问；
- 暗色/亮色切换；
- 旧数据库迁移。

---

# 3. P1：核心功能完整性问题

## P1-1 `useTheme` 和 `useSettings` 不是全局状态

### 现状

`useTheme()` 和 `useSettings()` 都是普通 hook，每调用一次都会创建独立 React state。

当前：

- `AppInner` 调用一份；
- 各编辑器分别调用一份 `useSettings`；
- 模型配置页调用一份；
- 外观页和关于页分别调用一份 `useTheme`。

### 影响

- 编辑器切换模型后，AppShell 状态栏可能仍显示旧模型；
- 设置页新增/删除模型后，其他已挂载组件不立即更新；
- 外观页切主题后，其他 hook 实例的按钮状态可能仍显示旧主题；
- “已连接”状态可能不同步。

### 修复建议

建立：

```text
ThemeProvider
ModelSettingsProvider
```

或使用统一 store。所有页面只消费同一状态源。

---

## P1-2 工作台全局检查器没有真正接入

`AppShell` 支持 `inspectorContent`，但 `App.tsx` 没有向它传入任何检查器内容。

结果：

- `WorkbenchContext.inspectorOpen/inspectorWidth` 基本没有作用；
- 大纲、人物、正文等页面继续各自写固定宽度检查器；
- 全局检查器宽度调整能力没有实现；
- 页面间检查器行为不统一。

应选择一个架构：

1. 页面向 AppShell 注册检查器内容；或
2. 删除 AppShell inspector 状态，明确由页面管理。

不应两套机制并存。

---

## P1-3 专注模式没有完整隐藏所有干扰区域

### 当前问题

- `AppShell` 注释说专注模式隐藏任务抽屉，但实际上始终渲染 `TaskDrawer`；
- `toggleFocusMode` 只是将 drawer 设为关闭，折叠状态条仍存在；
- 大纲页自带的 300px 检查器没有读取 `focusMode`；
- 人物/世界观等页面自己的左右面板不会统一隐藏；
- 退出专注模式强制展开导航和检查器，丢失用户进入前的布局；
- `setFocusMode` 直接改布尔值，不执行隐藏规则。

### 修复建议

保存进入专注前的布局快照：

```ts
previousLayoutRef
```

退出时恢复原布局。AppShell 应明确不渲染 TaskDrawer 和 StatusBar，页面检查器应走统一插槽。

---

## P1-4 任务抽屉高度状态未使用

`WorkbenchContext` 提供：

```ts
taskDrawerHeight
setTaskDrawerHeight
```

但 `TaskDrawer.tsx` 内部固定：

```ts
expandedHeight = 240
```

没有拖动调整，也没有消费 context height。

同样，inspectorWidth 虽存在，但页面内部检查器仍固定 300/320px。

---

## P1-5 任务中心与设计要求差距较大

### 后端

`TaskCenterItem.item_type` 声明支持：

```text
generation | job | snapshot
```

但 `list_task_center_items` 实际只查询：

- `generation_logs`；
- `jobs`。

没有查询快照。

### 前端

任务中心当前：

- 固定读取最多 100 条；
- 没有分页/游标；
- 没有真正取消按钮；
- 没有重试按钮；
- 没有跳转目标；
- 没有快照预览或恢复；
- `get_retry_info` API 没有被使用；
- 任务原始参数没有完整持久化，无法可靠重放。

### 修复建议

统一 Task DTO 必须包含：

```text
source_kind
source_id
project_id
target_route
target_id
status
progress
retry_payload
cancelable
retryable
created_at
ended_at
```

任务中心必须提供动作而不是只读日志列表。

---

## P1-6 批量任务不可取消，新增字段没有进入执行逻辑

迁移给 `jobs` 增加了：

```text
progress_current
progress_total
cancel_requested
```

但：

- Rust `Job` 模型仍没有这些字段；
- `jobs.rs` 的 create/update DTO 没有处理这些字段；
- `batch_generate_chapters` 循环不检查 `cancel_requested`；
- 每章完成后只把进度写入 `result_json`；
- 任务中心显示的 progress 字段可能始终为默认值。

应在每章开始前读取取消标记，并提供 `cancel_job(job_id)`。

---

## P1-7 章节新增字段没有真正进入 AI 生成上下文

章节页和数据库已经新增：

- `viewpoint`；
- `scene`；
- `cast_character_ids_json`；
- `turning_point`；
- `outcome`；
- `status`。

但 `ChapterTaskSheet` 仍只格式化：

- goal；
- conflict level；
- hook；
- payoff；
- must avoid；
- target word count。

正文生成和审核不会看到视角、场景、出场人物、转折和结果。

同时 AI 生成章节的 JSON 结构也没有这些新字段，生成出来的章节仍只包含旧任务单字段。

### 修复建议

扩展 Rust `ChapterTaskSheet` 和 prompt schema；将角色 ID 解析为角色名称/摘要后注入，不要把 JSON ID 字符串直接交给模型。

---

## P1-8 人物和章节生成仍直接写数据库，且缺少事务

### 人物

`generate_characters` 在 Runtime 完成后直接调用 `save_generated_characters` 插入人物和关系。

### 章节

`generate_chapters` 完成后直接循环插入章节。

两者都没有：

- 待审阅；
- 批量选择；
- 应用确认；
- 整体 transaction；
- 取消后写入保护。

如果中途某条 INSERT 失败，会留下部分人物或章节。

应先保存结构化 draft，确认后在 SQLite transaction 中一次应用。

---

## P1-9 审核问题定位数据并没有由后端生成

前端 `ReviewIssue` 增加了：

- quote；
- start/end；
- context_before/context_after。

但后端 `ReviewIssueJson` 仍只有：

```rust
type
severity
description
location
```

因此大多数审核结果无法获得可靠文本锚点，前端只能尝试 `indexOf(quote)`，而 quote 通常不存在。

此外审核没有保存内容版本/hash，无法判断当前正文是否仍与审核版本一致。

---

## P1-10 “正文已变化”提示当前恒成立

`ChapterQualityPanel` 当前判断：

```ts
const contentChangedSinceReview = latestReview && currentContent && hasContent
```

只要有审核记录且正文非空，就会显示“正文在审核后已有修改”。它没有比较：

- content hash；
- updated_at；
- snapshot/version；
- 审核时正文版本。

应给 `chapter_reviews` 增加：

```text
content_hash
content_updated_at
snapshot_id
```

---

## P1-11 项目定盘的影响预览没有转化为实际过时标记

页面加载时调用 `preview_profile_change_impact`，但：

- 预览只按当前已有数据计数；
- 没有比较具体修改字段；
- 影响只在进入页面时加载一次；
- 自动保存前没有确认；
- `save_project_profile` 只更新 profile 表，不写 stale marker；
- 用户修改定盘后，下游数据不会真正进入“过时”状态。

当前 UI 只是提示“可能影响”，没有完成依赖传播。

---

## P1-12 路由和当前项目没有持久化恢复

`NavigationContext` 的 route 和 history 都只存在内存中。

`AppInner` 启动后无条件根据 `setup_complete` 设置为项目库，覆盖初始路由。

`currentProject` 又是 AppInner 的独立 state，不能根据 `route.projectId` 自动恢复。

风险：

- 重启后不能恢复上次项目和页面；
- 未来任务中心跳转目标时，只有 projectId 也无法加载 Project；
- `navigateWorkspace()` 从非工作区调用时可能生成 `projectId: 0`；
- route 和 currentProject 可能不一致。

建议增加 `get_workspace_bootstrap`，由 projectId 加载项目并恢复最后 route。

---

## P1-13 `updated_at` 同时被用作“最近编辑”和“最近打开”

`touch_project_opened` 直接更新 `projects.updated_at`。

项目库又用 `updated_at` 表示：

- 排序时间；
- 最近编辑时间；
- 最近打开项目。

打开项目就会伪装成内容被编辑。

应拆分：

```sql
last_opened_at
content_updated_at / updated_at
```

项目列表“继续创作”应按 `last_opened_at`；“最近编辑”按内容更新时间。

---

## P1-14 项目摘要没有完整聚合运行状态

`failed_job_count` 只统计 `jobs.status='failed'`，不统计失败的 `generation_logs`。

也没有返回：

- running task count；
- cancelled task count；
- latest editing chapter；
- last opened time；
- review issue count。

项目库显示的任务健康状态可能不完整。

---

## P1-15 项目库存在亮色主题和响应式问题

项目库右侧区域硬编码：

```ts
backgroundColor: "#10161E"
```

在亮色主题下仍是深色背景。

同时使用：

- 左栏固定 380px；
- 内容固定 760px；
- Tauri 最小窗口宽度只有 800px。

800px 窗口中理论宽度需求超过 1140px，会发生内容裁切或横向溢出。

应使用语义 token，并为 1100px 以下设计紧凑布局；Tauri minWidth 也应与真实可用宽度一致。

---

## P1-16 外观设置只保存值，没有实际应用

`AppearancePage` 将：

- `ui_density`；
- `editor_font_size`

写入 settings 表，但工作台没有读取并映射这些设置。

正文编辑器仍硬编码 `fontSize: 16`，其他控件间距也不随密度变化。

应建立 AppearanceProvider，在根节点设置：

```text
data-density
--editor-font-size
```

---

## P1-17 命令面板按钮是空按钮

顶部显示 `⌘K`/`Ctrl+K` 的命令面板按钮，但没有 `onClick`，快捷键 hook 也没有 Ctrl+K。

当前属于不可用的假入口。要么完成命令面板，要么暂时移除。

---

## P1-18 快照检查器仍是占位内容

正文检查器“快照”标签显示：

```text
快照功能将在 Phase F 中完善
```

计划要求的：

- 快照列表；
- 内容摘要；
- 恢复预览；
- 恢复前再创建快照；
- 跳转目标；

均未完成。

---

## P1-19 知识库“召回记录”不是真实召回记录

当前召回页只是展示最近生成日志，并写着“可能引用了知识库内容”。

后端没有记录：

- 使用了哪些 source ID；
- 使用了哪些 chunk ID；
- 每个片段的得分；
- 被用户排除的片段；
- 实际注入上下文的顺序。

因此“上下文透明”目标还没有实现。

建议新增 `generation_context_items` 表或记录到 generation draft manifest。

---

## P1-20 事实与伏笔的逾期判断不正确

当前逻辑：

```ts
status === "setup" && !payoff_chapter_id
```

就判定为逾期。

这会把所有尚未设置回收章节的正常伏笔都视为逾期。真正的逾期应比较：

- 当前已完成章节；
- 计划回收章节；
- 项目当前进度；
- 或显式 deadline/status。

另外列表没有分页，条目多时性能会下降。

---

# 4. P2：体验、语义与维护问题

## P2-1 状态栏“已连接”不代表真实连接

AppShell 使用：

```ts
connected={Boolean(currentPreset)}
```

只要存在模型预设，就显示“已连接”，即使：

- API Key 失效；
- API 地址不可达；
- 模型不存在；
- SDK Adapter 启动失败。

应显示：

```text
已配置 / 已验证 / 连接失败 / 未验证
```

而不是把“有配置”称为“已连接”。

---

## P2-2 版本号不一致

- `package.json`：`0.1.0`；
- `tauri.conf.json`：`0.1.0`；
- 状态栏：硬编码 `v0.9.0`；
- 关于页：硬编码 `0.9.0`。

应从 Tauri package version 读取，不要多处硬编码。

---

## P2-3 关于页调用了未注册的 `get_app_data_dir`

`AboutPage` 调用：

```ts
invoke("get_app_data_dir")
```

但 `src-tauri/src/lib.rs` 的 invoke handler 没有注册该命令，代码搜索也没有对应实现。

当前只能 catch 后显示“无法获取”。

---

## P2-4 Ollama 空 Key 的说明与验证规则冲突

配置向导写着：

```text
本地 Ollama 可留空
```

但：

- Step 2 下一步要求 apiKey 非空；
- `canTest` 要求 apiKey 非空；
- 模型配置页获取模型和添加预设也要求 Key 非空。

应按 provider/API base 判断是否允许空 Key，或者统一允许空字符串。

---

## P2-5 模型连接测试兼容范围有限

`test_model_connection`：

- 固定调用 `/chat/completions`；
- 固定发送 Bearer Authorization；
- 没有显式 timeout；
- 不支持只提供 Responses API 的服务；
- 不复用 Runtime/fallback 逻辑。

可能出现向导测试失败但 Runtime 实际可用，或反之。

建议测试接口直接通过 `AiRuntimeManager` 发一个最小请求。

---

## P2-6 API Key 仍以明文返回前端

UI 默认用密码框遮挡，但 `list_model_presets` 返回完整 `api_key`，编辑弹窗会把完整 Key 放入 React state。

本地优先应用可以暂时接受 SQLite 存储，但建议：

- 列表 DTO 不返回 Key；
- 编辑时使用“保持原 Key”占位；
- 单独命令更新 Key；
- 后续迁移到系统凭据库/Keychain。

---

## P2-7 正文仍是普通 Textarea

计划中的长文编辑能力尚未实现：

- 稳定 selection API；
- 问题 decorations；
- diff/定位标记；
- 大文本性能；
- 行号/段落定位；
- 查找替换；
- 编辑历史；
- 插件式高频词提示。

当前仍使用 Radix/Textarea，审核定位通过 `document.querySelector` 查找 placeholder，页面存在多个 textarea 时不够可靠。

建议在 AI 安全层完成后，再迁移 CodeMirror 6 或同类长文编辑器。

---

## P2-8 新旧视觉语言仍混用

新版工作台使用 6/8px 圆角和较少阴影，但设置、知识库和部分弹窗仍大量使用：

- `rounded-3xl`；
- `rounded-full`；
- Card + shadow；

整体仍存在“工作台”和旧卡片式页面混合的视觉断层。

---

## P2-9 删除和危险操作缺少一致的影响确认

人物、事实、伏笔、世界观等删除操作有的直接执行，有的只使用简单确认。

缺少统一：

```text
preview_delete_impact
→ 展示引用和影响
→ transaction delete
→ stale propagation
```

---

## P2-10 数据库排序操作没有事务

`reorder_chapters` 和 `move_chapter` 循环逐条更新 `sort_order`，没有 transaction。

任意一次更新失败会留下部分新顺序。`move_chapter` 也没有严格验证 before/after chapter 是否属于同一个项目。

---

# 5. 推荐修复顺序

## 第一批：安全与可运行性

建议单独 PR：

```text
fix(window): restore desktop window controls and drag regions
fix(ai): implement real runtime cancellation and terminal status guards
fix(content): prevent partial output from overwriting manuscript
fix(autosave): save latest editor and profile state reliably
fix(settings): remove duplicate settings route and restore tab navigation
ci: add frontend rust and tauri build gates
```

## 第二批：统一 AI 工作流

```text
feat(ai-drafts): persist reviewable generation drafts
feat(ai-apply): apply drafts through snapshots and transactions
refactor(generation): migrate characters chapters outline and content to draft workflow
feat(tasks): add real cancel retry jump and snapshot actions
```

## 第三批：工作台状态统一

```text
refactor(state): add shared theme and model settings providers
refactor(shell): unify inspector ownership and focus mode
feat(workspace): persist route project and layout state
fix(projects): separate last_opened_at from content updated_at
```

## 第四批：上下文和页面补全

```text
feat(chapters): inject all task sheet fields into AI context
feat(review): persist issue anchors and reviewed content versions
feat(knowledge): persist exact retrieval manifest
feat(snapshots): add preview restore and recovery workflow
fix(facts): implement real foreshadow due state
feat(appearance): apply density and editor font settings
```

---

# 6. 建议验收清单

## 窗口

- 所有页面可拖动；
- 最小化、最大化、恢复、关闭可用；
- 无侧栏页面也可移动窗口。

## 自动保存

- 输入最后一个字后等待 600ms，数据库内容完全一致；
- 输入后立即切页，不丢最后一次编辑；
- 连续慢速请求不会发生旧请求覆盖新请求；
- 保存失败保持 dirty/error 状态。

## AI

- 取消后网络/SDK 请求真实停止；
- 取消后日志保持 cancelled；
- 取消后人物/章节不写库；
- 正文失败/取消不改变原稿；
- 所有结果进入待审阅；
- 应用前创建快照；
- 放弃草稿不改变数据库；
- 切页后待审阅草稿仍可恢复。

## 设置

- 侧栏设置可进入所有子页；
- Ctrl+, 与侧栏进入相同路由；
- 主题切换全局即时同步；
- 模型新增、删除、切换后所有页面同步；
- 密度和字号真实生效。

## 工作台

- 专注模式真正隐藏导航、检查器、任务抽屉和状态栏；
- 退出后恢复之前布局；
- 检查器宽度和任务抽屉高度可调；
- 重启后恢复上次项目和页面。

## 任务中心

- 运行、失败、取消、完成、快照都可见；
- 支持取消、重试、跳转、恢复；
- 批量任务可取消；
- 进度字段真实更新；
- 大量记录支持分页。

---

# 7. 最终结论

当前版本已经完成了新版工作台的**外形和大部分页面重排**，但设计计划中最关键的两个目标尚未真正完成：

1. **AI 结果可审阅、可恢复、确认后再应用**；
2. **统一且可靠的桌面工作台状态与任务生命周期**。

现阶段不建议继续大规模扩展页面。应先冻结新功能，集中修复 P0：

```text
窗口控制
→ 真取消
→ 正文数据保护
→ 自动保存
→ 设置路由
→ AI 草稿应用层
→ CI 门禁
```

这些问题修复后，再推进任务中心、上下文透明、快照恢复和编辑器升级。否则当前版本虽然视觉上接近规划，但在长篇创作最重要的“数据不丢、AI 不误覆盖、任务可控”方面仍存在较高风险。
