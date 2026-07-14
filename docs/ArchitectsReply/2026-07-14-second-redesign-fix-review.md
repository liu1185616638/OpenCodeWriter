# 2026-07-14 第二轮前端改造修复复查

## 0. 复查信息

- **问题**：按照上一版审查文档修改后，还有哪些问题没有修改到？
- **仓库**：`liu1185616638/OpenCodeWriter`
- **分支**：`master`
- **本轮代码基线**：`a62239be1648c6ca49680e0ae347d46f72c4538c`（提交初版审查问题更新）
- **上一轮审查基线**：`b85b5ca0b37c22aa257848c87c5c98f3bf8267c4`
- **对照文档**：`docs/ArchitectsReply/2026-07-14-current-redesign-implementation-review.md`
- **复查方式**：比较两次提交、逐项核对上一轮 P0/P1/P2、前后端状态流与数据写入路径静态审查
- **限制**：当前环境无法拉取仓库执行本地构建；GitHub 提交也没有可确认的成功状态。因此本报告能确认静态代码问题，但仍需要本机执行 CI 命令和 Tauri 冒烟测试。

---

# 1. 总体结论

本轮修改不是无效修改，上一轮若干阻断项已经得到实质修复：

- 无边框窗口增加了拖动区、最小化、最大化/恢复和关闭；
- 设置入口增加了二级导航，侧栏设置会转到顶层设置路由；
- `useTheme` 和 `useSettings` 已改为全局 Provider；
- 大纲和项目定盘自动保存已改为读取最新 ref，并增加卸载 flush；
- 正文普通生成已区分 completed/failed/cancelled；
- 审核/修复完成处理不再依赖已经清空的 `generatingStage`；
- 状态栏和关于页版本号改为读取 Tauri 版本；
- `get_app_data_dir` 已实现并注册；
- CI 工作流已经加入；
- Ollama 等本地地址开始允许空 API Key。

但是当前版本仍然不能进入稳定发布阶段。最主要原因是：

```text
前端当前存在确定的 TypeScript 编译阻断
AI 取消仍不能立即中断底层请求
AIContext 存在重复终止回调
修复草稿会污染正文编辑器状态
统一 AI 草稿 / 应用事务层仍未实现
任务中心、快照、批量取消、审核锚点等核心能力仍未落地
```

本轮状态可以概括为：

| 类别 | 状态 |
|---|---|
| 窗口控制 | 基本修复，待桌面冒烟 |
| 自动保存旧闭包 | 基本修复，仍缺请求序列保护 |
| 设置导航 | 基本修复，仍有类型残留 |
| 全局主题/模型状态 | 已修复 |
| 正文失败/取消自动保存 | 部分修复 |
| AI 真取消 | 部分修复 |
| 审核/修复完成监听 | 部分修复，但引入终止回调竞态 |
| CI 门禁 | 工作流已添加，但当前代码静态检查会失败 |
| AI 草稿应用层 | 未修复 |
| 任务中心与批量任务 | 未修复 |
| 审核锚点与内容版本 | 未修复 |
| 工作区恢复、上下文透明、快照恢复 | 未修复 |

---

# 2. P0：当前仍必须优先修复的问题

## P0-1 `AppearancePage` 存在确定的 TypeScript 构建错误

### 现状

`src/views/settings/AppearancePage.tsx` 已经删除原来的本地处理函数，但 JSX 仍引用：

```tsx
onValueChange={handleDensityChange}
onValueChange={handleFontSizeChange}
```

文件中没有定义：

```ts
handleDensityChange
handleFontSizeChange
```

同时仍然导入了未使用的：

```ts
useState
useEffect
```

项目 `tsconfig.json` 开启了：

```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true
```

### 结果

当前 `pnpm build` 理论上至少会出现：

```text
Cannot find name 'handleDensityChange'
Cannot find name 'handleFontSizeChange'
'useState' is declared but its value is never read
'useEffect' is declared but its value is never read
```

### 修复

直接改成：

