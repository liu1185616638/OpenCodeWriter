# 2026-07-06 当前开发计划实现核对与 AI Runtime 抽象新增开发计划

## 0. 用户问题

查看当前开发计划是否都已经实现，然后新增开发计划：

```text
为所有 AI 调用统一走 OpenCodeWriter 自己定义的 AiRuntime 抽象；
业务逻辑继续由 OpenCodeWriter 控制；
opencode-ai SDK 作为 Agent / Tool / MCP Runtime / Skills 等可以复用组件的地方。
```

## 1. 核对结论

根据 master 分支最新代码，当前此前规划的大部分功能已经落地，尤其是 P0 与后续 V0.3/V0.4/V0.5/V0.6 的很多基础能力都已经进入代码。

但新的 AI Runtime 抽象还没有实现，当前 AI 调用仍然是：

```text
commands/ai.rs -> AiClient -> OpenAI-compatible /chat/completions
```

也就是说：

```text
P0 舒适性与便捷性：基本已实现
开书定盘 / 项目设定：已实现核心入口与类型
章节审核修复：已实现后端命令入口
世界与角色资产：已实现核心表、类型、入口
轻量知识库：已实现 SQLite FTS 基础表与命令入口
模型路由 / 任务表：已实现基础数据结构和命令入口
AiRuntime 抽象：未实现，是下一阶段重点
OpenCode SDK 接入：未实现，只停留在架构分析文档
```

注意：本核对基于 GitHub master 代码读取，不等同于本地执行 `npm run build` 或 `npm run tauri dev` 的运行验收。

---

## 2. 当前计划实现状态核对

### 2.1 P0：统一布局、滚动、自适应、底部操作栏

状态：**已实现基础组件。**

已存在组件：

```text
src/components/editor/WorkspacePageLayout.tsx
src/components/editor/EditorActionBar.tsx
src/components/editor/ModelPresetSelect.tsx
src/components/editor/ResponsiveSplitPane.tsx
src/components/shared/AppScrollArea.tsx
```

判断：P0 的 UI 基础骨架已经落地。

后续仍需人工检查：

- 四个主要编辑页面是否全部完全迁移到统一布局。
- 小窗口、暗色模式、长内容滚动是否实际体验稳定。
- 侧栏折叠和页面滚动是否存在边界 bug。

### 2.2 P0：AI 生成过程可控化

状态：**已实现核心状态与组件。**

已存在：

```text
src/types/ai.ts
src/components/ai/GenerateConfirmDialog.tsx
src/components/ai/GenerationStatusBar.tsx
src/components/ai/GenerationRecoveryPanel.tsx
```

`AIContext` 已包含：

```text
generationStatus
generationMeta
generatedCharCount
elapsedMs
resetGeneration
```

判断：生成状态、耗时、字数、取消、失败恢复的基础能力已经落地。

后续仍需检查：

- 大纲、正文、人物、章节是否都接入了确认弹窗。
- 追加 / 替换 / 草稿模式是否全部可用。
- 停止生成后是否真的不会被后续流覆盖。
- 后端是否支持真正 abort；当前更多是前端停止监听层面的体验。

### 2.3 P0：自动保存与版本快照

状态：**基础已实现。**

已存在：

```text
src/hooks/useAutosave.ts
src/components/editor/SnapshotPanel.tsx
```

数据库已存在：

```text
content_snapshots
generation_logs
```

后端已注册：

```text
create_snapshot
list_snapshots
delete_old_snapshots
list_generation_logs
```

判断：自动保存与快照基础完成。

后续仍需检查：

- 是否所有编辑器都启用了 autosave。
- AI 生成前、润色前是否稳定创建快照。
- 恢复快照后是否自动保存。
- 快照清理是否有调用，避免数据无限增长。

### 2.4 P0：下一步引导与过时原因

状态：**已实现基础组件与状态类型。**

已存在：

