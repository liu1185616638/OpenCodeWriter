# 2026-07-14 未完成核心问题详细实施规格

## 0. 文档信息

- **用户问题**：`把未完成的核心问题写成一份详细的文档提交`
- **仓库**：`liu1185616638/OpenCodeWriter`
- **分支**：`master`
- **当前 master 基线**：`d57932095ad8fd08fb8f23389f8d12117b4d9d15`
- **当前业务代码基线**：`bceb9194e57a72341850d92b4d466fea07a95cd9`
- **前置审查文档**：`docs/ArchitectsReply/2026-07-14-second-redesign-fix-review.md`
- **前置实施记录**：`docs/ArchitectsReply/2026-07-14-second-review-fix-implementation-progress.md`
- **文档目的**：把尚未关闭的核心问题转成可直接执行的数据库、后端、前端、测试和发布任务。

> 本文不是泛化待办清单。每个问题均包含现状、风险、目标架构、数据结构、接口、修改文件、迁移步骤、验收标准和测试要求。

---

# 1. 当前基线与总体判断

当前版本已经完成以下高风险修正：

- AI 前端终态统一结算；
- 取消事件和失败事件分离；
- Runtime 启动与流等待可以被取消信号唤醒；
- 修复结果与中央正文隔离；
- 批量任务拥有真实进度、取消命令和任务中心入口；
- 快照进入统一任务时间线；
- 外观设置的明确 TypeScript 阻断已修正。

但是，当前系统仍然以“AI 命令直接产生最终业务写入”为主。它缺少一个位于 AI 生成与业务数据之间的统一审阅、版本校验、快照和事务应用层。

当前最大结构性风险可以归纳为：

```text
AI 输出
  ↓
局部页面状态或命令内解析
  ↓
直接覆盖正文 / 多次 INSERT 人物与章节
  ↓
失败、取消、版本冲突和恢复能力由各页面分别处理
```

目标架构应统一为：

```text
AI Session
  ↓
Generation Draft（持久化、可恢复、带基线版本）
  ↓
用户审阅 / 逐项选择 / 冲突检测
  ↓
Snapshot
  ↓
Transactional Apply
  ↓
最终业务数据 + Stale 传播 + 审计记录
```

在该架构落地以前，不应把当前版本定义为稳定发布版。

---

# 2. 优先级与依赖关系

| 编号 | 核心问题 | 优先级 | 依赖 | 建议批次 |
|---|---|---:|---|---|
| CORE-001 | 构建、迁移和桌面冒烟门禁未闭环 | P0 | 无 | 第 0 批 |
| CORE-002 | 统一 `GenerationDraft` 持久化层缺失 | P0 | CORE-001 | 第 1 批 |
| CORE-003 | 正文生成/润色仍直接覆盖和自动保存 | P0 | CORE-002 | 第 2 批 |
| CORE-004 | 人物/章节结构化 Apply 缺事务、版本和取消保护 | P0 | CORE-002 | 第 3 批 |
| CORE-005 | Provider 专用远端 Abort 未实现 | P0 | CORE-001 | 第 3 批，可并行 |
| CORE-006 | 快照缺预览、恢复和恢复前保护 | P1 | CORE-002/003 | 第 4 批 |
| CORE-007 | 任务中心缺可靠重试、跳转、分页和待审阅入口 | P1 | CORE-002/006 | 第 4 批 |
| CORE-008 | 审核锚点与正文版本绑定缺失 | P1 | CORE-006 | 第 5 批 |
| CORE-009 | 章节任务单字段没有完整注入 AI 上下文 | P1 | 无 | 第 5 批 |
| CORE-010 | 项目定盘修改没有真实 Stale 传播事务 | P1 | CORE-006 | 第 5 批 |
| CORE-011 | 工作区、路由和布局无法恢复 | P1 | 无 | 第 6 批 |
| CORE-012 | `last_opened_at` 与内容编辑时间混用 | P1 | 数据迁移 | 第 6 批 |
| CORE-013 | 项目摘要、任务健康和项目库响应式不足 | P1 | CORE-012 | 第 6 批 |
| CORE-014 | API Key 明文返回前端 | P1/P2 | 设置重构 | 第 7 批 |
| CORE-015 | 知识库召回上下文不透明 | P2 | 无 | 第 7 批 |
| CORE-016 | 伏笔逾期规则不准确 | P2 | 章节计划字段 | 第 7 批 |
| CORE-017 | 删除、排序、移动操作缺统一事务与影响预览 | P2 | 通用事务服务 | 第 7 批 |
| CORE-018 | 命令面板、编辑器锚点和视觉一致性未完成 | P2 | 核心数据流稳定 | 最后处理 |

关键依赖链：

```text
真实构建门禁
  → GenerationDraft
    → 正文草稿化
    → 人物/章节事务化 Apply
      → 快照恢复
      → 任务中心待审阅 / 重试 / 跳转
        → 审核版本和锚点
```

---

# 3. CORE-001：构建、迁移和桌面冒烟门禁未闭环

## 3.1 当前现状

当前仓库有 CI 工作流，但本轮环境未获得可确认的 combined status 或 workflow run，也未实际执行：

```bash
pnpm build
cargo fmt --check
cargo check
cargo test --lib
pnpm tauri build --debug
```

本轮新增了 Rust 并发、Tauri command、SQL 查询和前端状态变更。仅靠静态审查不能证明：

