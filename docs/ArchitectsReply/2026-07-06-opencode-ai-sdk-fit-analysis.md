# 2026-07-06 opencode-ai SDK 作为 OpenCodeWriter 底层 AI 适配层的修订分析

## 0. 用户最新修正

用户补充说明：

```text
我想要的不是接管小说业务主流程，而是做一个最底层的适配，
让 SDK 来帮我将对 AI 的操作都完成，
我只需要在上面搭建业务逻辑，
以及在业务执行过程中调用 SDK 来实现各种功能，
例如加载 skills、MCP、思维链、工具调用等等。
```

因此，本文修订此前判断：重点不再是“是否让 OpenCode Agent 接管小说业务”，而是设计一种 **SDK-first 底层 AI 能力适配架构**。

---

## 1. 修订后的结论

**这个方向可以做，而且比继续在业务代码里手写模型调用更适合后续扩展。**

但架构边界必须明确：

```text
OpenCodeWriter 业务层：负责小说业务流程
SDK / Runtime 底层：负责所有 AI 能力执行
```

也就是说：

```text
业务层决定：什么时候生成大纲、什么时候生成人物、什么时候审核章节、什么时候回灌状态。
SDK 负责：模型调用、流式输出、思维链事件、工具调用、MCP、Skills、Agent 执行、会话管理。
```

推荐目标架构：

```text
OpenCodeWriter Novel Business Logic
  ↓
OpenCodeWriter AiRuntime 抽象接口
  ↓
SdkBackedRuntime / OpenCodeRuntime
  ↓
opencode-ai SDK / OpenCode Server / MCP / Skills / Tools
  ↓
LLM Providers
```

这样既满足“所有 AI 操作都走 SDK”，又避免“SDK 接管小说主流程”。

---

## 2. opencode-ai SDK 在该架构中的定位

opencode-ai SDK 不应该被理解成一个普通的 `chat.completions` 替代品，而应该被放在更底层，作为 **AI 能力执行底座**。

它可以负责：

```text
1. 模型请求
2. 流式响应
3. session 管理
4. 思维链 / reasoning 事件接收与转发
5. tools 注册、发现、调用
6. MCP server 接入与工具桥接
7. skills 加载与调度
8. provider / model 管理
9. agent 执行能力
10. abort / retry / event subscribe
```

OpenCodeWriter 负责：

```text
1. 小说项目结构
2. 大纲、人物、章节、正文的数据模型
3. 章节任务单
4. 审核结果保存
5. 伏笔、事实、角色状态回灌
6. 快照、版本、自动保存
7. UI 交互
8. 业务流程编排
```

一句话：

```text
SDK 执行 AI 能力，OpenCodeWriter 编排小说业务。
```

---

## 3. 当前代码现状

当前 OpenCodeWriter 的 AI 调用集中在：

```text
src-tauri/src/ai/client.rs
src-tauri/src/ai/context.rs
src-tauri/src/commands/ai.rs
```

当前实际调用路径仍然是：

```text
commands/ai.rs
  -> AiClient
  -> OpenAI-compatible /chat/completions
```

当前 `AiClient` 自己做了：

```text
1. reqwest 请求
2. SSE 解析
3. reasoning_content / content / GLM reces 解析
4. StreamChunk 输出
```

这说明现在底层 AI 能力仍由项目自己手写实现。

如果后续要支持 MCP、Skills、工具调用、多 Agent、思维链统一事件，那么继续手写会越来越重。

因此，下一步应该把底层能力抽象出来，并引入 SDK-backed runtime。

---

## 4. 新边界：不是 Agent 接管业务，而是 SDK 执行 AI 操作

错误理解：

```text
用户点击“生成正文”
-> 交给 OpenCode Agent 自己决定要做什么
-> Agent 自己读写项目数据
-> Agent 自己决定保存结果
```

正确理解：

```text
用户点击“生成正文”
-> OpenCodeWriter 业务层读取项目、大纲、人物、世界观、章节任务单
-> OpenCodeWriter 构建 AiRequest
-> AiRuntime 调用 SDK 执行模型 / 工具 / MCP / Skills
-> SDK 返回统一事件流
-> OpenCodeWriter 解析最终结果并保存正文
```

也就是说，SDK 负责“怎么和 AI 交互”，业务层负责“这次交互的业务意义是什么”。

