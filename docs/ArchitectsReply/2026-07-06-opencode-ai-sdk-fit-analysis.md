# 2026-07-06 opencode-ai SDK 是否适合接入 OpenCodeWriter 的分析

## 用户问题

你知道 opencode-ai sdk 吗？这个 SDK 适合使用到我的项目中吗？我想代替自定义实现的 AI 模型调用机制，以后所有与 AI 模型的交互，包括与 AI 有关的调用和工具使用都走 SDK，业务方面走代码逻辑实现，这样可以吗？

## 结论先行

**可以参考，但不建议现在直接用 `@opencode-ai/sdk` 全量替代当前项目的 AI 调用层。**

更推荐的做法是：

```text
业务编排层仍然由 OpenCodeWriter 自己实现
AI 调用层抽象成统一 AiRuntime 接口
先保留当前 OpenAI-compatible 实现
预留 OpenCodeRuntime 适配器
后续如果需要 Agent / Tool / MCP，再接入 opencode-ai SDK
```

也就是说，不建议把小说生成、大纲、人物、章节、正文这些业务流程交给 OpenCode Agent 自己决策；但可以把 OpenCode SDK 作为未来的“工具调用 / Agent 执行 / MCP 能力适配层”。

## 1. opencode-ai SDK 是什么

OpenCode 官方仓库定位是：

```text
The open source AI coding agent.
```

它首先是一个开源 AI 编码 Agent，而不是专门为小说生成场景设计的通用 AI SDK。

从仓库 README 看，它支持：

- CLI 安装。
- Desktop App。
- build / plan 内置 agent。
- general 子 agent。
- 配置文档和 agent 文档。

从 `@opencode-ai/sdk` 包看，它的定位是连接/启动 OpenCode Server，并通过 Client 调用 server 的会话、工具、文件、命令、MCP 等能力。

## 2. SDK 的实际能力结构

`@opencode-ai/sdk` 的 package 暴露：

```json
"exports": {
  ".": "./src/index.ts",
  "./client": "./src/client.ts",
  "./server": "./src/server.ts",
  "./v2": "./src/v2/index.ts",
  "./v2/client": "./src/v2/client.ts",
  "./v2/server": "./src/v2/server.ts",
  "./v2/types": "./src/v2/gen/types.gen.ts"
}
```

它的 `createOpencode()` 实际做的是：

```ts
createOpencodeServer(...)
createOpencodeClient({ baseUrl: server.url })
```

而 `createOpencodeServer()` 会通过 `cross-spawn` 启动本机 `opencode serve`：

```ts
const args = [`serve`, `--hostname=${options.hostname}`, `--port=${options.port}`]
const proc = launch(`opencode`, args, ...)
```

这说明它不是一个“直接发 LLM 请求”的轻量库，而是一个“启动/连接 OpenCode 服务”的 SDK。

SDK 生成的 client 包含这些能力：

- `session.create`
- `session.prompt`
- `session.promptAsync`
- `session.abort`
- `session.messages`
- `tool.ids`
- `tool.list`
- `provider.list`
- `file.read`
- `find.text`
- `mcp.*`
- `event` SSE

这类能力非常适合编码 Agent、项目文件分析、工具调用、MCP 调度，但不等价于小说业务里的“生成大纲、人物、章节、正文”。

## 3. 当前 OpenCodeWriter 的 AI 调用现状

当前项目是 Tauri + Rust 后端，本地 SQLite。

AI 调用主要集中在：

```text
src-tauri/src/ai/client.rs
src-tauri/src/ai/context.rs
src-tauri/src/commands/ai.rs
```

当前实现特点：

- 使用 Rust `reqwest` 直接请求 OpenAI-compatible `/chat/completions`。
- 支持 SSE 流式输出。
- 解析 `reasoning_content`、`content`、GLM `reces` 等不同流格式。
- 将流式内容通过 Tauri event 发给前端。
- 大纲、人物、章节、正文、润色等业务 prompt 由 `ContextBuilder` 构建。
- 业务命令包括：
  - `generate_outline`
  - `generate_characters`
  - `generate_chapters`
  - `generate_content`
  - `generate_character_from_description`
  - `polish_content`
  - `polish_chapter`

这个结构本质上已经是：

```text
业务逻辑层：commands/ai.rs
Prompt 组装层：ai/context.rs
模型调用层：ai/client.rs
事件流层：ai/events.rs
```