```text
src/components/flow/FlowGuide.tsx
src/lib/stageProgress.ts
StaleReason 类型
list_stale_reasons 命令注册
```

判断：流程引导与过时原因基础完成。

后续仍需检查：

- 每个页面是否都显示 FlowGuide。
- 过时原因是否映射成用户能理解的中文文案。
- 过时状态是否有“清除/重新生成/忽略”操作闭环。

---

## 3. 后续规划实现状态核对

### 3.1 开书定盘 / 自动导演轻量版

状态：**已实现核心入口。**

`App.tsx` 已加入：

```text
IdeaToProjectWizard
ProjectProfileView
```

并扩展了 `AppView`：

```text
setup | project-list | workspace | settings | idea-wizard | project-profile
```

后端已注册：

```text
generate_idea_directions
generate_outline_from_direction
get_project_profile
save_project_profile
```

类型已加入：

```text
ProjectProfile
IdeaDirection
```

判断：V0.3 开书定盘主能力已进入实现。

后续仍需检查：

- 方向候选是否能创建项目并写入 profile。
- profile 是否真正注入大纲、人物、章节、正文 prompt。
- 项目设定页是否能从侧栏稳定进入。

### 3.2 章节执行闭环

状态：**已实现后端与类型基础。**

章节类型已增强：

```text
goal
conflict_level
hook
payoff
must_avoid
target_word_count
```

后端已注册：

```text
review_chapter_content
repair_chapter_content
batch_generate_chapters
list_chapter_reviews
```

数据库已加入：

```text
chapter_reviews
```

判断：V0.4 的章节任务单、审核、修复、批量生成基础已具备。

后续仍需检查：

- 前端是否有完整 ChapterQualityPanel 或等效面板。
- 审核输出是否结构化保存。
- 修复前后是否有 diff 或快照保护。
- 批量生成是否具备失败中断恢复。

### 3.3 世界与角色资产

状态：**已实现核心数据结构、命令与页面入口。**

`CreationStage` 已扩展：

```text
outline | characters | chapters | content | world | knowledge
```

`App.tsx` 已加入：

```text
WorldEditor
KnowledgeEditor
```

数据库已加入：

```text
world_items
character_relations
character_states
story_facts
foreshadows
```

类型已加入：

```text
WorldItem
CharacterRelation
CharacterState
StoryFact
Foreshadow
```

后端已注册：

```text
list_world_items
create_world_item
update_world_item
delete_world_item
list_character_relations
create_character_relation
update_character_relation
delete_character_relation
list_character_states
create_character_state
delete_character_state
list_story_facts
create_story_fact
update_story_fact
delete_story_fact
list_foreshadows
create_foreshadow
update_foreshadow
delete_foreshadow
chapter_aftercare
```

判断：V0.5 世界观、角色关系、状态回灌、事实、伏笔账本基础已落地。

后续仍需检查：

- 正文生成是否使用 world_items / story_facts / foreshadows。
- aftercare 是否自动或半自动触发。
- 新人物候选是否有待确认流程。
- 世界观页面是否和正文生成有明确联动。

### 3.4 轻量知识库

状态：**已实现 SQLite FTS 基础。**

数据库已加入：

```text
knowledge_sources
knowledge_chunks FTS5
```

类型已加入：

```text
KnowledgeSource
KnowledgeChunk
```

后端已注册：

```text
list_knowledge_sources
import_knowledge
delete_knowledge_source
search_knowledge
```

判断：V0.6 轻量知识库已经具备雏形。

后续仍需检查：

- 是否支持文件导入，而不只是粘贴文本。
- 生成正文时是否自动检索并注入相关 chunks。
- 是否有检索命中可视化。
- 是否有 chunk 重建和清理机制。

### 3.5 写法规则、模型路由、任务中心

状态：**基础数据结构与命令已实现。**

数据库已加入：

```text
style_rules
model_routes
jobs
```

类型已加入：

```text
StyleRule
ModelRoute
Job
```