---

## 5. 推荐架构：AiRuntime 是项目接口，SDK 是默认底层实现

### 5.1 分层结构

```text
src-tauri/src/ai/
  context.rs              业务 prompt / context 构建
  events.rs               Tauri AI 事件输出
  runtime/
    mod.rs                AiRuntime trait
    types.rs              AiRequest / AiDelta / ToolCall / SkillCall
    manager.rs            Runtime 选择与配置
    sdk_backed.rs         SDK-backed 默认实现
    openai_compatible.rs  兼容旧实现 / fallback
    mock.rs               测试实现
    tools.rs              本地业务工具注册
    skills.rs             Skills 注册与加载
    mcp.rs                MCP 工具桥接
```

### 5.2 Runtime 抽象职责

`AiRuntime` 不只是 chat，而是统一 AI 操作入口：

```text
stream_chat              流式文本 / thinking / content
generate_object          结构化 JSON 输出
run_with_tools           工具调用
run_skill                执行 skill
list_tools               工具发现
list_mcp_tools           MCP 工具发现
abort                    取消任务
```

### 5.3 业务层调用方式

业务层不再直接关心 SDK 细节。

示例：

```rust
let request = AiRequest {
    task_type: "generate_content".into(),
    messages,
    output_schema: None,
    tools: vec!["search_knowledge", "get_world_items"],
    skills: vec!["novel_content_writer"],
    mcp_policy: McpPolicy::Disabled,
    stream: true,
    metadata,
};

let stream = ai_runtime.stream(request).await?;
```

业务层看到的是统一 `AiDelta`：

```text
thinking
content
tool_call
tool_result
skill_start
skill_result
mcp_call
mcp_result
error
done
```

底层到底是 opencode-ai SDK、OpenCode Server、OpenAI-compatible fallback，业务层不关心。

---

## 6. 推荐实现方式

因为 OpenCodeWriter 后端是 Rust，而 `@opencode-ai/sdk` 是 TypeScript/Node 生态，所以落地有两种路线。

### 路线 A：Rust 调 OpenCode Server HTTP API

```text
Rust AiRuntime
  -> HTTP
  -> OpenCode Server
  -> SDK / Agent / Tools / MCP / Skills
```

优点：

```text
1. Rust 后端保持主控
2. 前端不暴露 SDK 和 API Key
3. 不需要业务层写 Node 代码
4. Tauri 后端统一管理安全边界
```

缺点：

```text
1. 需要管理 OpenCode Server 进程
2. 需要适配 OpenCode Server 的事件格式
3. SDK 能力通过 server 间接使用
```

### 路线 B：Tauri Sidecar 内置 Node SDK Adapter

```text
Rust AiRuntime
  -> local sidecar process
  -> Node SDK Adapter
  -> @opencode-ai/sdk
  -> OpenCode Server / SDK 能力
```

优点：

```text
1. 可以更直接使用 @opencode-ai/sdk
2. SDK 升级和适配集中在 Node adapter
3. 更容易复用 SDK 的客户端能力
```

缺点：

```text
1. 打包复杂度更高
2. Windows sidecar 管理更复杂
3. 需要额外设计 adapter 协议
```

### 推荐路线

第一阶段推荐路线 A：

```text
Rust -> OpenCode Server HTTP API
```

等验证稳定后，再决定是否引入 Node SDK Adapter。

核心原则是：

```text
不让前端直接调用 SDK；
不让业务代码直接依赖 SDK；
SDK 能力统一隐藏在 AiRuntime 后面。
```

---

## 7. SDK 负责的能力清单

后续所有 AI 相关底层操作都应该走 Runtime/SDK：

### 7.1 模型调用

```text
普通文本生成
结构化 JSON 生成
流式输出
批量任务调用
模型 fallback
provider/model 查询
```

### 7.2 思维链 / reasoning 事件

```text
thinking delta
reasoning summary
思考过程开关
思考内容过滤
思考内容单独事件输出
```

注意：前端可以显示“AI 思考中 / 思考摘要”，但不一定暴露完整内部 reasoning 文本。

### 7.3 工具调用

```text
tool definitions
tool call
tool result
tool permission
tool audit log
```

工具调用只开放业务白名单。

### 7.4 MCP