这套分层是对的，问题不是“必须换 SDK”，而是当前 `AiClient` 还比较薄，没有抽象成可替换 Runtime。

## 4. 直接替换成 opencode-ai SDK 的问题

### 4.1 技术栈不完全匹配

OpenCodeWriter 后端是 Rust，`@opencode-ai/sdk` 是 TypeScript/Node 生态 SDK。

如果强行接入，有三种方式：

1. Tauri Rust 调 Node sidecar。
2. 前端直接调用 OpenCode server。
3. Rust 直接调用 OpenCode server HTTP API。

其中：

- 方案 1 会增加 Node sidecar 打包、启动、端口管理、进程生命周期问题。
- 方案 2 会让 API Key、工具权限暴露面变大，不适合桌面本地数据安全。
- 方案 3 可行，但这时你其实不是用 TS SDK，而是在用 OpenCode server HTTP API。

### 4.2 SDK 默认目标是编码 Agent，不是小说生成

OpenCode 的核心抽象是 session、project、file、tool、shell、MCP、provider、agent。

小说创作的核心抽象是：

- 项目设定。
- 大纲。
- 人物。
- 世界观。
- 章节任务单。
- 正文。
- 审核报告。
- 伏笔。
- 角色状态。

这两组抽象不一致。

如果把所有 AI 相关调用都走 OpenCode agent，让 Agent 自己决定工具使用，很容易出现：

- 输出不可控。
- JSON 结构不稳定。
- 业务状态难回灌。
- 生成结果难审计。
- 用户很难知道某一步为什么失败。

### 4.3 OpenCode server 生命周期会增加桌面应用复杂度

`createOpencodeServer()` 会启动 `opencode serve` 并等待端口可用。对桌面软件来说，你需要额外处理：

- opencode binary 是否内置。
- 首次启动 server 的耗时。
- 端口冲突。
- server 崩溃恢复。
- 用户机器上的环境变量和模型凭据。
- Windows 打包兼容性。
- 离线使用场景。
- 日志和错误诊断。

而当前 Rust `reqwest` 直接调用模型，路径更短、更可控。

### 4.4 工具调用权限风险

OpenCode 的工具链包含文件、命令、shell、MCP 等能力。对于小说软件而言，大多数 AI 任务不需要 shell 和代码文件操作。

如果接入时权限边界不清晰，可能会出现：

- AI 误操作本地文件。
- 工具调用越权。
- 用户难以理解为什么 AI 要调用某个工具。
- 小说生成任务被编码 Agent 语义污染。

因此即使未来接入，也必须做白名单工具，不应开放 OpenCode 的默认 build agent 权限。

## 5. 可以这样设计吗？

用户设想是：

```text
以后所有与 AI 模型的交互，包括与 AI 有关的调用和工具使用都走 SDK，业务方面走代码逻辑实现。
```

这个方向在架构思想上是对的：

```text
业务逻辑和 AI Runtime 解耦
```

但不建议把 “SDK” 直接限定成 `@opencode-ai/sdk`。更合理的表达应该是：

```text
所有 AI 调用统一走 OpenCodeWriter 自己定义的 AiRuntime 接口；
AiRuntime 可以有多个实现：
1. OpenAICompatibleRuntime
2. OpenCodeRuntime
3. VercelAiSdkRuntime
4. MockRuntime
```

这样以后换 SDK、换模型、换 Agent 框架，不会影响大纲、人物、章节、正文这些业务逻辑。

## 6. 推荐架构

建议新增一层：

```text
src-tauri/src/ai/runtime/
  mod.rs
  types.rs
  openai_compatible.rs
  opencode_runtime.rs     // 先预留，不急着实现
  mock.rs
```

### 6.1 Runtime 接口

建议定义：

```rust
pub struct AiRequest {
    pub task_type: String,
    pub model_route: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<AiToolDefinition>,
    pub stream: bool,
    pub output_schema: Option<String>,
}

pub struct AiDelta {
    pub delta_type: String, // thinking | content | tool_call | tool_result | error | done
    pub text: String,
    pub tool_call: Option<AiToolCall>,
}

#[async_trait]
pub trait AiRuntime {
    async fn stream(&self, request: AiRequest) -> Result<Pin<Box<dyn Stream<Item = Result<AiDelta, String>> + Send>>, String>;
}
```

### 6.2 当前实现迁移

把现在的：

```text
AiClient::stream_chat(messages)
```