- Rust 生命周期和 Send/Sync 约束全部通过；
- SQLite 旧数据库迁移可重复执行；
- Tauri Windows 打包能力正常；
- 前端无新的 TypeScript、Hook 依赖和运行时问题；
- 取消事件的实际到达顺序符合预期。

## 3.2 目标

建立不可绕过的发布门禁：

```text
Frontend Build
+ Rust Format
+ Rust Check
+ Rust Tests
+ Migration Tests
+ Windows Tauri Debug Build
+ AI 生命周期前端测试
+ 最小桌面冒烟清单
```

## 3.3 CI 调整

建议工作流分为三个 Job：

### Job A：frontend

```bash
pnpm install --frozen-lockfile
pnpm build
```

要求：

- 不重复单独执行已经被 `pnpm build` 包含的 SDK Adapter 构建；
- 缓存 pnpm store；
- 将 TypeScript 错误视为阻断；
- 添加最小单元测试命令后设为 required check。

### Job B：rust-linux-check

```bash
cargo fmt --check
cargo check --locked
cargo test --locked --lib
```

### Job C：tauri-windows-build

运行环境：`windows-latest`

```powershell
pnpm install --frozen-lockfile
pnpm tauri build --debug
```

## 3.4 数据迁移测试

新增临时 SQLite 测试：

1. 使用旧版 schema 创建数据库；
2. 插入项目、正文、任务和快照样例；
3. 执行全部迁移两次；
4. 验证列、索引和数据不丢失；
5. 验证 `generation_drafts`、版本字段和 `last_opened_at` 后续迁移；
6. 验证重复启动不会报 `duplicate column` 或破坏索引。

## 3.5 修改文件

```text
.github/workflows/ci.yml
package.json
src-tauri/src/db/migrations.rs
src-tauri/src/db/migration_tests.rs（建议新增）
src/contexts/__tests__/AIContext.test.tsx（建议新增）
```

## 3.6 验收标准

- master 的 frontend、rust-check、windows-tauri-build 全部绿色；
- 旧数据库迁移测试可重复运行；
- `AIContext` 完成、失败、取消各只调用一次业务回调；
- CI 失败时禁止合并发布分支；
- 文档中记录一次真实 Windows 冒烟结果。

---

# 4. CORE-002：统一 GenerationDraft 持久化层

## 4.1 当前现状

目前只有章节修复使用局部 React 状态保存修复草稿。以下任务仍没有统一持久化草稿：

- 大纲生成；
- 正文生成；
- 正文润色；
- 人物生成；
- 章节生成；
- 结构化批量生成；
- 后续可能增加的世界观、事实、伏笔生成。

页面切换、应用重启或任务中心重新进入后，无法恢复待审阅结果。

## 4.2 设计目标

GenerationDraft 必须解决：

1. AI 输出与最终数据分离；
2. 页面切换和应用重启后可恢复；
3. 保存生成时的目标基线版本；
4. 支持文本和结构化 JSON；
5. 支持 replace、append、polish、repair 等应用模式；
6. 支持逐项选择；
7. 支持 applied、discarded、conflicted 等终态；
8. Apply 前自动创建快照；
9. Apply 必须幂等；
10. 任务中心可以打开草稿。

## 4.3 建议数据库表

新增迁移：

```sql
CREATE TABLE IF NOT EXISTS generation_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,

  task_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  apply_mode TEXT NOT NULL DEFAULT 'replace',

  content_type TEXT NOT NULL DEFAULT 'text',
  content_text TEXT DEFAULT '',
  content_json TEXT DEFAULT '{}',

  base_version TEXT DEFAULT '',
  base_updated_at TEXT DEFAULT '',
  base_content_hash TEXT DEFAULT '',
  base_snapshot_id INTEGER REFERENCES content_snapshots(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'generating',
  error TEXT DEFAULT '',
  selected_items_json TEXT DEFAULT '[]',
  apply_result_json TEXT DEFAULT '{}',

  model_name TEXT DEFAULT '',
  input_manifest_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  applied_at TEXT,
  discarded_at TEXT,

  UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS idx_generation_drafts_project_status
ON generation_drafts(project_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_drafts_target
ON generation_drafts(project_id, target_type, target_id, status);
```

## 4.4 状态机

```text
creating
  → generating
    → pending_review
      → applying
        → applied
      → conflicted
      → discarded
    → failed
    → cancelled
```

约束：

- 只有 `pending_review` 和 `conflicted` 可以 Apply；
- `applying` 必须在事务开始前写入；
- `applied`、`discarded`、`failed`、`cancelled` 为终态；
- 对同一 draft 重复 Apply 必须返回已有结果，不得重复写入；
- `conflicted` 不允许无提示强制覆盖，必须重新生成或明确确认。

## 4.5 后端模型

建议新增：

```rust
pub struct GenerationDraft {
    pub id: i64,
    pub project_id: i64,
    pub session_id: String,
    pub job_id: Option<i64>,
    pub task_type: String,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub apply_mode: String,
    pub content_type: String,
    pub content_text: String,
    pub content_json: String,
    pub base_version: String,
    pub base_updated_at: String,
    pub base_content_hash: String,
    pub status: String,
    pub selected_items_json: String,
    pub input_manifest_json: String,
    pub created_at: String,
    pub updated_at: String,
}
```

## 4.6 Tauri Commands

建议新增：

```text
create_generation_draft
get_generation_draft
list_generation_drafts
update_generation_draft_output
mark_generation_draft_pending_review
apply_generation_draft
discard_generation_draft
resolve_generation_draft_conflict
```