```tsx
<Select
  value={density}
  onValueChange={(value) => setDensity(value as Density)}
/>

<Select
  value={editorFontSize}
  onValueChange={setEditorFontSize}
/>
```

并删除未使用导入。更好的做法是在 `AppearanceContext` 导出 `Density` 类型，避免字符串强转散落在页面。

---

## P0-2 AI 取消仍不能立即中断底层 Runtime

### 已完成部分

新增了：

```text
AiSessionRegistry
session_id -> Arc<AtomicBool>
```

并且：

- `cancel_ai_session` 会设置取消标记；
- Runtime 循环会读取标记；
- 日志终态更新增加了 `status = 'started'` 条件，取消状态不再被成功覆盖。

这一部分解决了上一轮“日志 cancelled 后又变 success”的主要问题。

### 仍未完成部分

当前执行顺序是：

```rust
register(session_id)
let mut stream = runtime.run(request).await?;
loop {
    check_cancel_flag();
    timeout(stream.next()).await;
}
```

存在四个问题。

#### 1. `runtime.run(request).await` 阶段不可取消

代码注释明确指出 SDK Adapter 当前是非流式实现，会先收集完整响应再返回。若模型正在推理，取消标记无法打断 `runtime.run()`。

用户点击取消后：

```text
前端立即显示已取消
底层 SDK/HTTP 仍继续生成
Token 仍继续消耗
直到 Runtime 返回或超时
```

#### 2. 阻塞在 `stream.next()` 时取消不能唤醒

取消标记只在下一次进入循环前检查。若正在等待下一段数据，必须等数据到达或五分钟 timeout 才能退出。

#### 3. `runtime.run(request).await?` 出错会泄漏状态

如果 Runtime 创建流失败，当前 `?` 直接返回，未执行：

- `finish_generation_log(..., failed)`；
- `registry.unregister(session_id)`；
- `emit_error`。

可能留下：

```text
generation_logs.status = started
session registry 残留
任务中心永久显示运行中
```

#### 4. 数据应用阶段不再受取消保护

人物和章节命令执行顺序仍是：

```text
AiTaskService 执行完成
→ service unregister session
→ 解析 JSON
→ 写入人物/关系或章节
→ emit_done
```

用户在模型输出完成、数据库应用尚未结束的窗口点击取消，Registry 已经没有该 session，写入仍会继续。

### 正确修复

取消必须升级为真正的 session handle：

```rust
session_id -> {
  cancellation_token,
  runtime_abort_handle,
  phase: Running | Applying,
  terminal_status
}
```

Runtime 等待应使用：

```rust
tokio::select! {
    _ = cancellation_token.cancelled() => Err(Cancelled),
    result = runtime.run(request) => result,
}
```

`stream.next()` 同样必须放进 `select!`。此外：

- SDK Adapter 要提供 abort/kill 请求能力；
- OpenAI HTTP Runtime 要能 drop/abort 正在进行的请求；
- Runtime 获取流失败必须走统一 finally 清理；
- 数据库 apply 前再次确认 session 未取消；
- apply 阶段应处于事务内。

---

## P0-3 `AIContext` 正常完成和失败都可能回调两次

### 正常完成路径

当前 `ai-done` 监听器会：

```text
set completed
cleanup listeners
onComplete(content)
```

但后端命令随后返回，`await invoke(...)` 成功后又无条件设置一个 200ms fallback：

```text
set completed
cleanup
onComplete(content)
```

也就是说，在后端正常先 emit `ai-done`、再返回 command 的标准路径中，`onComplete` 有较大概率执行两次。

### 失败路径

`ai-error` 事件会先执行：

```text
onError(error)
```

随后 `invoke` 返回 Err，catch 分支又执行一次：

```text
onError(error)
```

### 取消路径

前端 `cancel()` 等待 `cancel_ai_session`。后端取消命令会主动 emit `ai-error`，因此可能先把任务设为 `failed` 并调用业务 `onError`，然后 `cancel()` 再把状态改为 `cancelled`。

用户可能看到：

```text
生成失败 toast
随后状态变为取消
```

### 影响

