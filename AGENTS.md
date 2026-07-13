# AGENTS.md — OpenCodeWriter

## 基本规则

- 使用简体中文沟通。
- 明确假设；存在歧义、矛盾或关键产品决策时先说明并请求确认。
- 用最少代码解决当前任务，不为未来假设创建抽象层。
- 只修改与当前任务直接相关的文件，不顺手格式化、重构或清理相邻代码。
- 匹配现有代码风格。删除因本次修改产生的死代码；预先存在的死代码只报告，不擅自删除。
- 没有刚运行的验证命令和结果，不声称“已通过”。

## 当前项目事实

- 当前实现是 React 19 + Vite + TypeScript 前端，以及 Tauri 2 + Rust + SQLite 后端。
- `DEV-PLAN.md` 是后续实现的主计划，已经从旧 OpenTUI 方案更新为当前 Tauri/React 架构。
- Phase 9 的 SDK-first 路线是 Rust `SdkBackedRuntime` 调本地 Node SDK Adapter，再由 Adapter 调 `@opencode-ai/sdk`；不要新增、配置或兼容外部 OpenCode Server，也不要在普通设置页暴露 Runtime 切换。
- `Product-Spec.md` 管功能逻辑和验收标准。
- `Design-Brief.md` 管产品形态、交互和视觉约束；若与当前代码或后续计划冲突，先指出冲突并让用户确认是否更新上游文档。
- `docs/ArchitectsReply/` 下的日期文档是架构建议来源。执行前按日期和问题判断是否需要参考。

## 开工顺序

1. 读取本文件。
2. 读取 `DEV-PLAN.md` 中当前要执行的 Phase 和 Task。
3. 按需读取 `Product-Spec.md`、`Design-Brief.md`、相关 `docs/ArchitectsReply/*.md`。
4. 用 codebase-memory-mcp 优先做代码发现：`search_graph`、`trace_path`、`get_code_snippet`、`query_graph`、`search_code`。
5. MCP 结果不足时再用 `rg`、文件列表和普通读取。
6. 明确涉及文件、完成标准、验证命令后再编码。

## 执行规则

- 后续开发按 `DEV-PLAN.md` 的 Phase 顺序推进，默认选择最早未完成且用户指定的任务。
- 每次只做一个可独立验收的任务或一个小 Phase，不跨阶段混做。
- 数据库变更统一放在 `src-tauri/src/db/migrations.rs`，并保证旧数据可启动。
- Tauri 命令新增后同步更新 Rust model、前端类型和 `src/lib/tauri.ts` invoke 封装。
- AI 能力必须明确输入、输出、失败处理和是否需要快照。
- AI 底层接入不得让前端或小说业务层直接依赖 `@opencode-ai/sdk`；SDK 只允许出现在 `sdk-adapter/**` 或 Runtime 适配层边界内。默认 AI 底座为 SDK-backed，OpenAI-compatible 只作为内部 fallback / 排障路径。
- 覆盖正文、大纲或修复内容前，优先创建快照。

## 验证门禁

常规验证：

```bash
pnpm build
cd src-tauri && cargo check
```

涉及界面、Tauri command、AI 流式、数据库迁移时，还需要运行或人工验证：

```bash
pnpm tauri dev
```

每个 Phase 至少完成：

- 编译/类型检查。
- 功能入口人工验证。
- 数据持久化或错误路径验证。
- 两阶段代码审查：先验收“是否做对”，再验收“是否做好”。

## Git 与文档

- 不自动提交、不发布、不打包上传，除非用户明确要求。
- 修改计划、规则或需求时，只改当前任务直接要求的文档。
- 若实现中发现计划不准确，先更新 `DEV-PLAN.md` 对应任务，再继续实现。
- 最终回复必须列出修改文件、运行过的验证命令、未验证项。