### create_generation_draft

输入：

```ts
{
  projectId,
  sessionId,
  jobId?,
  taskType,
  targetType,
  targetId?,
  applyMode,
  contentType,
  baseVersion,
  baseUpdatedAt,
  baseContentHash,
  inputManifest
}
```

返回 draft ID。

### apply_generation_draft

输入：

```ts
{
  draftId,
  selectedItemIds?: string[],
  expectedBaseVersion,
  conflictPolicy: "reject" | "force-after-confirmation"
}
```

返回：

```ts
{
  draftId,
  status: "applied" | "conflicted",
  snapshotId?,
  affectedTargets: Array<{ type: string; id: number }>,
  warnings: string[]
}
```

## 4.7 前端 Context

建议新增 `GenerationDraftContext`，只负责：

- 当前待审阅草稿；
- 草稿列表和详情加载；
- Apply/Discard；
- 版本冲突提示；
- 跳转目标；
- 与任务中心同步。

AIContext 继续只负责 AI session 生命周期，不负责最终业务 Apply。

## 4.8 修改文件

```text
src-tauri/src/db/migrations.rs
src-tauri/src/models.rs
src-tauri/src/commands/generation_drafts.rs（新增）
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
src/contexts/GenerationDraftContext.tsx（新增）
src/lib/tauri.ts
src/types/index.ts
src/views/TaskCenter.tsx
src/components/ai/GenerationDraftReview.tsx（新增）
```

## 4.9 验收标准

- 任一 AI 生成任务完成后可以只产生 draft，不直接写业务表；
- 重启应用后可以恢复 `pending_review` 草稿；
- Apply 前目标变化会进入 `conflicted`；
- Apply 成功必有快照或明确说明目标为空无需快照；
- Apply 重复调用不会重复插入人物或章节；
- Discard 后不能再次 Apply；
- 任务中心可打开草稿详情。

---

# 5. CORE-003：正文生成和润色迁移为草稿流程

## 5.1 当前现状

`ContentEditor` 当前仍存在：

```text
streamedContent
→ setText
→ 生成 completed
→ saveContent
```

具体风险：

- replace 生成开始时会清空中央正文；
- 成功后直接自动保存，用户没有审阅机会；
- `startGenerate` 和 `handlePolish` 回调依赖缺少 `text`，存在旧闭包风险；
- 失败/取消恢复仍残留 `repair` 分支；
- 正文草稿无法跨页面和重启恢复；
- append、replace、polish 规则散落在页面。

## 5.2 目标流程

```text
用户选择生成方式
→ 创建 draft 并记录正文 hash/updated_at
→ AI 输出写入 draft
→ 中央正文保持原样
→ 右侧或全屏显示草稿 diff
→ Apply：再次检查版本
→ 创建正文快照
→ transaction 保存正文
→ draft = applied
```

## 5.3 应用模式

### replace

草稿预览显示旧正文与新正文完整差异。

### append

Apply 时由后端根据基线正文生成：

```text
base_content + "\n\n" + draft_content
```

不能在前端用当前 `text` 拼接后直接保存，否则版本校验没有权威性。

### polish

按 replace 处理，但 task_type 标记为 `content_polish`，输入 manifest 必须包含：

- 原正文 hash；
- 原正文字符数；
- 使用的模型；
- 风格规则版本；
- stopwords 版本。

### repair

现有本地 `repair-draft` 应迁移到同一持久化表，不再保留第二套草稿系统。

## 5.4 前端修改

删除或重构：

```ts
if (generating && generatingStage === "content") {
  setText(streamedContent)
}
```

正文中央区保持可编辑原稿；生成过程中显示：

- 独立浮层或右侧 Draft Preview；
- 字数、模型、耗时；
- 停止按钮；
- 生成完成后的 Apply/Discard。

必须修正 Hook 依赖：

```ts
startGenerate dependencies += text
handlePolish dependencies += text
```

但完成草稿迁移后，生成函数不应再依赖闭包中的 `text` 进行最终保存，只用于创建基线 manifest。

## 5.5 后端 Apply 事务

```text
BEGIN IMMEDIATE
→ SELECT contents.updated_at/content
→ 校验 expected hash/version
→ create_snapshot(reason = ai_generate/apply_mode)
→ UPDATE contents
→ UPDATE draft status=applied
→ COMMIT
```

任何一步失败必须 rollback。

## 5.6 修改文件

```text
src/views/ContentEditor.tsx
src/components/ai/GenerateConfirmDialog.tsx
src/components/ai/ChapterQualityPanel.tsx
src/components/ai/GenerationDraftReview.tsx
src-tauri/src/commands/contents.rs
src-tauri/src/commands/generation_drafts.rs
```

## 5.7 验收标准

- 生成和润色期间中央正文不被替换；
- 取消和失败不需要“恢复正文”，因为正文从未改变；
- 放弃草稿后正文和数据库完全不变；
- 生成期间手工编辑正文，Apply 会提示冲突；
- replace、append、polish、repair 均通过统一 Apply；
- Apply 自动创建快照；
- 应用重启后草稿仍可继续审阅。

---

# 6. CORE-004：人物与章节结构化 Apply 事务化

## 6.1 当前现状

人物和章节生成仍是：

```text
Runtime 输出
→ strip thinking
→ parse JSON
→ 多次 INSERT
```

风险：

