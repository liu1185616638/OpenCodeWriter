# Coding Harness 5.0 初始化设计

## 目标

在空项目中建立文章《AI 编程｜毒舌产品经理 5.0》描述的完整 Codex Coding Harness，同时按当前 Codex 官方格式和 Windows 环境做必要适配。

成功标准：Codex 能发现根 `AGENTS.md`、11 个项目级 Skill、2 个固定 Sub-Agent 和 6 个 Hook；配置文件可解析；Hook 有安全默认值和可执行的基础验证；所有外部来源都有记录，未找到可复用来源的项目明确标注为本地创建。

## 来源策略

每个 Skill 按以下顺序处理：

1. 在 GitHub 查找同名 Skill，核对许可证、内容和目录结构后复用。
2. 同名不存在时，查找职责相近的 Skill，只抽取与文章目标一致且适合当前项目的部分，不整包混入无关流程。
3. 仍无合适来源时，结合文章描述、当前 Codex 官方文档和相关领域的一手资料自行创建。

不盲目安装全局 Skill。文章中的 11 个 Skill 属于仓库级能力，最终统一放在 `.agents/skills/`。外部 Skill 如需采用，复制并适配到仓库内，同时保留来源说明。

## 目录结构

创建以下核心结构：

```text
OpenCodeWriter/
├── AGENTS.md
├── .agents/skills/
│   ├── product-spec-builder/
│   ├── design-brief-builder/
│   ├── design-maker/
│   ├── dev-planner/
│   ├── dev-builder/
│   ├── bug-fixer/
│   ├── code-review/
│   ├── release-builder/
│   ├── goal-creator/
│   ├── evolution-engine/
│   └── skill-builder/
├── .codex/
│   ├── config.toml
│   ├── hooks.json
│   ├── hooks/
│   ├── agents/
│   │   ├── code-reviewer.toml
│   │   └── evolution-runner.toml
│   ├── evolution/
│   │   ├── signals.jsonl
│   │   └── proposals.md
│   └── EVOLUTION.md
└── docs/superpowers/
```

每个 Skill 至少包含 `SKILL.md` 与 `agents/openai.yaml`。只有确有重型知识时才增加 `references/`，不创建占位资源或额外 README。

## 编排设计

`AGENTS.md` 只定义角色、目标、标准和边界，不固化模型应自行决定的详细过程。它负责：

- 检测 Product Spec、Design Brief、开发计划和代码状态，并路由到合适 Skill。
- 开工前拆分可独立验收的步骤，并为每步定义完成证据。
- 根据耦合度选择顺序执行、并行执行或显式请求 Sub-Agent。
- 强制文档重读、结果自检、Review → Fix 闭环和证据化完成声明。
- 区分项目偏好与可复用规则，任何进化建议必须经用户逐条确认。

固定 Sub-Agent 仅保留独立审查和进化消化。审查员只报告、不修复；进化执行者只提出建议、不替用户拍板。临时执行型 Sub-Agent 不提交代码，也不继续派生 Agent。

## Skill 设计

流水线 Skill 覆盖需求、设计规范、设计稿、开发计划、开发、修复、审查和发布；体系 Skill 覆盖 Goal 生成、进化建议和新 Skill 创建。

每个 Skill 的正文统一聚焦：

- 所需输入和前置条件。
- 第一性原则与边界。
- 必须产出的文件或报告。
- 可观察、可复现的验收标准。
- 何时停止并请求用户决策。

需求访谈等模型无法替用户决定的环节不允许自驱猜测；开发、验证和发布等标准明确的环节可以目标驱动执行。

## Hook 与安全设计

按文章保留六项职责：提交前验证、提交后推送、停止门禁、代码变更标记、反馈信号捕捉、会话启动进化检查。

配置采用当前 Codex 支持的 `hooks.json` 事件结构。命令提供 POSIX 脚本和 Windows PowerShell 适配；路径从 Git 根目录解析，避免从子目录启动时失效。

安全边界：

- 自动推送只在存在远程、当前分支非保护分支且提交成功时运行。
- 不写入模型名、API Key、MCP 凭据或用户机器专属路径。
- 发布隐私审计发现密钥、数据库、环境文件或开发者绝对路径时必须失败。
- Hook 首次运行仍遵循 Codex 的项目信任与 Hook 审查机制。

## 验证

初始化后执行以下验证：

- 校验 11 个 `SKILL.md` 的 frontmatter、名称和目录一致性。
- 校验 `agents/openai.yaml`、`.codex/config.toml`、Sub-Agent TOML 与 `hooks.json` 可解析。
- 对 6 个 Hook 运行无副作用的样例输入，确认退出码和状态文件行为。
- 检查项目级 Skill 与 `AGENTS.md` 位于 Codex 官方发现路径。
- 检查 Git 工作区只包含本次初始化文件。

自动推送不做真实远程验证，避免在初始化阶段制造外部副作用；只验证其保护条件和 dry-run 行为。

## 非目标

- 不创建具体产品的 Product Spec、Design Brief、开发计划或业务代码。
- 不配置需要用户凭据的 MCP 服务。
- 不把仓库级 Skill 安装进用户全局目录。
- 不为未来假设需求增加抽象层或配置项。
