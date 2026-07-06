# 2026-07-06 AI Runtime 抽象与 SDK-first 底层适配开发计划（修订版）

## 0. 用户最新修正

用户明确说明：

```text
我想要的不是接管小说业务主流程，
而是做一个最底层的适配，
让 SDK 来帮我将对 AI 的操作都完成，
我只需要在上面搭建业务逻辑，
以及在业务执行过程中调用 SDK 来实现各种功能，
例如加载 skills，mcp，思维链，工具调用等等。
```

因此，本文对今天的开发计划进行修订。

核心变化：

```text
不是：OpenCode SDK 只是未来实验能力
而是：OpenCodeWriter 应建立 SDK-first 的底层 AI 能力适配层
```

但同时保持一个边界：

```text
SDK 负责 AI 操作执行；
OpenCodeWriter 负责小说业务逻辑。
```

---

## 1. 当前实现状态核对

当前 master 已经实现了大量业务能力：

```text
P0 舒适性与便捷性：基本已实现
开书定盘 / 项目设定：已实现核心入口与类型
章节审核修复：已实现后端命令入口
世界与角色资产：已实现核心表、类型、入口
轻量知识库：已实现 SQLite FTS 基础表与命令入口
模型路由 / 任务表：已实现基础数据结构和命令入口
```

但当前 AI 调用仍然是：

```text
commands/ai.rs -> AiClient -> OpenAI-compatible /chat/completions
```

尚未实现：

```text
AiRuntime trait
SdkBackedRuntime
OpenCodeRuntime
ToolRuntime
McpRuntime
SkillsRuntime
BusinessToolRegistry
SkillRegistry
McpRegistry
```

因此，下一阶段重点应该从“继续堆业务功能”切换为：

```text
统一 AI 底层能力适配。
```

---

## 2. 修订后的目标架构

目标不是让 SDK 管小说，而是让 SDK 管 AI。

```text
OpenCodeWriter UI
  ↓
小说业务服务层 Novel Business Services
  ↓
AiTaskService
  ↓
AiRuntime 抽象
  ↓
SdkBackedRuntime / OpenCodeRuntime
  ↓
opencode-ai SDK / OpenCode Server / MCP / Skills / Tools
  ↓
LLM Providers
```

职责边界：

```text
小说业务层负责：业务流程、数据读取、上下文选择、结果保存、快照、状态回灌。
SDK Runtime 负责：模型调用、流式事件、思维链事件、工具调用、MCP、Skills、Agent session。
```

---

## 3. 新架构核心原则

### 3.1 所有 AI 操作都走 Runtime

后续业务代码不得直接调用：

```text
AiClient::stream_chat
reqwest /chat/completions
第三方模型 API
OpenCode Server HTTP API
@opencode-ai/sdk
```

统一只能调用：

```text
AiRuntime
```

### 3.2 Runtime 默认目标是 SDK-backed

`AiRuntime` 不是为了继续长期维护自研模型调用，而是为了把 SDK 放到底层。

目标默认实现：

```text
SdkBackedRuntime / OpenCodeRuntime
```

兼容实现：

```text
OpenAICompatibleRuntime
```

测试实现：

```text
MockRuntime
```

### 3.3 业务逻辑继续由 OpenCodeWriter 控制

SDK 不决定：

```text
是否覆盖正文
是否创建快照
是否保存数据库
是否更新人物状态
是否清空章节
是否进入下一阶段
是否批量执行
```

这些由 OpenCodeWriter 决定。

SDK 只执行：

```text
模型生成
工具调用
MCP 调用
Skills 调用
Agent 会话
思维链事件
流式输出
```

### 3.4 Skills / MCP / Tools 都是 Runtime 能力

业务执行过程中可以这样调用：

```text
生成正文任务
  -> 使用 novel_content_writer skill
  -> 调用 search_knowledge tool
  -> 调用 get_world_items tool
  -> 需要时调用 MCP 工具
  -> 返回 content / thinking / tool events
```

---

## 4. 推荐目录结构

新增：

```text
src-tauri/src/ai/runtime/
  mod.rs
  types.rs
  manager.rs
  sdk_backed.rs
  openai_compatible.rs
  mock.rs
  tools.rs
  skills.rs
  mcp.rs
  events.rs

src-tauri/src/ai/tasks/
  mod.rs
  service.rs
  task_type.rs
  request_builder.rs

src-tauri/src/ai/skills/
  mod.rs
  registry.rs
  chapter_review.rs
  chapter_repair.rs
  content_writer.rs
  aftercare.rs
  style_extract.rs

src-tauri/src/ai/tools/
  mod.rs
  registry.rs
  project_tools.rs
  knowledge_tools.rs
  world_tools.rs
  story_tools.rs
```