- 第 N 条写入失败时，前 N-1 条可能已经写入；
- 取消发生在 Runtime 结束后、写库过程中时无法阻止提交；
- 重试可能重复插入；
- 无法逐项选择；
- 无基线版本，旧结果可能覆盖或追加到已经变化的项目；
- 生成完成即写库，用户无法审阅。

## 6.2 目标

AI 命令只负责生成并保存结构化草稿：

```json
{
  "schema_version": 1,
  "items": [],
  "relations": [],
  "warnings": []
}
```

真正 Apply 由独立服务完成。

## 6.3 ApplyService

建议新增：

```text
src-tauri/src/services/draft_apply.rs
```

接口：

```rust
pub enum ApplyTarget {
    Outline,
    Content,
    Characters,
    Chapters,
    WorldItems,
}

pub struct ApplyContext {
    draft_id: i64,
    expected_base_version: String,
    selected_item_ids: Vec<String>,
    cancellation: Option<Arc<SessionCancellation>>,
}
```

## 6.4 人物 Apply

事务内：

1. 校验项目仍存在；
2. 校验人物集合基线版本；
3. 校验草稿 schema；
4. 校验名称重复和 relation 引用；
5. 创建人物集合快照或导出 JSON 快照；
6. 按选择项插入人物；
7. 构建草稿临时 ID 到真实 ID 的映射；
8. 插入关系；
9. 取消检查；
10. 更新 draft applied 和结果映射；
11. commit。

重复 Apply 必须读取 `apply_result_json` 返回既有映射。

## 6.5 章节 Apply

事务内：

1. 校验章节列表基线；
2. 校验 chapter_number/sort_order；
3. 校验 cast_character_ids 属于同一项目；
4. 创建章节集合快照；
5. 插入选择章节；
6. 写入完整任务单字段；
7. 更新项目 stage/stale；
8. 取消检查；
9. 更新 draft；
10. commit。

## 6.6 取消语义

Session 应保留阶段：

```text
Running
PendingReview
Applying
Terminal
```

对于 Apply：

- 用户在 `PendingReview` 取消等价于 discard；
- 用户在 `Applying` 点击取消，只能在事务提交前生效；
- commit 开始后 UI 显示“正在提交，无法中断”；
- 任何取消必须 rollback，不得产生半成品。

## 6.7 验收标准

- 人物/章节任意一项校验失败不会写入任何项目数据；
- 用户可逐项选择；
- 关系引用不会指向未选择人物；
- 取消 Apply 不产生半成品；
- 重复 Apply 不重复插入；
- 版本冲突时进入 conflicted；
- Apply 日志记录真实影响数量。

---

# 7. CORE-005：Provider 专用远端 Abort

## 7.1 当前现状

当前 `tokio::select!` 可以立即 drop Runtime future，但这只保证本地 Rust 任务退出。是否停止远端推理与计费，取决于：

- reqwest 请求是否在 drop 后断开；
- SDK Adapter 是否已经启动独立子进程或收集完整响应；
- provider 是否提供 cancel API；
- 代理层是否继续消费上游响应。

因此不能把“前端立即显示已取消”等同于“远端推理已经终止”。

## 7.2 Runtime 接口调整

建议将：

```rust
runtime.run(request).await
```

升级为：

```rust
runtime.start(request, cancellation.clone()).await
```

或返回：

```rust
pub struct RuntimeExecution {
    pub stream: AiStream,
    pub abort: Box<dyn RuntimeAbort>,
}
```

接口：

```rust
#[async_trait]
pub trait RuntimeAbort: Send + Sync {
    async fn abort(&self) -> Result<(), String>;
}
```

## 7.3 Provider 策略

### OpenAI Compatible HTTP

- 使用每次请求独立 cancellation token；
- drop response body；
- 确保连接不再读取；
- 记录 provider_abort_result；
- 设置连接、首包、idle、总时长四类 timeout。

### SDK Adapter

如果 Adapter 是外部进程或子请求：

- 每个 session 必须映射 child request ID；
- 支持 stdin cancel、HTTP cancel 或 kill child；
- 父进程取消后停止收集完整响应；
- Adapter 退出必须回收资源。

### 支持 Provider Cancel API 的服务

- 保存远端 request ID；
- cancel 时调用 provider endpoint；
- 失败时仍 drop 本地流，并在日志标记 `remote_abort_uncertain`。

## 7.4 日志字段

建议 generation_logs 增加：

```text
cancel_requested_at
local_abort_at
remote_abort_status
remote_request_id
```

## 7.5 验收标准

- 首包前取消在 1 秒内结束本地 session；
- 流中取消在 1 秒内停止前端 chunk；
- 支持的 provider 可以确认远端 request 已取消；
- 不支持的 provider 明确记录 `uncertain`，不能伪装为 confirmed；
- Adapter 子进程没有残留；
- 取消不会变成普通失败 toast。

---

# 8. CORE-006：快照预览与安全恢复

## 8.1 当前现状

快照后端目前只有：

```text
create_snapshot
list_snapshots
delete_old_snapshots
```

任务中心可以看见快照记录，但不能：

- 查看内容；
- 对比当前版本；
- 恢复；
- 在恢复前创建保护快照；
- 检查目标是否发生变化。

## 8.2 新增命令

```text
get_snapshot(snapshot_id)
preview_snapshot_restore(snapshot_id)
restore_snapshot(snapshot_id, expected_current_version)
```

### preview_snapshot_restore

返回：

```ts
{
  snapshot,
  currentContent,
  diffSummary,
  currentVersion,
  canRestore,
  warnings
}
```

### restore_snapshot

事务：