- 审核完成可能重复刷新；
- 人物/章节完成 toast 可能重复；
- 未来把 `onComplete` 用于 apply 时可能重复写库；
- 终态由事件、invoke 和 cancel 三套逻辑竞争决定。

### 修复

建立单一终止函数：

```ts
finalizeSession(sessionId, status, payload)
```

内部维护：

```ts
terminalSessionIdsRef: Set<string>
```

任何 done/error/cancel/fallback 都必须先执行原子式 guard：

```ts
if (alreadyFinalized(sessionId)) return
```

另外：

- fallback 只能在 invoke 返回且 session 尚未终止时执行；
- `ai-done` 到达后应把 `sessionIdRef.current = null`；
- cancel 错误应使用独立 `ai-cancelled` 事件或错误类型，而不是普通 `ai-error`；
- onComplete/onError/onCancel 分开。

---

## P0-4 章节修复草稿仍会污染中央正文

### 当前行为

`ContentEditor` 对以下两个 stage 都执行：

```ts
if (generatingStage === "content" || generatingStage === "repair") {
  setText(streamedContent)
}
```

因此点击“一键修复”后，AI 流式输出会直接替换中央正文显示。

`ChapterQualityPanel` 虽然会在完成后创建 `repairDraft` 并显示 diff，但：

- “放弃”只执行 `setRepairDraft(null)`；
- 不会通知 `ContentEditor` 恢复原正文；
- 中央 `text` 仍然是修复后的文本；
- 用户点击普通“保存”即可把本应放弃的修复结果写入数据库。

### 取消时还有状态串扰

`textBeforeGenerationRef` 只在正文生成和正文润色入口中设置。修复由 `ChapterQualityPanel` 发起，没有初始化该 ref。

取消 repair 时 `ContentEditor` 却会执行：

```ts
setText(textBeforeGenerationRef.current)
```

这个 ref 可能是：

- 上一次正文生成前的旧内容；
- 上一次润色前内容；
- 初始空字符串。

### 另外两个 stale closure

`startGenerate` 使用 `text`，但依赖数组缺少 `text`；`handlePolish` 同样使用 `text`，依赖数组也缺少 `text`。这可能让 append 基础文本和失败恢复文本落后于当前编辑内容。

### 修复

修复输出绝不能写入中央正文 state：

```text
currentText 保持不变
repairStream 单独存储
repairDraft 完成后显示 diff
Apply -> snapshot + save + setText
Discard -> 清空 repairDraft，不碰 currentText
```

建议把 repair、polish、content 统一成同一套 `GenerationDraft` 状态，而不是让页面根据 stage 猜测如何处理全局 `streamedContent`。

---

## P0-5 统一 AI 草稿 / 审阅 / 应用层仍完全没有落地

上一轮最关键的 P0-6 仍然没有修改。

仓库中仍没有：

```text
generation_drafts 表
draft repository
apply_generation_draft
discard_generation_draft
待审阅任务恢复
应用前统一快照
结构化逐项选择
```

当前仍然是：

| 功能 | 当前方式 |
|---|---|
| 大纲 | React 本地 draft，切页丢失 |
| 正文 | 流入编辑器，成功后直接保存 |
| 人物 | AI 完成后后端直接逐条 INSERT |
| 章节 | AI 完成后后端直接逐条 INSERT |
| 章节润色 | 后端直接应用 |
| 修复 | 仅局部前端 diff，不持久化 |

这意味着：

- AI 结果不能跨页面恢复；
- 人物和章节不能逐项勾选；
- 结构化写入仍可能半成功；
- 取消与 apply 没有统一生命周期；
- 任务中心无法显示“待审阅”。

这项必须继续作为最高优先级架构任务，而不是后续体验优化。

---

## P0-6 CI 文件已添加，但当前门禁尚未闭环

### 已完成

新增 CI：

```text
pnpm install --frozen-lockfile
pnpm build:sdk-adapter
pnpm build
cargo check
cargo test --lib
```

### 当前问题

