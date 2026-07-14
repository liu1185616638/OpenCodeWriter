# 2026-07-14 第二轮审查问题修正实施记录

## 0. 任务信息

- **用户问题**：`@GitHub 继续修正`
- **仓库**：`liu1185616638/OpenCodeWriter`
- **分支**：`master`
- **实施依据**：`docs/ArchitectsReply/2026-07-14-second-redesign-fix-review.md`
- **本轮起始提交**：`02fed445db3d3720273a486fd4537d5e05214c67`
- **本轮业务代码结束提交**：`bceb9194e57a72341850d92b4d466fea07a95cd9`
- **提交数量**：17 个
- **修改文件**：11 个

## 1. 本轮总体结果

本轮集中修正了第二轮审查中的以下高优先级问题：

1. AIContext 重复完成、重复失败和取消状态竞争；
2. 取消事件被错误当成普通失败事件；
3. Runtime 启动和等待下一段输出时不能被取消唤醒；
4. Runtime 启动失败会遗留 `started` 日志与 session；
5. 正文修复流污染中央编辑器；
6. 修复草稿在正文已变化时仍可能覆盖新编辑；
7. 外观设置 TypeScript 类型问题；
8. 任务中心不包含快照；
9. 批量任务进度字段没有真实更新；
10. 批量任务没有可用的取消入口与终态保护；
11. 任务中心不会自动刷新运行中任务。

当前状态从“存在明确 P0 状态竞争和取消假象”推进到：

```text
AI 前端终态：单次结算
取消事件：与失败事件分离
Runtime 等待：可被取消信号唤醒
修复结果：独立草稿和差异预览
批量任务：有真实进度、有取消命令、有 UI 入口
快照：已进入统一任务时间线
```

但本轮还没有完成统一 `GenerationDraft` 架构，也没有完成 provider 专用 abort、结构化 apply 事务和快照恢复 UI，因此仍不能视为全部审查问题关闭。

---

# 2. 已完成修改

## 2.1 AIContext 使用统一终态结算

文件：

```text
src/contexts/AIContext.tsx
```

新增统一：

```ts
finalizeSession(sessionId, status, detail)
```

并维护：

```ts
terminalSessionIdsRef: Set<string>
```

所有完成、失败、取消和 `invoke` 返回都必须通过同一终态 guard。

已解决：

- `ai-done` 与 `invoke` fallback 重复执行 `onComplete`；
- `ai-error` 与 `invoke catch` 重复执行 `onError`；
- 取消先显示失败、再改为取消；
- 多个终态来源竞争修改页面状态；
- 审核尚未保存入库，前端就提前执行完成回调。

新的成功边界为：

```text
模型输出结束
→ 后端解析与数据库应用完成
→ Tauri command 返回
→ finalizeSession(completed)
→ onComplete
```

相关提交：

```text
3392c93965df0a75458dd2cea1e5c5b4eb988123
27a614f1951371df0cdd0abbd4157f0d3515740f
```

## 2.2 取消使用独立终态事件

文件：

```text
src-tauri/src/ai/events.rs
src-tauri/src/commands/task_center.rs
src/contexts/AIContext.tsx
```

新增：

```text
ai-cancelled
```

取消不再通过：

```text
ai-error("用户取消")
```

传递，从而避免业务页面弹出“生成失败”。

相关提交：

```text
8e2a27bf7e5b9804c2bb7efce0d54600513045dd
49da09ecdc5e50c11eec20ede1cedf066216e6f7
```

## 2.3 Runtime 等待支持可唤醒取消

文件：

```text
src-tauri/src/ai/session_registry.rs
src-tauri/src/ai/tasks/service.rs
```

取消句柄由单纯：

```text
Arc<AtomicBool>
```

升级为：

```text
SessionCancellation
├── AtomicBool
└── tokio::sync::Notify
```

Runtime 启动和下一段流等待均使用：

```rust
tokio::select! {
    _ = cancellation.cancelled() => ...,
    result = timeout(..., runtime.run(...)) => ...,
}
```

以及：

```rust
tokio::select! {
    _ = cancellation.cancelled() => ...,
    result = timeout(..., stream.next()) => ...,
}
```

同时补充：

- Runtime 启动失败写入 `failed` 日志；
- Runtime 启动失败清理 Registry；
- Runtime 启动超时独立记录；
- stream 终止与取消竞态的最终检查；
- `notify_one()` 缓存许可，防止丢失取消唤醒；
- 取消等待相关 Rust 测试。

相关提交：