```text
BEGIN IMMEDIATE
→ 读取当前目标并校验 expected version
→ 创建 reason=before_restore 的保护快照
→ 恢复目标
→ 标记下游 stale
→ COMMIT
```

## 8.3 快照类型

统一 target_type：

```text
outline
content
characters
chapters
project_profile
world_items
```

结构化集合内容使用版本化 JSON，不能只保存自由文本。

## 8.4 验收标准

- 任务中心和正文检查器均可预览快照；
- 恢复前显示差异；
- 目标变化时拒绝静默覆盖；
- 恢复操作本身可再次撤销；
- 恢复后下游 stale 正确产生；
- 旧文本快照仍可读取。

---

# 9. CORE-007：任务中心完整动作

## 9.1 当前现状

已实现：

```text
查看
筛选
自动刷新
普通生成取消
批量任务取消
进度
快照时间线
```

仍缺：

```text
可靠重试
目标跳转
分页/游标
待审阅草稿入口
快照预览与恢复
输入上下文透明度
```

## 9.2 可靠重试

generation_logs 当前无法完整重建原命令参数。建议新增：

```text
request_args_json
input_manifest_json
preset_id
route_snapshot_json
```

重试不能让前端根据 `task_type` 猜参数，而应由后端：

```text
retry_generation(session_id)
```

生成新的 session 和 draft，并保留 `retry_of_session_id`。

敏感字段不得写入日志：

- API Key；
- Authorization header；
- 本地隐私文件完整内容。

## 9.3 目标跳转

TaskCenterItem 增加：

```ts
route_name
route_params_json
```

示例：

```json
{
  "route": "content",
  "projectId": 1,
  "chapterId": 12,
  "inspectorTab": "review"
}
```

## 9.4 分页

将 `limit` 改为：

```text
cursor_created_at
cursor_id
page_size
```

排序条件：

```sql
ORDER BY created_at DESC, id DESC
```

避免新增任务后 offset 分页重复或漏项。

## 9.5 待审阅入口

任务中心将 draft 作为独立 item_type：

```text
generation
job
snapshot
draft
```

状态过滤增加：

```text
pending_review
conflicted
```

## 9.6 验收标准

- 重试不依赖前端硬编码命令参数；
- 重试不会泄露 API Key；
- 点击任务可以跳到正确项目、章节和检查器；
- 任务列表支持稳定游标分页；
- 待审阅和冲突草稿有明显入口；
- 快照可预览和恢复。

---

# 10. CORE-008：审核锚点与正文版本绑定

## 10.1 当前现状

审核问题主要依赖自由文本 quote 或前端在当前正文中搜索。审核记录没有明确绑定：

- 审核时正文 hash；
- 审核时 contents.updated_at；
- 审核时快照；
- 稳定 start/end/context anchor。

当前“正文是否已变化”的判断不可靠，可能长期提示或错误定位。

## 10.2 数据库调整

`chapter_reviews` 增加：

```text
content_hash TEXT DEFAULT ''
content_updated_at TEXT DEFAULT ''
content_snapshot_id INTEGER
model_name TEXT DEFAULT ''
input_manifest_json TEXT DEFAULT '{}'
```

ReviewIssue 统一为：

```json
{
  "id": "issue-uuid",
  "type": "continuity",
  "severity": "high",
  "description": "...",
  "suggestion": "...",
  "quote": "...",
  "start": 120,
  "end": 148,
  "prefix": "前文上下文",
  "suffix": "后文上下文"
}
```

## 10.3 锚点策略

1. 优先使用 start/end；
2. 校验当前切片是否等于 quote；
3. 不一致时使用 quote + prefix/suffix 重定位；
4. 多处匹配时提示歧义；
5. hash 不同则标记 review stale；
6. 旧审核没有 hash 时显示 legacy，不伪装为最新。

## 10.4 验收标准

- 审核记录准确知道对应正文版本；
- 未改正文时定位稳定；
- 改动正文时明确标记 stale；
- quote 多处重复时不会跳到随机位置；
- 修复草稿引用审核 issue ID；
- 重新审核后旧审核保留但不作为当前依据。

---

# 11. CORE-009：完整章节任务单注入 AI 上下文

## 11.1 当前现状

Chapter 模型已经拥有：

```text
viewpoint
scene
cast_character_ids_json
turning_point
outcome
status
```

但是 `ChapterTaskSheet` 目前只包含：

```text
goal
conflict_level
hook
payoff
must_avoid
target_word_count
```

因此正文生成、审核和修复无法使用完整的章节计划。

## 11.2 调整

扩展：

```rust
pub struct ChapterTaskSheet {
    pub goal: String,
    pub conflict_level: i64,
    pub hook: String,
    pub payoff: String,
    pub must_avoid: String,
    pub target_word_count: i64,
    pub viewpoint: String,
    pub scene: String,
    pub cast_character_ids: Vec<i64>,
    pub cast_summary: String,
    pub turning_point: String,
    pub outcome: String,
    pub status: String,
}
```

`chapter_to_task_sheet` 必须映射全部字段，并校验人物属于同一项目。

注入范围：

- generate_content；
- polish_content；
- review_chapter_content；
- repair_chapter_content；
- batch_generate_chapters。

## 11.3 验收标准

- Prompt manifest 明确列出完整任务单；
- cast 人物摘要来自真实人物表；
- 删除人物后不会注入悬空 ID；
- review 和 repair 与 generate 使用同一任务单版本；
- 任务单变化会使旧 draft/review stale。