1. 当前提交没有可确认的成功状态；
2. `AppearancePage` 的静态错误意味着前端 job 预计会失败；
3. `pnpm build` 本身已经包含 `build:sdk-adapter`，CI 又提前执行一次，存在重复构建；
4. 没有执行 `pnpm tauri build --debug`；
5. CI 只跑 Linux，窗口能力没有 Windows 验证；
6. 没有旧 SQLite 数据库迁移测试；
7. 没有前端单元测试或关键状态流测试。

### 建议

最低要求：

```yaml
frontend:
  pnpm install --frozen-lockfile
  pnpm build

backend:
  cargo check
  cargo test --lib

windows-tauri:
  runs-on: windows-latest
  pnpm install --frozen-lockfile
  pnpm tauri build --debug
```

再增加自动测试：

- AIContext terminal guard；
- 取消时不执行 onComplete；
- 正文失败/取消不保存；
- 自动保存最后一个字；
- 老数据库 migration；
- 设置路由全部可达。

---

# 3. 上一轮问题中仅“部分修复”的项目

## 3.1 P0-4 自动保存：旧闭包已修，竞态保护仍缺

大纲和项目定盘现在通过 ref 读取最新状态，并在卸载时 best-effort flush。这已经修复“最后一个字落后一拍”的主要问题。

仍缺：

- 保存请求序号；
- 旧请求晚返回时的状态保护；
- 保存版本与 dirty 状态对应；
- flush 失败后的可见提示；
- 路由切换前可等待的统一 flush 协议。

如果用户连续慢速保存，旧请求晚于新请求结束，仍可能把 UI 状态错误标记为“已保存”。

## 3.2 P0-5 设置路由：入口已修，类型模型仍重复

侧栏设置已被拦截并跳转顶层设置路由，二级导航也已实现。

但 `WorkspaceRoute` 类型仍包含：

```ts
"settings"
```

App 的 workspace switch 也仍保留不可达的 `case "settings"`。建议彻底删除该值，让类型系统保证设置只能走：

```ts
{ name: "settings", tab }
```

## 3.3 P1-3 专注模式：Shell 改善，页面架构仍不统一

Shell 已经在专注模式下不渲染 TaskDrawer 和 StatusBar，并保存导航/抽屉布局快照。

但检查器仍由各页面自己管理：

- 正文页读取 `focusMode`；
- 大纲页只对右侧检查器做局部处理；
- 人物、世界观、事实等页面没有统一策略；
- `setFocusMode(v)` 直接改布尔值，不走布局快照逻辑。

应明确统一协议：页面级左右面板都消费同一 focus layout contract。

## 3.4 P1-16 外观设置：字号部分接入，密度没有接入

`AppearanceProvider` 已设置：

```text
data-density
--editor-font-size
--density-scale
```

正文编辑器也开始使用 `--editor-font-size`，这部分有效。

但：

- `--density-scale` 没有被 CSS token 使用；
- 控件高度、间距、面板行高仍是固定值；
- `data-density` 没有对应 CSS 规则；
- 当前 AppearancePage 还存在编译错误。

因此只能算“字号部分修复，密度未修复”。

## 3.5 Ollama 空 Key：向导修了，模型设置页仍未修完

向导和后端请求已经允许本地地址空 Key。

但模型设置页按钮仍使用：

```tsx
disabled={... || !newApiKey}
```

新增预设按钮也仍要求 `newApiKey`。因此在设置页新增 Ollama 预设时，用户仍无法空 Key 操作。

此外 `isLocalProvider` 使用字符串包含判断，建议使用 `new URL(apiBase).hostname` 严格判断 localhost、127.0.0.1、::1。

---

# 4. 上一轮仍完全没有修改到的核心问题

## P1-5 任务中心仍是只读时间线

后端 DTO 声明支持：

```text
generation | job | snapshot
```

实际仍只查询：

- `generation_logs`；
- `jobs`。

没有查询 `content_snapshots`。

前端任务中心和任务抽屉仍然缺少：

- 对历史运行任务取消；
- 重试；
- 跳转目标；
- 查看输入上下文；
- 查看待审阅草稿；
- 快照预览与恢复；
- 分页或游标。