改造成：

```text
OpenAICompatibleRuntime::stream(AiRequest)
```

业务命令不再直接依赖 `AiClient`，而是依赖统一 runtime。

### 6.3 未来 OpenCodeRuntime

当你真的需要工具调用或 MCP 时，再实现：

```text
OpenCodeRuntime
```

它可以有两种实现方式：

1. Rust 直接请求 OpenCode server HTTP API。
2. Tauri sidecar 启动 Node/OpenCode server，再通过 HTTP 调用。

更推荐先做第一种：Rust 通过 HTTP 调 OpenCode server，而不是在 Rust 里嵌 Node SDK。

## 7. 什么场景适合用 opencode-ai SDK

适合：

- 你要做 Creative Hub 类似的自然语言任务中枢。
- 你要让 AI 调用工具。
- 你要接 MCP。
- 你要做多步骤 Agent。
- 你要利用 OpenCode 的 provider/model/agent/session 能力。
- 你要允许 AI 根据上下文选择工具。

不适合直接替代：

- 纯大纲生成。
- 纯人物 JSON 生成。
- 章节目录 JSON 生成。
- 正文生成。
- 正文润色。
- 结构化审核输出。

这些更适合继续用业务代码强约束 prompt、schema、保存逻辑和状态回灌。

## 8. 如果坚持接入，应采用渐进方案

### 阶段 1：先抽象 AiRuntime，不接 OpenCode

目标：不改变功能，只重构 AI 调用层。

任务：

- 新增 `AiRuntime` trait。
- 把当前 `AiClient` 改成 `OpenAICompatibleRuntime`。
- `commands/ai.rs` 仍保持原业务逻辑。
- 前端无感。

验收：现有大纲、人物、章节、正文、润色全部可用。

### 阶段 2：增加工具调用协议，但只做本地业务工具

新增工具类型：

```text
get_project_profile
get_outline
get_characters
get_chapters
get_world_items
save_review_result
create_snapshot
```

注意：这些工具是 OpenCodeWriter 的业务工具，不是开放 shell/file 系统工具。

### 阶段 3：做一个 OpenCodeRuntime 实验开关

设置页新增：

```text
AI Runtime:
- OpenAI Compatible（默认）
- OpenCode Server（实验）
```

OpenCodeRuntime 只先接一个非核心任务，例如：

```text
AI 审核本章
```

不要一上来接正文生成。

### 阶段 4：评估稳定性后再扩大范围

可逐步尝试：

- 章节审核。
- 章节修复。
- Creative Hub 问答。
- 资料检索 + 工具调用。

最后才考虑：

- 大纲生成。
- 人物生成。
- 正文生成。

## 9. 我的最终建议

### 9.1 不建议现在全量替换

原因：

- 当前项目是 Rust/Tauri，本身已经有稳定直接的 OpenAI-compatible 流式调用。
- `@opencode-ai/sdk` 是 TS SDK，需要 server/sidecar，接入复杂度高。
- OpenCode 主要是编码 Agent，和小说生成业务抽象不完全一致。
- 小说业务需要强 schema、强流程、强状态回灌，不能完全交给 Agent 自由执行。

### 9.2 建议先做 Runtime 抽象

最佳路线：

```text
现在：commands/ai.rs -> AiClient -> OpenAI-compatible API

改成：commands/ai.rs -> AiRuntime trait -> OpenAICompatibleRuntime

未来：commands/ai.rs -> AiRuntime trait -> OpenCodeRuntime / VercelAiSdkRuntime / MockRuntime
```

### 9.3 OpenCode SDK 的最佳定位

在 OpenCodeWriter 中，OpenCode SDK 最适合定位为：

```text
实验性的 Agent / Tool / MCP Runtime
```

而不是：

```text
所有模型调用的唯一底层 SDK
```

## 10. 一句话结论

你的想法“AI 调用统一走 SDK，业务走代码逻辑”是正确的，但这个 SDK 应该先是你自己定义的 `AiRuntime` 抽象，而不是直接绑定 `@opencode-ai/sdk`。

短期建议：继续保留当前自定义模型调用，先重构成 Runtime 接口。

中期建议：在章节审核、修复、Creative Hub 这类需要工具调用的功能上试接 OpenCodeRuntime。

长期建议：如果 OpenCode SDK 在本地桌面打包、工具权限、模型路由、稳定性上验证通过，再逐步扩大使用范围。