后端已注册：

```text
list_style_rules
create_style_rule
update_style_rule
delete_style_rule
list_model_routes
upsert_model_route
list_jobs
create_job
update_job_status
delete_job
extract_style_rules
analyze_text
```

判断：这些能力已经超过最初 P0 范围，属于后续规划的基础落地。

后续仍需检查：

- 模型路由是否已经被所有 AI 命令使用。
- fallback 模型是否真正可用。
- jobs 是否只是记录表，还是已经承担任务队列。
- style_rules 是否真正注入生成和审核链路。

---

## 4. 当前尚未实现的关键部分：AiRuntime 抽象

当前代码仍直接依赖：

```rust
use crate::ai::client::{AiClient, ChatMessage};
```

当前模型调用仍在 `AiClient::stream_chat()` 中完成，直接拼接：

```rust
{api_base}/chat/completions
```

并直接通过 reqwest 发送 OpenAI-compatible 请求。

这说明还没有：

```text
AiRuntime trait
OpenAICompatibleRuntime
OpenCodeRuntime
ToolRuntime
SkillsRegistry
MockRuntime
```

因此，下一阶段新增开发计划应围绕“AI Runtime 抽象层”展开。

---

# 5. 新增开发计划：AI Runtime 抽象与 OpenCode 复用组件接入

## 5.1 目标

新增目标不是简单替换 SDK，而是建立 OpenCodeWriter 自己的 AI Runtime 架构：

```text
所有 AI 调用统一走 OpenCodeWriter 自己定义的 AiRuntime 抽象；
业务逻辑继续由 OpenCodeWriter 控制；
opencode-ai SDK / OpenCode Server 作为 Agent / Tool / MCP Runtime / Skills 等可复用组件来源。
```

核心原则：

1. 小说业务流程不能交给 Agent 自由决策。
2. 大纲、人物、章节、正文、审核、回灌仍由业务代码编排。
3. Runtime 只负责模型调用、流式输出、工具调用、MCP 调度、Skills 调用。
4. OpenCode 相关能力必须通过适配器接入，不能污染业务层。
5. 默认实现仍为 OpenAI-compatible，保证现有功能不退化。

---

## 5.2 新架构总览

目标结构：

```text
commands/ai.rs
  ↓
AiTaskService
  ↓
ContextBuilder / PromptBuilder
  ↓
AiRuntimeManager
  ↓
AiRuntime trait
  ├─ OpenAICompatibleRuntime      默认实现
  ├─ OpenCodeRuntime              实验实现
  ├─ ToolRuntime                  本地业务工具调用
  ├─ McpRuntime                   未来 MCP 适配
  ├─ SkillsRuntime                未来 Skills 适配
  └─ MockRuntime                  测试实现
```

业务层只知道：

```text
我要执行 generate_content 任务
输入 project_id / chapter_id / task_type
输出 stream delta / final content / tool events
```

业务层不直接知道：

```text
当前是 reqwest 请求 OpenAI-compatible
还是 OpenCode server session.prompt
还是 MCP tool call
还是 Skills 执行
```

---

## 5.3 新增目录结构

建议新增：

```text
src-tauri/src/ai/runtime/
  mod.rs
  types.rs
  manager.rs
  openai_compatible.rs
  mock.rs
  opencode.rs
  tools.rs
  skills.rs
  mcp.rs

src-tauri/src/ai/tasks/
  mod.rs
  service.rs
  task_type.rs
```

说明：

- `runtime/`：底层 AI 执行环境。
- `tasks/`：业务任务编排入口，隔离 `commands/ai.rs` 过度膨胀。
- `context.rs`：继续保留，负责 prompt/context 构建。
- `events.rs`：继续保留，负责 Tauri event。

---

## 5.4 第一阶段：定义 Runtime 类型，不改变现有功能

### 5.4.1 新增 `runtime/types.rs`

建议定义：