`get_retry_info` 仍没有形成可执行重试，因为原始 typed 参数没有完整保存。

## P1-6 批量任务仍不可取消，进度字段仍未进入执行逻辑

`jobs` 已有数据库字段：

```text
progress_current
progress_total
cancel_requested
```

但 Rust `Job` 模型和 `jobs.rs` 仍不读取这些字段。

`batch_generate_chapters` 循环仍然：

```text
每章生成
→ result_json 写 completed_chapters/current_index
→ 下一章
```

没有：

- 每章开始前读取 `cancel_requested`；
- `cancel_job` 命令；
- 更新 `progress_current/progress_total`；
- 取消当前子 session；
- cancelled 终态。

## P1-7 章节新任务单字段仍没有进入 AI 上下文

数据库和前端已有：

- viewpoint；
- scene；
- cast_character_ids_json；
- turning_point；
- outcome；
- status。

但 Rust `ChapterTaskSheet` 仍只包含：

- goal；
- conflict_level；
- hook；
- payoff；
- must_avoid；
- target_word_count。

正文生成、审核和修复仍看不到完整任务单。

应将角色 ID 转换为人物名称、身份、当前状态摘要后注入。

## P1-8 人物与章节仍直接写库且没有整体事务

人物和章节生成完成后仍在后端直接逐条写入。

仍缺：

- 待审阅；
- 逐项选择；
- 整体 transaction；
- apply 前版本检查；
- apply 前快照/备份；
- apply 阶段取消检查。

## P1-9 / P1-10 审核锚点与内容版本仍未实现

后端审核问题结构仍只有：

```text
type
severity
description
location
```

没有：

```text
quote
start/end
context_before/context_after
```

`chapter_reviews` 表也没有：

```text
content_hash
content_updated_at
snapshot_id
```

前端判断正文是否变化仍然是：

```ts
latestReview && currentContent && hasContent
```

只要存在审核和正文，该提示就恒为真。

## P1-11 项目定盘修改仍不会传播 stale marker

`save_project_profile` 仍只更新 `project_profiles`。

没有：

- 计算具体变更字段；
- 标记大纲/章节/正文 stale；
- 保存前确认影响；
- 保存后刷新影响；
- 依赖传播日志。

当前“影响预览”仍是静态提示，不是实际依赖系统。

## P1-12 工作区路由、项目和布局仍不能恢复

启动时仍无条件进入项目库；`currentProject`、route history 和 Workbench layout 全在内存中。

仍没有：

```text
project_workspace_state
get_workspace_bootstrap
save_workspace_state
route.projectId -> 自动加载 Project
```

因此重启后不能回到上次项目和页面，任务中心未来也无法只凭 route 跳转并恢复项目。

## P1-13 / P1-14 项目时间和摘要仍不准确

仍使用 `projects.updated_at` 同时表达：

- 最近编辑；
- 最近打开。

`touch_project_opened` 会伪造一次“最近编辑”。

项目摘要仍只统计失败的 jobs，没有完整统计 generation logs、运行中任务、取消任务、审核问题和最近编辑章节。

## P1-15 项目库亮色与小窗口响应式仍未修

仍然存在：

```text
左栏固定 380px
右侧内容固定 760px
右侧背景硬编码 #10161E
Tauri minWidth 800px
```

亮色模式下右侧仍是深色，小窗口理论所需宽度仍超过窗口宽度。

## P1-17 命令面板仍是假入口

顶栏仍显示命令面板按钮，但没有 `onClick`；快捷键系统也没有 Ctrl/Cmd+K。

应完成命令面板，或者暂时移除按钮，避免不可用入口。

## P1-18 正文快照页仍是占位

正文检查器仍直接显示：

```text
快照功能将在 Phase F 中完善
```

没有列表、预览、恢复、恢复前快照和版本比较。

## P1-19 知识库召回记录仍是假记录

知识库仍把最近 `generation_logs` 当作“召回记录”。

没有保存实际召回：

- source id；
- chunk id；
- score；
- 注入顺序；
- 截断情况；
- 用户排除项。

## P1-20 伏笔逾期判断仍错误