```text
c5442a0c5eb38bba4f153d22bf293f383dc39a7e
e766b7ccb0e6900269cd914b2cb79ff51284669c
700e4bf8280f878a74ac149de4f52e1039d5b832
```

## 2.4 修复草稿与正文状态隔离

文件：

```text
src/components/ai/ChapterQualityPanel.tsx
```

修复任务不再使用会被正文编辑器识别的：

```text
stage = repair
```

而是独立：

```text
stage = repair-draft
```

新的数据流：

```text
正文 currentContent 保持不变
→ repair-draft 独立接收输出
→ 完成后生成 diff
→ 用户选择应用或放弃
```

应用修复前增加基础版本保护：

```ts
if (contentRef.current !== repairOriginal) {
  rejectApply()
}
```

已解决：

- 修复流式输出覆盖中央正文；
- 放弃修复后中央正文仍保留修复文本；
- 取消修复恢复到上一次生成的旧文本；
- 修复期间用户编辑正文后仍被旧草稿覆盖。

相关提交：

```text
921bb37e893d04dd052ff7ea1b9a803b1092bc19
```

## 2.5 外观设置类型修正

文件：

```text
src/contexts/AppearanceContext.tsx
src/views/settings/AppearancePage.tsx
```

调整内容：

- 导出 `Density` 类型；
- Select 的字符串回调显式转换为 `Density`；
- Promise setter 使用 `void` 调用；
- 删除不存在的 handler 和无用 import。

相关提交：

```text
3495af2c99644ff0127042ac533bdccb33eb6161
21ac71b81f7be743e7bb46f148e27ea6731bf917
```

## 2.6 快照进入统一任务时间线

文件：

```text
src-tauri/src/commands/task_center.rs
```

`list_task_center_items` 现在聚合：

```text
generation_logs
jobs
content_snapshots
```

快照会出现在：

```text
全部
完成
```

筛选中。

同时修正：

- 查询 limit 限制在 1 到 200；
- cancelled job 纳入失败/取消筛选；
- 只有终态 job 才返回 `ended_at`；
- 快照记录携带原因、目标和内容长度。

相关提交：

```text
76b8aedd20985dcfff2c2e57d0dea58bbaf6e4e8
bceb9194e57a72341850d92b4d466fea07a95cd9
```

## 2.7 批量任务真实进度

文件：

```text
src-tauri/src/commands/jobs.rs
```

创建批量任务时从 payload 的 `chapter_ids` 初始化：

```text
progress_current = 0
progress_total = chapter_ids.length
```

现有批量循环每完成一章会把 `completed_chapters` 写入 `result_json`。`update_job_status` 现在从该数据自动同步：

```text
progress_current = completed_chapters.length
progress_total = chapter_ids.length
```

任务完成时：

```text
progress_current = progress_total
```

已取消的任务使用条件更新保护，后台迟到的 running/failed/completed 更新不能覆盖 `cancelled`。

相关提交：

```text
4b3f03ec66a420406a083565fe6402b48cfb411f
```

## 2.8 批量任务取消

新增后端命令：

```text
cancel_job(id)
```

处理流程：

```text
jobs.cancel_requested = 1
→ jobs.status = cancelled
→ Registry 取消当前 batch_<jobId>_* 子 session
→ 记录 jobId 为已取消批次
→ 后续子 session 注册时直接进入 cancelled
```

这样无需依赖旧循环在每一章之间主动读取数据库，也可以阻止后续章节继续生成。

新增测试：

- 只取消指定 job 的活跃子 session；
- 取消后新创建的同 job 子 session 自动取消；
- batch session ID 解析。

相关提交：

```text
9664356b16bf1de262e1326834295b91bb5969c4
e18306fe38131dbeba9c85e6a43a94ef70d25c3f
5ca823494e5f9a1f81f86c3c4f2d6e4aefbe3410
```

## 2.9 任务中心增加实时刷新和取消操作

文件：

```text
src/views/TaskCenter.tsx
```

新增：

- 存在运行中任务时每 2 秒刷新；
- 批量任务真实进度条；
- running/pending job 的取消按钮；
- started generation 的取消按钮；
- 取消中的禁用和加载状态；
- 失败/取消合并筛选；
- 快照记录展示。

相关提交：

```text
1333562dafe5c26a67c085423513163cfdca0be4
```

---

# 3. 本轮没有完全关闭的问题

## 3.1 Provider 专用 abort 仍未实现

Rust 的等待 future 现在可以立即被取消并 drop，但不同 provider 是否会立即终止远端推理，取决于 Runtime/SDK 的实现。

仍需补充：

```text
SDK Adapter request abort / child request cancellation
OpenAI HTTP request AbortHandle
provider session cancel API
```