```rust
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

use crate::ai::client::ChatMessage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AiDeltaType {
    Thinking,
    Content,
    ToolCall,
    ToolResult,
    Error,
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolResult {
    pub call_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone)]
pub struct AiRequest {
    pub task_type: String,
    pub provider_preset_id: Option<i64>,
    pub model_name: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<AiToolDefinition>,
    pub stream: bool,
    pub output_schema: Option<serde_json::Value>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDelta {
    pub delta_type: AiDeltaType,
    pub text: String,
    pub tool_call: Option<AiToolCall>,
    pub tool_result: Option<AiToolResult>,
}

pub type AiStream = Pin<Box<dyn Stream<Item = Result<AiDelta, String>> + Send>>;
```

### 5.4.2 新增 `runtime/mod.rs`

```rust
pub mod types;
pub mod manager;
pub mod openai_compatible;
pub mod mock;
pub mod opencode;
pub mod tools;
pub mod skills;
pub mod mcp;

use std::future::Future;
use std::pin::Pin;
use types::{AiRequest, AiStream};

pub trait AiRuntime: Send + Sync {
    fn stream(&self, request: AiRequest) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>>;
}
```

不建议第一步引入 `async_trait`，因为当前 Cargo.toml 还没有 `async-trait`。可以先用 boxed future，减少新增依赖。

---

## 5.5 第二阶段：把当前 AiClient 包成 OpenAICompatibleRuntime

### 5.5.1 新增 `runtime/openai_compatible.rs`

目标：复用当前 `AiClient::stream_chat()` 的逻辑。

```rust
use std::future::Future;
use std::pin::Pin;
use futures::StreamExt;

use crate::ai::client::{AiClient, StreamChunk};
use crate::models::ModelPreset;

use super::types::{AiDelta, AiDeltaType, AiRequest, AiStream};
use super::AiRuntime;

pub struct OpenAICompatibleRuntime {
    preset: ModelPreset,
}

impl OpenAICompatibleRuntime {
    pub fn new(preset: ModelPreset) -> Self {
        Self { preset }
    }
}

impl AiRuntime for OpenAICompatibleRuntime {
    fn stream(&self, request: AiRequest) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
        Box::pin(async move {
            let client = AiClient::new(
                self.preset.api_base.clone(),
                self.preset.api_key.clone(),
                self.preset.model_name.clone(),
            );

            let stream = client.stream_chat(request.messages).map(|item| {
                item.map(|chunk: StreamChunk| AiDelta {
                    delta_type: match chunk.chunk_type.as_str() {
                        "thinking" => AiDeltaType::Thinking,
                        _ => AiDeltaType::Content,
                    },
                    text: chunk.text,
                    tool_call: None,
                    tool_result: None,
                })
            });

            Ok(Box::pin(stream) as AiStream)
        })
    }
}
```

### 5.5.2 保留 `AiClient`

第一阶段不要删除 `AiClient`，它先作为 `OpenAICompatibleRuntime` 的内部实现。

后续稳定后再考虑把 reqwest/SSE 解析代码从 `client.rs` 移到 runtime 内部。

---

## 5.6 第三阶段：新增 RuntimeManager

### 5.6.1 新增 `runtime/manager.rs`

职责：

- 根据 task_type / preset_id 解析模型。
- 根据 settings 决定 runtime 类型。
- 默认返回 OpenAICompatibleRuntime。
- 未来可返回 OpenCodeRuntime。

建议接口：

```rust
pub enum RuntimeKind {
    OpenAICompatible,
    OpenCode,
    Mock,
}

pub struct AiRuntimeManager;

impl AiRuntimeManager {
    pub fn resolve_runtime(
        state: &tauri::State<'_, crate::db::DbState>,
        preset_id: i64,
        task_type: &str,
    ) -> Result<Box<dyn AiRuntime>, String> {
        let preset = crate::commands::ai_support::resolve_preset_for_runtime(state, preset_id, task_type)?;
        Ok(Box::new(OpenAICompatibleRuntime::new(preset)))
    }
}
```