仍使用：

```ts
status === "setup" && !payoff_chapter_id
```

这会把所有尚未指定回收章节的伏笔都判为逾期。

逾期必须根据计划回收章节和当前已完成章节比较，或增加显式 deadline。

---

# 5. 仍未修改的 P2 问题

以下问题本轮基本未触及：

1. 模型连接测试仍固定调用 `/chat/completions`，没有 timeout，也不复用真实 Runtime/fallback；
2. `list_model_presets` 仍把完整 API Key 返回前端；
3. 正文仍是普通 Textarea，大文本、稳定定位、查找替换和 decorations 能力不足；
4. 新旧视觉语言仍混用，设置页和知识库仍大量使用 `rounded-3xl`、`rounded-full`、Card shadow；
5. 人物、事实、伏笔、世界观等删除仍缺统一引用影响预览；
6. 章节 reorder/move 仍未使用 SQLite transaction；
7. `move_chapter` 仍需严格验证 before/after 与当前章节属于同一项目；
8. 状态栏现在已正确改称“已配置”，但仍没有真实连接健康检查；
9. 设置路由映射仍把 tools-permissions 和 mcp 指向同一旧页面，信息架构尚未完全拆开；
10. UI 仍缺系统化键盘可访问性和视觉回归测试。

---

# 6. 建议下一轮只修以下顺序

## 第一批：恢复可构建

```text
fix AppearancePage undefined handlers
运行 pnpm build
运行 cargo check
运行 cargo test --lib
```

## 第二批：统一 AI 终态

```text
single finalizeSession guard
独立 completed / failed / cancelled 事件
消除 fallback 双回调
runtime.run 与 stream.next 支持 cancellation select
所有异常路径 finally unregister
```

## 第三批：正文和修复数据安全

```text
repair stream 与正文 text 完全分离
content/polish/repair 全部进入 draft
放弃不改变正文 state 和数据库
应用前创建 snapshot
apply transaction + base version check
```

## 第四批：统一 Generation Draft

```text
generation_drafts migration
create/list/get/apply/discard draft commands
人物、章节、大纲、正文迁移到统一流程
任务中心显示 Pending Review
```

## 第五批：任务生命周期

```text
cancel_job
retry payload
真实 progress fields
快照进入任务中心
跳转、恢复、分页
```

完成上述五批后，再处理章节上下文、审核锚点、工作区恢复、知识召回透明和响应式视觉。

---

# 7. 下一轮验收重点

## 构建

- `pnpm build` 成功；
- `cargo check` 成功；
- `cargo test --lib` 成功；
- Windows `pnpm tauri build --debug` 成功；
- GitHub commit 有绿色 required checks。

## AI 取消

- 首包前取消可立即结束底层请求；
- 等待下一 chunk 时取消可立即唤醒；
- Runtime 创建失败不会留下 started 日志；
- 取消后人物/章节不会进入 apply；
- onError/onCancel 只执行一次。

## 正文

- repair 流式输出不改变中央正文；
- 放弃修复后正文显示和数据库均保持原样；
- 取消 repair 不会恢复成其他历史文本；
- content/polish/repair 都必须先进入待审阅；
- apply 前快照存在且事务成功。

## 设置

- AppearancePage 可编译；
- 本地模型在设置页可以空 Key 新增、获取模型；
- 字号立即生效；
- 密度设置真实改变控件和间距。

---

# 8. 最终判断

相较上一版，这一版已经把“工作台明显无法使用”的若干问题修掉，特别是窗口控制、设置导航和全局状态，方向是正确的。

但目前仍有两个事实不能忽略：

1. **当前代码存在确定的前端构建阻断，CI 还没有真正形成绿色门禁。**
2. **AI 安全边界仍未完成。取消、终态、修复草稿和统一应用事务之间仍存在状态竞争。**

因此下一轮不建议继续扩展页面。应先让代码可构建，再集中完成 AI session 生命周期与 generation draft/application layer。只有这两个层次闭环后，项目才真正具备“数据不丢、AI 不误覆盖、任务可控”的稳定基础。