保留：

```text
src-tauri/src/ai/context.rs
src-tauri/src/ai/events.rs
```

后续可逐步弱化：

```text
src-tauri/src/ai/client.rs
```

---

## 5. Runtime 类型设计

### 5.1 AiRequest

```rust
pub struct AiRequest {
    pub task_type: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    pub output_schema: Option<serde_json::Value>,
    pub tools: Vec<String>,
    pub skills: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub thinking: ThinkingPolicy,
    pub permission_policy: PermissionPolicy,
    pub metadata: serde_json::Value,
}
```

### 5.2 ThinkingPolicy

```rust
pub enum ThinkingPolicy {
    Disabled,
    SummaryOnly,
    FullInternal,
}
```

说明：

- `Disabled`：不请求 thinking。
- `SummaryOnly`：只输出思考摘要或状态。
- `FullInternal`：内部保留完整 thinking，但前端是否展示由 UI 决定。

### 5.3 PermissionPolicy

```rust
pub struct PermissionPolicy {
    pub allow_business_tools: bool,
    pub allow_mcp: bool,
    pub allow_file_read: bool,
    pub allow_file_write: bool,
    pub allow_shell: bool,
    pub require_user_approval: bool,
}
```

默认值必须安全：

```text
allow_business_tools = true
allow_mcp = false
allow_file_read = false
allow_file_write = false
allow_shell = false
require_user_approval = true
```

### 5.4 AiDelta

```rust
pub enum AiDeltaType {
    Thinking,
    ThinkingSummary,
    Content,
    ToolCall,
    ToolResult,
    SkillStart,
    SkillResult,
    McpCall,
    McpResult,
    Error,
    Done,
}

pub struct AiDelta {
    pub delta_type: AiDeltaType,
    pub text: String,
    pub payload: serde_json::Value,
}
```

### 5.5 AiRuntime trait

不强制马上加 `async_trait`，可以先用 boxed future：

```rust
pub trait AiRuntime: Send + Sync {
    fn run(&self, request: AiRequest) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>>;
    fn abort(&self, task_id: &str) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>>;
    fn list_tools(&self) -> Pin<Box<dyn Future<Output = Result<Vec<AiToolInfo>, String>> + Send + '_>>;
    fn list_skills(&self) -> Pin<Box<dyn Future<Output = Result<Vec<AiSkillInfo>, String>> + Send + '_>>;
}
```

---

## 6. SdkBackedRuntime 设计

### 6.1 定位

`SdkBackedRuntime` 是未来默认 runtime。

职责：

```text
1. 接收 AiRequest
2. 调用 opencode-ai SDK / OpenCode Server
3. 注册 tools / skills / MCP
4. 转换 SDK event 为 AiDelta
5. 把结果返回业务层
```

### 6.2 实现路线

因为项目后端是 Rust，而 `@opencode-ai/sdk` 是 TypeScript/Node 生态，推荐两阶段实现。

#### 阶段 A：Rust -> OpenCode Server HTTP

```text
Rust SdkBackedRuntime
  -> HTTP/SSE
  -> OpenCode Server
  -> SDK / Tools / MCP / Skills
```

优点：

```text
Rust 后端仍是主控
Tauri 打包复杂度相对低
安全权限集中在 Rust 后端
前端不接触 SDK
```

#### 阶段 B：Rust -> Node SDK Adapter Sidecar

```text
Rust SdkBackedRuntime
  -> JSON-RPC / HTTP
  -> Node SDK Adapter
  -> @opencode-ai/sdk
```

当需要深度复用 SDK 能力时再做。

### 6.3 默认策略

第一版：

```text
OpenAICompatibleRuntime 仍作为默认 fallback
SdkBackedRuntime 做实验开关
```

验证稳定后：

```text
SdkBackedRuntime 变为默认
OpenAICompatibleRuntime 变为 fallback
```

---

## 7. OpenAICompatibleRuntime 的定位

当前 `AiClient` 不再作为业务层直接依赖，而是封装为：

```text
OpenAICompatibleRuntime
```

作用：

```text
1. 保证现有功能不退化
2. SDK 不可用时 fallback
3. 离线或轻量模式下继续可用
4. 方便测试 Runtime 抽象是否正确
```

迁移前：

```text
commands/ai.rs -> AiClient
```

迁移后：

```text
commands/ai.rs -> AiTaskService -> AiRuntimeManager -> OpenAICompatibleRuntime -> AiClient
```

---

## 8. Tools 设计

### 8.1 BusinessToolRegistry