注意：当前 `resolve_preset()` 在 `commands/ai.rs` 内部。为了给 runtime 复用，需要移动到公共 helper，例如：

```text
src-tauri/src/commands/ai_support.rs
```

或者：

```text
src-tauri/src/ai/model_routing.rs
```

推荐：

```text
src-tauri/src/ai/model_routing.rs
```

避免 commands 层被 runtime 反向依赖。

---

## 5.7 第四阶段：改造 stream_and_emit

当前 `stream_and_emit()` 接收：

```rust
client: &AiClient
messages: Vec<ChatMessage>
```

目标改成：

```rust
runtime: Box<dyn AiRuntime>
request: AiRequest
```

建议新增：

```rust
async fn stream_runtime_and_emit(
    runtime: Box<dyn AiRuntime>,
    request: AiRequest,
    app: &AppHandle,
    session_id: &str,
) -> Result<String, String> {
    let mut stream = runtime.stream(request).await?;
    let mut full_content = String::new();

    while let Some(item) = stream.next().await {
        match item {
            Ok(delta) => {
                match delta.delta_type {
                    AiDeltaType::Thinking => {
                        events::emit_chunk(app, session_id, &delta.text, "thinking");
                    }
                    AiDeltaType::Content => {
                        full_content.push_str(&delta.text);
                        events::emit_chunk(app, session_id, &delta.text, "content");
                    }
                    AiDeltaType::ToolCall => {
                        // P1: emit tool-call event
                    }
                    AiDeltaType::ToolResult => {
                        // P1: emit tool-result event
                    }
                    AiDeltaType::Error => {
                        events::emit_error(app, session_id, &delta.text);
                        return Err(delta.text);
                    }
                    AiDeltaType::Done => {}
                }
            }
            Err(e) => {
                events::emit_error(app, session_id, &e);
                return Err(e);
            }
        }
    }

    events::emit_done(app, session_id);
    Ok(full_content)
}
```

第一阶段可以保留旧 `stream_and_emit()`，等所有 AI 命令迁移完成后删除。

---

## 5.8 第五阶段：逐个迁移 AI 命令

迁移顺序必须从低风险到高风险。

### 第一批：纯文本输出

```text
generate_outline
polish_content
```

### 第二批：JSON 结构输出

```text
generate_characters
generate_chapters
polish_chapter
generate_character_from_description
```

### 第三批：新业务任务

```text
generate_idea_directions
generate_outline_from_direction
review_chapter_content
repair_chapter_content
chapter_aftercare
extract_style_rules
analyze_text
batch_generate_chapters
```

每迁移一个命令都要确认：

- 流式输出正常。
- thinking/content 仍可区分。
- onComplete 内容不变。
- JSON 解析不受影响。
- 失败时前端仍收到 ai-error。
- 完成时前端仍收到 ai-done。

---

## 5.9 第六阶段：定义 OpenCodeWriter 业务工具协议

先不要接 OpenCode SDK，先定义内部工具。

### 5.9.1 新增 `runtime/tools.rs`

建议工具白名单：

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

### 5.9.2 工具调用边界

禁止第一阶段开放：

```text
shell
file write
system command
arbitrary path read
external network call
```

原因：OpenCodeWriter 是小说写作工具，不是代码 Agent。AI 工具调用必须限定在小说业务数据内。

### 5.9.3 工具返回格式

统一格式：

```rust
pub struct BusinessToolResult {
    pub tool_name: String,
    pub ok: bool,
    pub content: serde_json::Value,
    pub error: Option<String>,
}
```

---

## 5.10 第七阶段：OpenCodeRuntime 实验实现

### 5.10.1 不直接嵌入 TS SDK

因为后端是 Rust，第一版建议：

```text
Rust -> HTTP -> OpenCode Server
```

而不是：