```text
MCP server 配置
MCP tool list
MCP tool call
MCP auth 状态
MCP result 映射
```

### 7.5 Skills

```text
加载 Skills
注册 Skills
执行 Skills
Skill 输入输出 schema
Skill 执行日志
Skill 版本管理
```

### 7.6 Agent / Session

```text
session create
session prompt
session abort
session messages
session events
agent selection
```

这些能力只作为执行机制，不接管业务主流程。

---

## 8. OpenCodeWriter 自己保留的业务能力

即使所有 AI 操作都走 SDK，以下仍必须由 OpenCodeWriter 控制：

```text
1. 什么时候调用 AI
2. 调哪个 task_type
3. 注入哪些小说上下文
4. 允许哪些 tools / skills / MCP
5. 结果保存到哪里
6. 是否创建快照
7. 是否更新 stale markers
8. 是否更新角色状态 / 事实 / 伏笔
9. 是否覆盖正文
10. 是否进入下一阶段
```

业务层不是写底层 AI 客户端，而是写：

```text
小说业务任务编排器
```

---

## 9. 修改后的迁移路线

### 阶段 1：抽象 AiRuntime，但设计成 SDK-first

新增：

```text
AiRuntime
AiRequest
AiDelta
AiToolDefinition
AiToolCall
AiSkillCall
AiMcpCall
```

目标：让所有 AI 命令只调用 `AiRuntime`，不再直接依赖 `AiClient`。

### 阶段 2：保留 OpenAI-compatible 作为 fallback runtime

当前 `AiClient` 不删除，先包装成：

```text
OpenAICompatibleRuntime
```

它只作为兼容旧能力和 SDK 不可用时的 fallback。

### 阶段 3：实现 SdkBackedRuntime / OpenCodeRuntime

新增：

```text
SdkBackedRuntime
OpenCodeRuntime
```

职责：

```text
把 AiRequest 转成 SDK / OpenCode Server 请求
把 SDK 事件转成 AiDelta
把 tools / skills / MCP 调用统一映射回 OpenCodeWriter
```

### 阶段 4：所有 AI 命令迁移到 Runtime

迁移：

```text
generate_outline
generate_characters
generate_chapters
generate_content
generate_idea_directions
generate_outline_from_direction
polish_content
polish_chapter
review_chapter_content
repair_chapter_content
chapter_aftercare
extract_style_rules
analyze_text
batch_generate_chapters
```

迁移后，`commands/ai.rs` 不再直接创建 `AiClient`。

### 阶段 5：Skills / MCP / Tools 统一注册

新增：

```text
BusinessToolRegistry
SkillRegistry
McpRegistry
PermissionPolicy
```

所有工具、Skills、MCP 调用都通过 SDK/Runtime 执行，但权限由 OpenCodeWriter 控制。

### 阶段 6：默认 Runtime 切换

当 SdkBackedRuntime 稳定后：

```text
默认 Runtime：SdkBackedRuntime
Fallback Runtime：OpenAICompatibleRuntime
Mock Runtime：测试
```

---

## 10. 安全边界

即使 SDK 负责所有 AI 操作，也不能默认开放全部能力。

默认安全策略：

```text
允许：OpenCodeWriter 内置业务工具
允许：只读知识库检索
允许：只读项目上下文读取
允许：受控写入审核结果 / 事实 / 伏笔 / 快照
禁用：shell
禁用：任意文件写入
禁用：任意路径读取
禁用：外部命令执行
禁用：未经用户确认的 destructive 操作
```

这不是限制 SDK，而是给 SDK 加业务安全边界。

---

## 11. 最终修订建议

原先表述偏保守，容易理解成“OpenCode SDK 只是未来可选实验能力”。

修订后应该明确为：

```text
OpenCodeWriter 应该建立自己的 AiRuntime 接口；
AiRuntime 的目标是承接所有 AI 操作；
底层优先适配 opencode-ai SDK / OpenCode Server；
当前 OpenAI-compatible 实现作为 fallback；
小说业务逻辑继续由 OpenCodeWriter 编排；
SDK 只负责 AI 能力执行，不负责小说业务决策。
```

这才符合用户想要的方向：

```text
底层统一 AI SDK 能力
上层专注小说业务逻辑
业务执行过程中随时调用 SDK 提供的 skills / MCP / tools / thinking / agent 能力
```