因此当前可以确认：

- Rust 任务不再必须等下一 chunk 或五分钟 timeout；
- 不能在未运行真实 provider 的情况下保证所有远端服务都停止计费。

## 3.2 结构化数据 apply 阶段仍缺事务与取消保护

人物和章节仍采用：

```text
AI output
→ parse JSON
→ multiple INSERT
```

`AiTaskService` 在流完成后会注销 runtime session，后续人物/章节数据库 apply 尚未纳入统一 cancellation handle。

仍需：

```text
Applying phase
transaction
base version check
cancel check before commit
rollback on any error
```

## 3.3 统一 GenerationDraft 尚未实现

仍然缺少：

```text
generation_drafts migration
create/list/get/apply/discard commands
pending review task status
跨页面恢复
结构化逐项选择
```

当前仅修复流程拥有安全的本地 diff 草稿；大纲、正文生成、人物和章节尚未迁移到统一持久化草稿层。

## 3.4 正文普通生成仍直接自动保存

正文普通生成和润色成功后仍会直接保存，而不是进入待审阅。

另外 `ContentEditor` 仍需继续修正：

- `startGenerate` 回调依赖缺少 `text`；
- `handlePolish` 回调依赖缺少 `text`；
- 旧的 `repair` 分支残留应删除；
- 生成前清空 replace 文本的交互仍应改为独立草稿。

## 3.5 任务中心仍缺少完整动作

本轮已完成：

```text
查看
筛选
自动刷新
取消
进度
快照时间线
```

仍缺：

```text
可靠重试 payload
跳转目标
快照内容预览
快照恢复
分页/游标
待审阅草稿入口
```

## 3.6 其他尚未处理项

以下第二轮审查问题本轮未处理：

- 章节完整任务单字段注入 AI 上下文；
- 审核 quote/start/end 由后端生成；
- 审核正文 hash/version；
- 项目定盘 stale 传播；
- 工作区项目、路由和布局恢复；
- `last_opened_at` 与 `updated_at` 拆分；
- 项目摘要完整任务健康聚合；
- 项目库亮色主题与小窗口响应式；
- 命令面板；
- 快照恢复 UI；
- 知识库真实召回 manifest；
- 伏笔真实逾期规则；
- API Key 脱敏；
- 章节排序 transaction；
- 统一删除影响预览。

---

# 4. 验证情况

## 已做静态检查

- 检查最新 master 文件内容；
- 对照前后端事件名和 Tauri command 注册；
- 对照 jobs migration 已存在的 progress/cancel 字段；
- 检查任务中心 DTO 与前端类型；
- 检查取消句柄锁顺序；
- 增加取消等待和批量 session 测试代码。

## 尚未完成的运行验证

当前执行环境没有可用的 Rust toolchain，且无法通过网络拉取完整仓库，因此没有实际执行：

```bash
pnpm build
cargo check
cargo test --lib
pnpm tauri build --debug
```

GitHub 最新提交也暂时没有可确认的 combined status 或 workflow run 返回，因此不能宣称 CI 已通过。

本机必须执行：

```bash
pnpm install --frozen-lockfile
pnpm build
cd src-tauri
cargo fmt --check
cargo check
cargo test --lib
cd ..
pnpm tauri build --debug
```

重点冒烟测试：

1. 首包到达前取消普通生成；
2. 输出中途取消普通生成；
3. 修复中取消，正文不变化；
4. 修复完成后放弃，正文不变化；
5. 修复期间手工编辑，应用被拒绝；
6. 批量任务生成一章后取消；
7. 取消后不再开始下一章；
8. cancelled job 不会被改回 failed/completed；
9. 任务中心进度实时增长；
10. 快照记录可见且筛选正确。

---

# 5. 后续建议顺序

```text
1. 本机运行 build/check/test 并修复编译问题
2. 修正 ContentEditor 普通生成与润色的旧闭包和直接保存
3. 建立 generation_drafts 表和命令
4. 人物/章节 apply 迁移为 transaction
5. provider-specific abort
6. 快照预览与恢复
7. retry payload、跳转和分页
8. 审核锚点与内容版本
```

# 6. 本轮结论

本轮已经把审查文档中最危险的“终态重复、取消假象、修复污染正文、批量任务不可取消”推进到可实现闭环的代码状态。

目前仍不能宣布全部审查问题修复完毕，最大剩余架构项仍是：

```text
GenerationDraft
事务化 Apply
Provider Abort
快照恢复
```

下一轮应先通过真实构建和桌面冒烟测试确认本轮代码，再继续迁移正文、人物和章节到统一草稿应用层。