```text
Rust -> Node sidecar -> @opencode-ai/sdk -> OpenCode Server
```

### 5.10.2 新增设置

在 `settings` 表中新增：

```text
ai_runtime_kind = openai-compatible | opencode-server
opencode_server_url = http://127.0.0.1:4096
opencode_enable_tools = false
opencode_enable_mcp = false
opencode_enable_skills = false
```

### 5.10.3 OpenCodeRuntime 第一版只支持低风险任务

第一版只允许：

```text
review_chapter_content
analyze_text
extract_style_rules
```

暂不允许：

```text
generate_content
generate_chapters
generate_characters
```

原因：核心生成链路必须先保持稳定。

### 5.10.4 OpenCodeRuntime 事件映射

OpenCode server 的 session event 需要映射成 OpenCodeWriter 的：

```text
AiDeltaType::Thinking
AiDeltaType::Content
AiDeltaType::ToolCall
AiDeltaType::ToolResult
AiDeltaType::Error
AiDeltaType::Done
```

如果 OpenCode 的返回事件不稳定，必须在 adapter 内处理，不能让业务命令直接感知 OpenCode 原始事件。

---

## 5.11 第八阶段：Skills 可复用组件设计

这里的 Skills 不建议直接等同于 OpenCode 的代码技能，而是定义 OpenCodeWriter 自己的小说业务 Skills。

### 5.11.1 新增目录

```text
src-tauri/src/ai/skills/
  mod.rs
  registry.rs
  outline_skill.rs
  character_skill.rs
  chapter_review_skill.rs
  aftercare_skill.rs
  style_skill.rs
```

### 5.11.2 Skill 定义

```rust
pub struct SkillInput {
    pub project_id: i64,
    pub chapter_id: Option<i64>,
    pub payload: serde_json::Value,
}

pub struct SkillOutput {
    pub content: serde_json::Value,
    pub summary: String,
}

pub trait AiSkill: Send + Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn run(&self, input: SkillInput) -> Pin<Box<dyn Future<Output = Result<SkillOutput, String>> + Send + '_>>;
}
```

### 5.11.3 第一批 Skills

```text
chapter_review_skill       章节审核
chapter_repair_skill       章节修复
aftercare_skill            章节后回灌
style_extract_skill        提取写法规则
knowledge_retrieve_skill   知识库召回
```

这些 Skills 可以被：

- 普通 OpenAICompatibleRuntime 调用。
- 未来 OpenCodeRuntime 调用。
- Creative Hub 调用。
- 批量任务调用。

---

## 5.12 第九阶段：前端配置入口

设置页新增：

```text
AI Runtime 设置
```

字段：

```text
Runtime 类型：OpenAI-compatible / OpenCode Server / Mock
OpenCode Server 地址
启用工具调用
启用 MCP
启用 Skills
工具权限模式：安全 / 高级
```

默认：

```text
Runtime 类型：OpenAI-compatible
工具调用：关闭
MCP：关闭
Skills：开启业务内置 Skills，但不开放系统工具
```

警告文案：

```text
OpenCode Server 属于实验能力。启用后，AI 可能通过工具读取或处理项目数据。建议仅启用 OpenCodeWriter 内置业务工具，不要开放 shell 或任意文件访问。
```

---

## 5.13 第十阶段：验收标准

### 兼容性验收

- [ ] 不启用 OpenCodeRuntime 时，现有所有 AI 功能无变化。
- [ ] 大纲生成正常。
- [ ] 人物生成 JSON 解析正常。
- [ ] 章节生成 JSON 解析正常。
- [ ] 正文生成流式正常。
- [ ] 润色流式正常。
- [ ] 审核和修复命令正常。
- [ ] 前端 AIContext 状态正常。
- [ ] ai-chunk / ai-done / ai-error 事件兼容。

### Runtime 验收