所有业务工具由 OpenCodeWriter 注册，SDK/Runtime 负责调用。

第一批工具：

```text
get_project_profile
get_outline
get_characters
get_chapters
get_world_items
get_story_facts
get_foreshadows
search_knowledge
create_snapshot
save_chapter_review
save_story_fact
save_foreshadow
```

### 8.2 工具权限

默认只开放业务工具。

禁止默认开放：

```text
shell
任意文件读取
任意文件写入
外部命令执行
任意网络请求
```

### 8.3 工具调用流

```text
SDK 触发 tool_call
  -> Runtime 校验权限
  -> BusinessToolRegistry 执行工具
  -> 返回 tool_result
  -> SDK 继续生成
  -> OpenCodeWriter 接收最终结果
```

---

## 9. Skills 设计

### 9.1 SkillRegistry

Skills 是可复用 AI 能力单元，不等于业务主流程。

第一批 Skills：

```text
novel_outline_planner       大纲规划
novel_character_builder     人物生成
novel_content_writer        正文生成
chapter_review              章节审核
chapter_repair              章节修复
aftercare_extractor         状态回灌提取
style_rule_extractor        写法规则提取
knowledge_retriever         知识库召回
```

### 9.2 Skill 输入输出

```rust
pub struct SkillInput {
    pub project_id: i64,
    pub chapter_id: Option<i64>,
    pub payload: serde_json::Value,
}

pub struct SkillOutput {
    pub content: serde_json::Value,
    pub summary: String,
    pub artifacts: Vec<SkillArtifact>,
}
```

### 9.3 Skill 使用方式

业务层示例：

```text
review_chapter_content
  -> 调用 chapter_review skill
  -> skill 可调用 get_characters / get_world_items / search_knowledge 工具
  -> 返回结构化 review JSON
  -> 业务层保存 chapter_reviews
```

---

## 10. MCP 设计

### 10.1 McpRegistry

MCP 不直接暴露给业务页面，而通过 Runtime 统一管理。

配置项：

```text
mcp_servers
mcp_enabled
mcp_allowed_tools
mcp_require_approval
```

### 10.2 第一阶段 MCP 策略

第一阶段只允许：

```text
只读 MCP 工具
需要用户确认的 MCP 工具
明确列入白名单的 MCP 工具
```

不允许：

```text
自动执行 shell
自动写文件
自动删除数据
自动调用不明外部服务
```

### 10.3 MCP 与业务工具关系

```text
业务工具：OpenCodeWriter 内置，优先使用
MCP 工具：外部扩展，必须授权
```

---

## 11. 思维链 / Thinking 设计

SDK 可以负责 thinking/reasoning 事件接收与转发，但 OpenCodeWriter 需要统一策略。

前端展示建议：

```text
默认显示：AI 正在思考 / 思考摘要
高级模式：显示完整 thinking 内容
导出内容：不包含 thinking
保存正文：不保存 thinking
生成日志：可保存 thinking summary
```

数据策略：

```text
content 进入正文/大纲/人物/章节
thinking 进入生成日志或临时 UI，不进入正式作品内容
```

---

## 12. AiTaskService 设计

为了避免 `commands/ai.rs` 无限膨胀，新增：

```text
src-tauri/src/ai/tasks/service.rs
```

职责：

```text
1. 接收业务任务参数
2. 读取项目上下文
3. 调用 ContextBuilder / request_builder
4. 组装 AiRequest
5. 调用 AiRuntime
6. 处理结果
7. 保存数据库
8. 发送 Tauri events
```

`commands/ai.rs` 只保留 Tauri command 薄封装。

---

## 13. 开发步骤

### Sprint 1：Runtime 类型与旧实现包装

1. 新增 `runtime/types.rs`。
2. 新增 `AiRuntime` trait。
3. 新增 `OpenAICompatibleRuntime`。
4. 把当前 `AiClient` 包进去。
5. 新增 `AiRuntimeManager`。
6. 只迁移 `generate_outline`。
7. 验证前端流式输出不变。

### Sprint 2：迁移所有现有 AI 命令

迁移：

```text
generate_outline
generate_characters
generate_chapters
generate_content
generate_character_from_description
polish_content
polish_chapter
generate_idea_directions
generate_outline_from_direction
review_chapter_content
repair_chapter_content
chapter_aftercare
extract_style_rules
analyze_text
batch_generate_chapters
```

完成标准：

```text
commands/ai.rs 不再直接 new AiClient
所有 AI 调用统一走 AiRuntimeManager
```

### Sprint 3：BusinessToolRegistry