---

# 12. CORE-010：项目定盘修改的 Stale 传播

## 12.1 当前现状

`preview_profile_change_impact` 只按是否存在大纲、章节和正文返回数量。

`save_project_profile` 只更新 profile 表，不执行：

- 字段差异计算；
- stale marker 写入；
- 快照；
- 用户确认后的事务传播。

## 12.2 目标流程

```text
load current profile
→ compute field-level diff
→ map changed fields to affected targets
→ preview impact
→ user confirm
→ transaction:
   create profile snapshot
   update profile
   insert deduplicated stale markers
   update project edited timestamp
```

## 12.3 字段影响建议

| 字段 | 大纲 | 人物 | 章节 | 正文 |
|---|---:|---:|---:|---:|
| premise | 是 | 是 | 是 | 是 |
| genre | 是 | 是 | 是 | 是 |
| target_audience | 可选 | 否 | 是 | 是 |
| selling_point | 是 | 是 | 是 | 是 |
| reader_promise | 是 | 否 | 是 | 是 |
| narrative_pov | 否 | 可选 | 是 | 是 |
| pace_preference | 否 | 否 | 是 | 是 |
| default_chapter_length | 否 | 否 | 是 | 是 |
| estimated_chapter_count | 是 | 否 | 是 | 否 |

## 12.4 验收标准

- 没有实际变化时不产生 stale；
- 用户可看到具体变化字段和影响对象；
- 保存与 stale 写入在同一事务；
- profile 修改前有快照；
- stale marker 去重；
- 下游页面显示可解释原因。

---

# 13. CORE-011：工作区恢复

## 13.1 需要恢复的状态

```text
last_project_id
route_name
route_params
selected_chapter_id
selected_character_id
navigation_collapsed
inspector_open
inspector_tab
task_drawer_open
focus_mode（建议不跨重启或显式配置）
window layout preference
```

## 13.2 数据表

```sql
CREATE TABLE IF NOT EXISTS project_workspace_state (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  route_name TEXT DEFAULT 'profile',
  route_params_json TEXT DEFAULT '{}',
  layout_json TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);
```

全局设置保存最后项目 ID。

## 13.3 命令

```text
get_workspace_bootstrap
save_workspace_state
clear_workspace_state
```

## 13.4 写入策略

- 路由切换：debounce 200ms；
- 面板拖拽：结束时保存；
- 章节选择：立即保存；
- 应用退出：best-effort flush；
- 读取失败：回退项目库，不阻断启动。

## 13.5 验收标准

- 重启后返回最后项目和页面；
- 删除项目后不会恢复到无效项目；
- 章节不存在时回退正文第一页；
- 布局字段向后兼容；
- 设置页和项目库不会错误写入项目 workspace。

---

# 14. CORE-012：拆分最后打开时间和最后编辑时间

## 14.1 当前问题

`touch_project_opened` 当前更新 `projects.updated_at`。因此只打开项目也会被项目库当成“最近编辑”，破坏真实排序和用户判断。

## 14.2 迁移

```sql
ALTER TABLE projects ADD COLUMN last_opened_at TEXT DEFAULT '';
```

语义：

- `updated_at`：项目业务数据发生持久化修改；
- `last_opened_at`：用户进入项目；
- `created_at`：创建时间。

项目库提供排序：

```text
最近打开
最近编辑
创建时间
名称
```

## 14.3 验收标准

- 打开项目只更新 `last_opened_at`；
- 修改正文、人物、章节、profile 才更新 `updated_at`；
- 迁移旧项目时 `last_opened_at` 可初始化为 `updated_at`；
- 项目摘要类型前后端同步。

---

# 15. CORE-013：项目摘要、任务健康和项目库响应式

## 15.1 项目摘要扩展

当前摘要只统计失败 job，不包含：

- generation_logs 的 started/failed/cancelled；
- pending review draft；
- conflicted draft；
- 最新章节和最新审核；
- last_opened_at；
- 最近错误摘要。

建议新增：

```text
running_task_count
failed_task_count
cancelled_task_count
pending_review_count
conflicted_draft_count
latest_chapter_id
latest_chapter_title
latest_review_score
last_opened_at
last_error_summary
```

## 15.2 响应式

项目库当前不应继续依赖固定宽度组合。建议：

```text
>= 1200：左列表 + 右详情
800~1199：可调左列表 + 自适应详情
< 800：单列，详情以路由/抽屉打开
```

所有背景必须使用主题 token，移除暗色硬编码。

## 15.3 验收标准

- 800px 窗口无水平溢出；
- 亮色模式无暗色硬编码区域；
- 用户能一眼看见运行、失败和待审阅数量；
- 最近打开和最近编辑语义分离；
- 聚合查询有索引和性能测试。

---

# 16. CORE-014：API Key 脱敏与凭据边界

## 16.1 当前风险

`ModelPreset` 包含完整 `api_key`，列表和读取命令可能把明文 Key 返回前端并长期保存在 React 状态。

## 16.2 目标

前端默认只获得：

```ts
{
  id,
  name,
  apiBase,
  modelName,
  hasApiKey,
  apiKeyMasked
}
```

完整 Key 只在后端 Runtime 使用。

## 16.3 更新接口

更新 preset 时：

- 未提交 `apiKey` 表示保留；
- 提交空字符串表示清空，必须二次确认；
- 新 Key 只单向写入；
- 日志、错误和 manifest 永不包含 Key。