- [ ] `AiRuntime` trait 存在。
- [ ] `OpenAICompatibleRuntime` 是默认实现。
- [ ] `commands/ai.rs` 不再直接创建 `AiClient`。
- [ ] 模型路由在 RuntimeManager 中统一处理。
- [ ] `MockRuntime` 可用于测试。

### Tool / Skill 验收

- [ ] 工具白名单生效。
- [ ] 禁止 shell 和任意文件写入。
- [ ] Skills 可以被普通 AI 任务调用。
- [ ] Skills 可以被未来 OpenCodeRuntime 复用。

### OpenCodeRuntime 验收

- [ ] 可以配置 OpenCode Server URL。
- [ ] 可以连接并执行低风险任务。
- [ ] OpenCode 原始事件被转换成 AiDelta。
- [ ] OpenCode 失败不会影响默认 Runtime。
- [ ] 用户可以随时切回 OpenAI-compatible。

---

## 5.14 推荐开发顺序

### Sprint 1：Runtime 抽象，不改变行为

1. 新增 `ai/runtime/types.rs`。
2. 新增 `AiRuntime` trait。
3. 新增 `OpenAICompatibleRuntime`。
4. 新增 `AiRuntimeManager`。
5. 把 `stream_and_emit()` 改造成 runtime 版本。
6. 只迁移 `generate_outline`。
7. 构建验证。

### Sprint 2：迁移全部 AI 命令

1. 迁移正文生成。
2. 迁移人物生成。
3. 迁移章节生成。
4. 迁移润色。
5. 迁移审核、修复、aftercare。
6. 删除直接创建 `AiClient` 的业务代码。
7. 构建验证。

### Sprint 3：工具协议与 Skills

1. 新增业务工具白名单。
2. 新增 Skills registry。
3. 把审核、修复、aftercare 封装为 Skills。
4. 在任务日志中记录工具调用。
5. 构建验证。

### Sprint 4：OpenCodeRuntime 实验接入

1. 新增 OpenCode Server 设置。
2. 新增 `OpenCodeRuntime` 适配器。
3. 只接入 `review_chapter_content`。
4. 前端增加实验开关。
5. 验证失败回退。

### Sprint 5：MCP / 外部工具扩展

1. MCP 状态检测。
2. MCP 工具列表读取。
3. MCP 工具白名单。
4. Skills 与 MCP 工具统一展示。
5. 加权限提示和审计日志。

---

## 6. 当前不建议做的事情

### 6.1 不建议直接删除 AiClient

`AiClient` 当前是稳定路径，先作为 OpenAICompatibleRuntime 的内部实现保留。

### 6.2 不建议前端直接调用 OpenCode Server

原因：API Key、工具权限、项目数据边界都应该留在 Tauri 后端控制。

### 6.3 不建议默认启用 OpenCodeRuntime

它应该是实验能力，默认仍然是 OpenAI-compatible。

### 6.4 不建议开放 shell / 任意文件访问

小说写作项目不需要默认开放这类高危工具。

### 6.5 不建议让 Agent 接管业务流程

Agent 可以辅助工具调用，但不能决定：

- 是否覆盖正文。
- 是否保存数据库。
- 是否更新角色状态。
- 是否清空章节。
- 是否批量生成。

这些必须由 OpenCodeWriter 的业务代码控制。

---

## 7. 最终建议

当前开发计划大部分已经实现，下一阶段的真正重点不是继续加新业务表，而是把已经快速扩张的 AI 能力统一收口到 Runtime 架构。

推荐下一步主线：

```text
先做 AiRuntime 抽象
再迁移现有 AI 命令
再定义业务工具和 Skills
最后实验性接入 OpenCodeRuntime / MCP
```

这样可以保证：

1. 当前功能不退化。
2. 后续模型调用不会分散在 commands 里。
3. OpenCode SDK 可以作为可复用组件接入，而不是绑死项目。
4. 业务逻辑仍由 OpenCodeWriter 控制。
5. 未来做 Creative Hub、Agent、MCP、Skills 时有统一底座。