1. 新增工具定义类型。
2. 新增业务工具注册表。
3. 实现项目/大纲/人物/章节/知识库/世界观读取工具。
4. 实现保存审核结果、事实、伏笔的受控写入工具。
5. 在生成日志中记录 tool_call / tool_result。

### Sprint 4：SkillRegistry

1. 定义 SkillInput / SkillOutput。
2. 实现第一批小说 Skills。
3. 将章节审核、章节修复、aftercare 改造成 Skill。
4. Runtime 能够根据 AiRequest.skills 调用 Skills。

### Sprint 5：SdkBackedRuntime / OpenCodeRuntime

1. 新增 OpenCode Server 设置。
2. 新增 OpenCode 事件适配器。
3. 将 SDK/OpenCode 事件转换为 AiDelta。
4. 首先接入低风险任务：`analyze_text`、`review_chapter_content`。
5. 稳定后接入正文生成。

### Sprint 6：MCP 接入

1. 新增 MCP 配置表或 settings。
2. MCP 工具列表读取。
3. MCP 工具白名单。
4. MCP 调用审批。
5. MCP 调用日志。

### Sprint 7：默认 Runtime 切换

1. SdkBackedRuntime 稳定后设为默认。
2. OpenAICompatibleRuntime 作为 fallback。
3. 设置页提供 Runtime 状态和测试按钮。
4. 出错时可一键切回 fallback。

---

## 14. 配置设计

新增 settings：

```text
ai_runtime_default = sdk-backed | openai-compatible
ai_runtime_fallback = openai-compatible
opencode_server_url = http://127.0.0.1:4096
sdk_tools_enabled = true
sdk_skills_enabled = true
sdk_mcp_enabled = false
sdk_thinking_policy = summary-only
sdk_require_tool_approval = true
```

设置页新增：

```text
AI 底层适配
- 默认 Runtime
- Fallback Runtime
- OpenCode Server 地址
- 测试连接
- 工具调用开关
- Skills 开关
- MCP 开关
- Thinking 策略
- 权限审批模式
```

---

## 15. 验收标准

### 15.1 基础兼容验收

- [ ] 所有现有 AI 功能正常。
- [ ] 流式输出正常。
- [ ] thinking/content 仍能区分。
- [ ] JSON 解析不受影响。
- [ ] ai-chunk / ai-done / ai-error 事件兼容。
- [ ] 自动保存和快照不受影响。

### 15.2 Runtime 架构验收

- [ ] 所有 AI 命令统一走 AiRuntime。
- [ ] commands/ai.rs 不再直接 new AiClient。
- [ ] OpenAICompatibleRuntime 可作为 fallback。
- [ ] SdkBackedRuntime 可作为默认候选。
- [ ] RuntimeManager 统一处理 runtime 选择和模型路由。

### 15.3 SDK 能力验收

- [ ] SDK-backed runtime 能处理普通生成。
- [ ] SDK-backed runtime 能处理 thinking 事件。
- [ ] SDK-backed runtime 能处理 tool_call / tool_result。
- [ ] SDK-backed runtime 能加载并执行 Skills。
- [ ] SDK-backed runtime 能接入 MCP 工具。
- [ ] SDK 错误能映射为统一 AiDelta::Error。

### 15.4 安全验收

- [ ] 默认禁用 shell。
- [ ] 默认禁用任意文件写入。
- [ ] 默认禁用任意文件读取。
- [ ] 外部 MCP 工具默认需要审批。
- [ ] 业务写入工具只允许写入受控表。
- [ ] 所有工具调用有日志。

---

## 16. 不再使用的旧表述

旧表述：

```text
OpenCode SDK 只作为未来实验性 Agent / Tool / MCP Runtime。
```

修订为：

```text
OpenCodeWriter 应以 AiRuntime 为内部接口，
以 opencode-ai SDK / OpenCode Server 作为底层 AI 能力适配方向，
让 SDK 承担所有 AI 操作，
业务层只调用 Runtime 能力完成小说业务。
```

旧表述：

```text
纯大纲生成、人物生成、正文生成不适合直接替代。
```

修订为：

```text
这些任务不适合交给 Agent 自主决定流程，
但适合通过 SDK-backed runtime 执行底层模型调用、thinking、tools、skills。
```

---

## 17. 最终建议

下一阶段应该按这个方向推进：

```text
先统一 AiRuntime
再把现有 AiClient 包装成 fallback
再建设 SDK-backed runtime
再接入 tools / skills / MCP
最后把默认 AI 执行切到 SDK-backed runtime
```

这能实现用户目标：

```text
底层 AI 操作由 SDK 完成；
OpenCodeWriter 上层专注小说业务；
业务执行过程中可随时调用 Skills、MCP、Thinking、工具调用等 SDK 能力。
```
