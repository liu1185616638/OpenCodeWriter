# Coding Harness 5.0 Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在空仓库中交付可被当前 Codex 发现和解析的完整 Coding Harness 5.0，包括 11 个 Skills、2 个 Sub-Agent、6 个 Hooks、进化系统和主控规则。

**Architecture:** 根 `AGENTS.md` 负责路由和门禁，`.agents/skills` 提供按需加载的验收标准，`.codex/agents` 隔离独立判断，项目级 Hooks 执行确定性检查。外部 Skill 先查同名、再查相似实现；只吸收适配当前职责的内容，缺失部分依据文章与官方资料最小化自建。

**Tech Stack:** Markdown、Agent Skills、YAML、TOML、JSON、PowerShell、POSIX shell、Git、Codex 项目配置。

---

## 文件职责

- `AGENTS.md`：项目级调度、状态路由、执行标准和门禁。
- `.agents/skills/*/SKILL.md`：11 个职责单一的工作流标准。
- `.agents/skills/*/agents/openai.yaml`：Skill UI 元数据。
- `.agents/skills/*/references/*`：需求访谈、设计验收、发布审计等重型资料。
- `.codex/config.toml`：项目级 Agent 深度和 Hook 特性。
- `.codex/agents/*.toml`：审查与进化两个隔离角色。
- `.codex/hooks.json`、`.codex/hooks/*`：事件绑定和跨平台 Hook。
- `.codex/evolution/*`、`.codex/EVOLUTION.md`：信号、建议和确认规则。
- `docs/skill-sources.md`：逐项记录采用、改造或自建来源。

### Task 1：建立 Skill 来源矩阵

**Files:**
- Create: `docs/skill-sources.md`

- [ ] **Step 1: 对 11 个名称做低频 GitHub 精确检索**

运行 `gh search code '<skill-name>' --filename SKILL.md --limit 10`。记录精确命中；遇到限流则记录事实并停止重试。

- [ ] **Step 2: 查找职责相近的一手来源**

重点候选包括 OpenAI `define-goal`、`figma-*`、`notion-spec-to-implementation`、`security-best-practices`，以及 Superpowers 的 planning、debugging、review、release、skill creation 工作流。只读取与目标职责直接相关的文件。

- [ ] **Step 3: 写来源矩阵并验证覆盖**

每项记录 `Skill`、`结果`、`来源 URL`、`采用内容`、`本地调整`。运行名称覆盖检查，预期 11 个名称均存在。许可证不明的代码不直接复制。

### Task 2：初始化并验证 11 个 Skill 骨架

**Files:**
- Create: `.agents/skills/<skill-name>/SKILL.md`
- Create: `.agents/skills/<skill-name>/agents/openai.yaml`

- [ ] **Step 1: 运行存在性检查，确认 11 个目录当前均缺失**

- [ ] **Step 2: 使用官方 `init_skill.py` 初始化每个 Skill**

命令模式：

```powershell
python "$HOME/.codex/skills/.system/skill-creator/scripts/init_skill.py" <skill-name> --path .agents/skills --interface 'display_name=<显示名>' --interface 'short_description=<25-64 字符说明>' --interface 'default_prompt=Use $<skill-name> to <任务>.'
```

不创建未使用的资源目录和示例文件。

- [ ] **Step 3: 对 11 个目录运行 `quick_validate.py`**

预期：全部通过。

### Task 3：实现八个流水线 Skills

**Files:**
- Modify: `.agents/skills/product-spec-builder/SKILL.md`
- Create: `.agents/skills/product-spec-builder/references/interview-guide.md`
- Modify: `.agents/skills/design-brief-builder/SKILL.md`
- Create: `.agents/skills/design-brief-builder/references/design-decisions.md`
- Modify: `.agents/skills/design-maker/SKILL.md`
- Modify: `.agents/skills/dev-planner/SKILL.md`
- Modify: `.agents/skills/dev-builder/SKILL.md`
- Modify: `.agents/skills/bug-fixer/SKILL.md`
- Modify: `.agents/skills/code-review/SKILL.md`
- Modify: `.agents/skills/release-builder/SKILL.md`
- Create: `.agents/skills/release-builder/references/privacy-audit.md`

- [ ] **Step 1: 写内容失败检查**

检查每个 Skill 是否包含输入、原则、产出、验收、停止条件；预期模板状态失败。

- [ ] **Step 2: 实现八个 Skill**

frontmatter 只保留 `name` 与 `description`。正文围绕文章标准：需求地基逐层解锁；形态先于视觉；页面与状态全覆盖；计划按依赖排序且每 Phase 可运行；开发使用真实数据和当场验证；修复最多三个假设且三次失败停下；审查分正确性与质量两阶段；发布从安装产物验证并执行隐私审计。