进一步建议使用系统凭据存储；若暂时仍用 SQLite，应至少明确风险并限制返回。

## 16.4 验收标准

- `list_model_presets` 不返回明文 Key；
- React DevTools 无完整 Key；
- generation_logs/input_manifest 无 Key；
- 编辑 preset 可保留旧 Key；
- 清空 Key 需要明确操作。

---

# 17. CORE-015：知识库召回 Manifest

## 17.1 当前问题

生成过程无法回答：

- 检索了哪些 source；
- 哪些 chunk 被选中；
- 分数和排序；
- 哪些内容因 token 限制被排除；
- 最终 Prompt 使用了什么上下文。

## 17.2 Manifest

每次生成记录：

```json
{
  "query": "...",
  "sources": [
    {
      "source_id": 1,
      "chunk_id": "fts-rowid",
      "score": 0.82,
      "rank": 1,
      "included": true,
      "reason": "top-k"
    }
  ],
  "excluded": [],
  "token_budget": 4000,
  "used_tokens": 3170
}
```

保存到 draft/input manifest，不保存敏感 Key。

## 17.3 验收标准

- 任务详情可查看上下文来源；
- 相同输入可解释召回差异；
- source 删除后历史 manifest 仍保留名称快照；
- token 截断有记录；
- 未召回时明确显示空结果。

---

# 18. CORE-016：伏笔逾期规则

## 18.1 当前问题

仅因 `status=setup` 且没有 payoff chapter 就标记逾期，会把尚未计划回收的正常伏笔误判为逾期。

## 18.2 数据字段

建议增加：

```text
expected_payoff_chapter_id
expected_payoff_chapter_number
expected_payoff_before_chapter
priority
last_checked_chapter_id
```

## 18.3 判定

```text
当前进度章节 > 计划最迟回收章节
AND status = setup
AND payoff_chapter_id IS NULL
```

没有计划日期的伏笔显示“未排期”，不显示“逾期”。

## 18.4 验收标准

- 未排期与逾期区分；
- 当前写作进度改变时重新计算；
- 已回收伏笔不再提示；
- 删除目标章节时状态可解释；
- 提供筛选：未排期、临近、逾期、已回收。

---

# 19. CORE-017：删除、排序和移动的统一事务安全

## 19.1 删除影响预览

人物、章节、世界观条目删除前返回：

```text
直接引用数量
关系数量
章节 cast 引用
正文/审核/草稿引用
将产生的 stale 数量
可自动修复项
阻断项
```

## 19.2 章节排序/移动

必须在事务中：

- 校验所有章节属于同一项目；
- 校验输入 ID 唯一；
- 规范化 sort_order；
- 更新相邻章节依赖 stale；
- 失败 rollback。

## 19.3 验收标准

- 跨项目 ID 被拒绝；
- 中途失败不产生重复 sort_order；
- 删除前展示影响；
- 删除和 stale 写入同事务；
- 关联关系没有悬空引用。

---

# 20. CORE-018：命令面板、编辑器能力和视觉一致性

该项必须放在核心数据流稳定之后处理。

## 20.1 命令面板

实现：

```text
Ctrl/Cmd + K
页面跳转
保存
生成
审核
打开任务中心
切换主题
切换模型
```

命令必须根据当前路由和权限禁用，不得只是无事件按钮。

## 20.2 正文编辑器

长期建议从普通 Textarea 迁移到支持：

- 稳定文本位置；
- 审核 decoration；
- 大文档性能；
- 查找替换；
- 行号/段落定位；
- 可撤销的 draft apply。

在迁移前，至少封装 selection/scroll API，不再使用全局 `document.querySelector`。

## 20.3 视觉一致性

统一：

```text
radius token
shadow token
panel spacing
button height
scrollbar
focus ring
empty/loading/error states
```

增加亮/暗主题截图回归与 800/1024/1440 宽度回归。

---

# 21. 建议实施阶段

## Phase 0：验证与止血

目标：证明当前 master 可构建。

```text
CI required checks
Migration test harness
AIContext tests
Windows Tauri debug build
桌面冒烟
```

完成条件：全部绿色。

## Phase 1：GenerationDraft 基础设施

```text
migration
models
repository
commands
frontend context
task center draft item
```

完成条件：可以创建、列出、恢复、丢弃文本草稿。

## Phase 2：正文统一草稿

```text
generate_content
polish_content
repair_content
replace/append/polish apply
snapshot + conflict check
```

完成条件：正文 AI 输出不再直接修改数据库。

## Phase 3：结构化草稿与事务 Apply

```text
characters draft
chapters draft
逐项选择
ID mapping
transaction
idempotency
cancel before commit
```

完成条件：人物和章节没有半写入。

## Phase 4：快照与任务中心闭环

```text
snapshot preview
restore
retry payload
route jump
cursor pagination
pending review/conflict filters
```

完成条件：生成、审阅、恢复和重试可以从任务中心闭环。

## Phase 5：审核、任务单和 Stale

```text
review hash/version/anchors
complete chapter task sheet
profile diff + stale transaction
```

完成条件：审核定位和下游失效可解释。

## Phase 6：工作区和项目库

```text
workspace restore
last_opened_at
project health summary
responsive project library
```

## Phase 7：安全与体验收尾

```text
API Key masking
knowledge manifest
foreshadow schedule
safe delete/reorder
command palette
editor upgrade
visual regression
```

---

# 22. 建议提交拆分

禁止把全部改动放入一个超大提交。建议：

```text
1. test(ci): enforce frontend rust migration and windows build gates
2. feat(db): add generation drafts and version metadata
3. feat(drafts): add draft repository and tauri commands
4. feat(drafts): add frontend draft review context
5. refactor(content): route content generation through persistent drafts
6. feat(content): add transactional draft apply and snapshots
7. refactor(ai): route character generation through structured drafts
8. refactor(ai): route chapter generation through structured drafts
9. feat(ai): add provider-specific abort handles
10. feat(snapshots): add preview and safe restore
11. feat(tasks): add retries navigation and cursor pagination
12. feat(review): bind reviews to content versions and anchors
13. feat(context): inject complete chapter task sheet
14. feat(profile): add transactional stale propagation
15. feat(workspace): restore project route and layout state
16. feat(projects): split opened and edited timestamps
17. security(settings): stop exposing plaintext api keys
```

每个提交都应同时包含对应测试，不应先提交无测试的数据库契约，再在多个提交后补齐。

---

# 23. 总体验收矩阵

## AI 生命周期

- [ ] done/error/cancel 回调每个 session 最多一次；
- [ ] 首包前取消；
- [ ] 流中取消；
- [ ] Runtime 启动失败；
- [ ] apply 前取消；
- [ ] commit 阶段取消语义明确；
- [ ] provider abort 状态可观测。

## GenerationDraft

- [ ] 文本草稿；
- [ ] 结构化草稿；
- [ ] 跨页面恢复；
- [ ] 重启恢复；
- [ ] 逐项选择；
- [ ] 冲突检测；
- [ ] 幂等 Apply；
- [ ] Discard 终态；
- [ ] Apply 快照。

## 正文

- [ ] replace；
- [ ] append；
- [ ] polish；
- [ ] repair；
- [ ] 生成期间正文可继续查看；
- [ ] 手工修改导致冲突；
- [ ] 放弃不修改正文；
- [ ] 重启后继续审阅。

## 人物/章节

- [ ] JSON schema 校验；
- [ ] 逐项选择；
- [ ] 关系映射；
- [ ] 同项目验证；
- [ ] transaction rollback；
- [ ] 重复 Apply 不重复插入；
- [ ] 取消不产生半数据。

## 快照

- [ ] 预览；
- [ ] diff；
- [ ] 恢复前保护快照；
- [ ] 恢复版本校验；
- [ ] 恢复后 stale；
- [ ] 可撤销恢复。

## 任务中心

- [ ] 实时进度；
- [ ] 取消；
- [ ] 可靠重试；
- [ ] 跳转；
- [ ] 游标分页；
- [ ] 待审阅；
- [ ] 冲突；
- [ ] 快照恢复。

## 项目一致性

- [ ] profile 差异传播；
- [ ] 完整章节任务单；
- [ ] review 版本与锚点；
- [ ] workspace 恢复；
- [ ] opened/edited 时间拆分；
- [ ] 删除影响预览；
- [ ] 排序事务。

## 发布

- [ ] pnpm build；
- [ ] cargo fmt --check；
- [ ] cargo check；
- [ ] cargo test --lib；
- [ ] migration tests；
- [ ] Windows Tauri debug build；
- [ ] 亮暗主题截图回归；
- [ ] 800/1024/1440 宽度回归；
- [ ] Windows 桌面冒烟。

---

# 24. 风险与回滚策略

## 24.1 数据迁移风险

- 所有新增列必须有默认值；
- 新表优先旁路接入，避免立即删除旧流程；
- 先双写日志/草稿，确认稳定后关闭直接 Apply；
- migration 必须可重复；
- 发布前备份用户 SQLite。

## 24.2 草稿切换风险

建议 feature flag：

```text
use_generation_drafts
```

迁移阶段：

1. 后端生成 draft，同时保留旧 Apply 但默认关闭；
2. 内测开启草稿；
3. 完成正文后再迁移结构化数据；
4. 全部稳定后删除旧直接写入路径。

## 24.3 Provider Abort 风险

不能承诺所有 provider 都支持远端确认取消。UI 状态应区分：

```text
本地已停止
远端已确认取消
远端取消状态未知
```

## 24.4 结构化 Apply 风险

- schema 必须带版本；
- 未识别字段保留在 raw payload，不静默丢弃；
- 旧 draft 无法迁移时显示只读并允许导出；
- 大批量 Apply 要限制数量并显示事务进度。

---

# 25. 最终结论

当前项目已经解决了部分最危险的终态竞态和取消假象，但剩余问题的核心不再是单个页面的小修小补，而是缺少统一的 AI 结果应用边界。

下一阶段必须以以下四项为主线：

```text
1. GenerationDraft
2. Transactional Apply
3. Provider Abort
4. Snapshot Restore
```

其中 `GenerationDraft` 是其余多数能力的依赖基础。推荐严格按照：

```text
真实构建门禁
→ 草稿基础设施
→ 正文迁移
→ 人物/章节事务化
→ 快照与任务中心闭环
→ 审核版本与上下文一致性
→ 工作区、安全和体验收尾
```

推进。

在以下条件全部满足前，不建议宣布“第二轮审查问题全部修复”：

- AI 生成不再默认直接覆盖最终业务数据；
- 文本与结构化结果均经过持久化草稿和事务 Apply；
- Apply 有版本冲突、快照、幂等和回滚；
- 支持的 provider 有真实 abort；
- 快照可以安全恢复；
- CI 与 Windows Tauri 构建为绿色；
- 关键桌面冒烟场景有实际验证记录。