- [ ] **Step 3: 增加三个必要 reference**

需求访谈问题库、设计决策词汇映射和发布隐私清单分别按需加载，不复制到主文件。

- [ ] **Step 4: 运行 8 个 Skill 校验和占位符扫描**

预期：全部通过，无 `TODO`、`TBD` 或模板文本。

### Task 4：实现三个体系 Skills

**Files:**
- Modify: `.agents/skills/goal-creator/SKILL.md`
- Modify: `.agents/skills/evolution-engine/SKILL.md`
- Modify: `.agents/skills/skill-builder/SKILL.md`

- [ ] **Step 1: 写边界失败检查**

验证 Goal 可证据化且不超过 4000 字符、进化逐条获批、新 Skill 是最后手段；预期模板状态失败。

- [ ] **Step 2: 实现三个 Skill**

`goal-creator` 只生成不发送；`evolution-engine` 只提出可增可退的规则建议；`skill-builder` 先复用或扩展已有 Skill，只有用户同意才创建。

- [ ] **Step 3: 运行 `quick_validate.py` 和占位符扫描**

### Task 5：实现主控与 Sub-Agent

**Files:**
- Create: `AGENTS.md`
- Create: `.codex/config.toml`
- Create: `.codex/agents/code-reviewer.toml`
- Create: `.codex/agents/evolution-runner.toml`

- [ ] **Step 1: 运行 TOML 文件不存在的失败检查**

- [ ] **Step 2: 写 `AGENTS.md`**

包括第一性原则、状态检测、统一规划执行、Skill 路由、文档优先级、Review → Fix、提交发布门禁和进化确认。明确 Sub-Agent 需要主 Agent 显式请求。

- [ ] **Step 3: 写项目配置和两个 Agent**

`config.toml` 只启用 Hooks 并设置 `agents.max_depth = 1`，不固定模型和权限。Agent 均定义 `name`、`description`、`developer_instructions`；审查员只报告，进化执行者只提议。

- [ ] **Step 4: 使用 Python `tomllib` 解析全部 TOML**

预期：无异常。

### Task 6：以测试驱动实现 Hook 与进化状态

**Files:**
- Create: `.codex/hooks.json`
- Create: `.codex/hooks/pre-tool-shell.ps1`
- Create: `.codex/hooks/auto-push.ps1`
- Create: `.codex/hooks/stop-gate.ps1`
- Create: `.codex/hooks/mark-review-needed.ps1`
- Create: `.codex/hooks/detect-feedback-signal.ps1`
- Create: `.codex/hooks/check-evolution.ps1`
- Create: `.codex/hooks/*.sh`
- Create: `.codex/evolution/signals.jsonl`
- Create: `.codex/evolution/proposals.md`
- Create: `.codex/EVOLUTION.md`

- [ ] **Step 1: 为每个 Hook 运行失败样例**

使用临时 Git 仓库和 JSON 输入验证：编译失败阻止 commit；保护分支不推送；待审查阻止 Stop；代码编辑写 review 状态；纠正措辞追加信号；有积压时 SessionStart 提醒。

- [ ] **Step 2: 实现最小 PowerShell Hook**

缺少可选字段时安全退出。状态放 `.codex/.state/`。自动推送支持 `CODEX_HOOK_DRY_RUN=1`，测试不访问远程。

- [ ] **Step 3: 实现等价 POSIX Hook**

保持退出码、状态路径和保护分支规则一致。

- [ ] **Step 4: 写官方事件格式的 `hooks.json`**

使用 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop`、`SessionStart`，提供 `commandWindows`，并从 Git 根解析脚本路径。

- [ ] **Step 5: 运行全部样例直到通过**

预期：正反样例均符合设计，且没有真实 push。

### Task 7：整体验证和提交

**Files:**
- Create: `.gitignore`
- Modify: `docs/skill-sources.md`

- [ ] **Step 1: 解析 JSON、TOML、YAML 并校验 11 个 Skill**

- [ ] **Step 2: 检查 Codex 发现路径和 11 个名称完整性**

- [ ] **Step 3: 扫描真实凭据和无关文件改动**

运行 `rg` 凭据模式和 `git status --short`；预期无真实凭据，只含本次初始化文件。

- [ ] **Step 4: 提交原子变更**

```powershell
git add AGENTS.md .agents .codex .gitignore docs/skill-sources.md docs/superpowers/plans/2026-06-22-coding-harness-initialization.md
git commit -m "feat: initialize Codex coding harness"
```

- [ ] **Step 5: 提交后重新运行全部格式、Skill 和 Hook 测试**

记录命令与实际输出后再声明完成。
