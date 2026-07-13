# DEV-PLAN — OpenCodeWriter

本文是当前仓库后续实现的开发计划。计划基于以下事实源更新：

- `Product-Spec.md`
- `Design-Brief.md`
- `docs/superpowers/plans/2026-06-23-ui-redesign-tauri-react.md`
- `docs/ArchitectsReply/2026-06-29-p0-step-by-step-development-plan.md`
- `docs/ArchitectsReply/2026-07-05-compare-ai-novel-writing-assistant-optimization.md`
- `docs/ArchitectsReply/2026-07-06-opencode-ai-sdk-fit-analysis.md`
- `docs/ArchitectsReply/2026-07-06-ai-runtime-abstraction-and-opencode-reuse-plan.md`
- 当前代码结构、`package.json`、`src-tauri/Cargo.toml`

## 当前技术选型证据

| 层级 | 当前方案 | 证据 |
|------|----------|------|
| 桌面壳 | Tauri 2 | `src-tauri/tauri.conf.json`、`@tauri-apps/api`、`@tauri-apps/cli` |
| 前端 | React 19 + Vite 7 + TypeScript | `package.json`、`src/main.tsx`、`src/App.tsx` |
| UI 组件 | Radix/shadcn 风格组件 + TailwindCSS 4 + lucide-react | `src/components/ui/**`、`src/styles/globals.css`、`components.json` |
| 后端命令层 | Rust Tauri commands | `src-tauri/src/commands/**` |
| 数据库 | SQLite via `rusqlite` bundled | `src-tauri/Cargo.toml`、`src-tauri/src/db/migrations.rs` |
| AI 调用 | Rust `reqwest` + streaming event | `src-tauri/src/ai/client.rs`、`src-tauri/src/commands/ai.rs` |
| 本地资源 | 前后端各自嵌入/读取 methodology、templates、examples、stopwords | `src/resources/**`、`src-tauri/resources/**` |
| 构建命令 | `pnpm build`、`pnpm tauri dev`、`pnpm tauri build` | `package.json`、`tauri.conf.json` |

> 说明：旧计划中 OpenTUI + bun 的描述已经不符合当前仓库。后续实现以当前 React + Tauri 代码为准。

## 当前架构边界

```text
src/
├─ App.tsx                         # 前端路由、工作区状态、阶段切换
├─ main.tsx                        # React 入口
├─ views/                          # 项目列表、设置、四个创作阶段页面
├─ components/
│  ├─ ai/                          # 生成确认、状态、恢复
│  ├─ editor/                      # 工作区布局、操作栏、快照、模型选择
│  ├─ flow/                        # 流程引导
│  ├─ layout/                      # 标题栏、侧栏
│  ├─ shared/                      # 通用滚动、过时提示、流式显示
│  └─ ui/                          # 基础 UI 组件
├─ contexts/AIContext.tsx          # AI 流式状态和生成控制
├─ hooks/                          # 业务 hooks
├─ lib/tauri.ts                    # Tauri invoke/listen 封装
├─ lib/stageProgress.ts            # 阶段进度与下一步提示
└─ types/                          # 前端类型

src-tauri/src/
├─ commands/                       # Tauri 命令：项目、大纲、人物、章节、正文等
├─ ai/                             # AI client、上下文构建、事件发送
├─ db/                             # SQLite 连接和迁移
├─ resources/                      # 内置资源读取
├─ models.rs                       # Rust 数据模型
└─ lib.rs                          # Tauri plugin 入口和命令注册
```

## 已有能力基线

当前仓库已经具备这些基础能力，后续计划不重复从零实现：

- 项目创建、切换、删除。
- 大纲、人物、章节目录、正文四阶段工作区。
- AI 流式生成、取消、错误展示。
- 模型预设配置和模型列表获取。
- 写作风格配置、参考文本、自定义高频词。
- 过时标记、过时原因查询入口。
- 自动保存、内容快照、生成日志表。
- 工作区通用布局、底部操作栏、模型选择、快照面板。
- Tauri + SQLite 本地桌面应用基础。

## 2026-07-06 实现度审计结论

本次审计读取了当前代码结构并刷新 codebase-memory 索引。业务扩展能力已经大量落地，但底层 AI 架构仍停留在旧路径：

```text
commands/ai.rs -> AiClient -> OpenAI-compatible /chat/completions
```

这与 2026-07-06 两份架构文档中“SDK-first 底层 AI 适配层”的方向不一致。后续优先级应从继续堆业务模块切换为：

```text
先统一 AiRuntime
再把现有 AiClient 包装为 OpenAICompatibleRuntime fallback
再接入 Tools / Skills / MCP / SdkBackedRuntime
```

### 实现度总览

| 范围 | 状态 | 证据 | 后续动作 |
|------|------|------|----------|
| Phase 0 v0.2 体验地基 | [~] 基本实现，缺人工端到端验证 | `WorkspacePageLayout`、`GenerationHistoryPanel`、`SnapshotPanel`、`FlowGuide` 等存在；`pnpm build` 通过 | 补 `pnpm tauri dev` 人工回归和两阶段审查 |
| Phase 1 v0.3 开书定盘 | [~] 核心实现完成，缺人工验证 | `profiles.rs`、`ProjectProfileView.tsx`、`IdeaToProjectWizard.tsx`、AI 方向候选命令存在 | 验证一句话开书完整路径、无模型配置失败路径 |
| Phase 2 v0.4 章节执行闭环 | [~] 核心实现完成，缺人工验证 | 章节任务单字段、`chapter_reviews`、`ChapterQualityPanel`、review/repair 命令存在 | 验证审核保存、修复前快照、修复后保存 |
| Phase 3 v0.5 世界与角色资产 | [~] 核心实现完成，缺人工验证 | `world.rs`、`character_assets.rs`、`story.rs`、`AftercarePanel` 存在 | 验证 aftercare 逐条确认后写入，不自动污染资产 |
| Phase 4 v0.6 轻量知识库 | [~] 核心实现完成，缺人工验证 | `knowledge.rs`、`KnowledgeEditor.tsx`、FTS5 表存在 | 验证导入、搜索、正文上下文召回、删除后不召回 |
| Phase 5 v0.7 写法引擎、模型路由与任务中心 | [~] 核心实现完成，缺人工验证 | `style_rules.rs`、`model_routes.rs`、`jobs.rs`、批量生成命令存在 | 验证模型路由 fallback、任务恢复、批量失败保留进度 |
| AI Runtime / SDK-first 底座 | [~] Phase 6-8 已实现，缺人工验证 | `runtime/`、`tasks/`、`tools/`、`skills/` 模块存在；所有 AI 命令已走 Runtime | Phase 9 接入 SDK-backed runtime |

### 当前问题标记

| ID | 严重级别 | 问题 | 证据 | 处理位置 |
|----|----------|------|------|----------|
| ISSUE-RUNTIME-001 | P0 | 已解决：业务 AI 命令已统一走 `AiRuntime`，不再直接创建 `AiClient` | `rg "AiClient::new" src-tauri/src/commands src-tauri/src/ai/tasks` 无结果 | Phase 7 已完成 |
| ISSUE-RUNTIME-002 | P0 | 缺少 SDK-first 能力边界：Tools、Skills、MCP、Thinking、权限策略没有统一抽象 | `tools/registry`、`skills/registry` 已实现（Phase 8）；`mcp` 模块尚未实现 | Phase 9、Phase 10 |
| ISSUE-VERIFY-001 | P1 | 大量任务已标 `[x]`，但缺少 `pnpm tauri dev` 用户入口验证和两阶段审查证据 | 当前计划门禁仍有人工验证/审查未完成 | 每个业务 Phase 回归 |
| ISSUE-BUILD-001 | P2 | 前端构建通过但存在大 chunk 警告 | `pnpm build` 输出主 chunk 约 1,079 kB | 后续性能整理，不阻塞 Runtime |
| ISSUE-BUILD-002 | P2 | `src/lib/tauri.ts` 同时被静态和动态导入，动态导入不会单独分块 | `pnpm build` Vite reporter warning | 后续前端构建优化 |
| ISSUE-RUST-001 | P2 | Rust 编译有未使用字段/函数/常量警告 | `cargo check` 输出 `stream_ended`、`get_route_fallback_preset`、若干 model/resource 未使用 | Runtime 重构或清理阶段处理 |

## 后续开发原则

1. 先完成 `v0.2` 体验地基验收，再扩展长篇创作能力。
2. 每个版本必须能编译、运行，并从用户入口看到结果。
3. 新表通过 `src-tauri/src/db/migrations.rs` 增量迁移，不破坏旧数据。
4. 新 AI 能力必须先在后端命令层定义清楚输入输出，再接前端。
5. 从 Phase 6 起，业务代码不得继续新增直接 `AiClient` 调用；所有新增 AI 能力必须走 `AiRuntime`。
6. SDK / Runtime 负责 AI 操作执行；OpenCodeWriter 负责小说业务流程、数据保存、快照、状态回灌。
7. 不直接引入 Qdrant、LangGraph、大型 Agent Runtime；优先使用 SQLite 和现有 Tauri 架构做轻量实现。
8. 不做漫画、短剧、复杂生产系统；OpenCodeWriter 保持本地桌面长篇小说写作工具定位。

## 阶段依赖

```text
Phase 0: v0.2 体验地基验收与补齐
  ↓
Phase 1: v0.3 开书定盘
  ↓
Phase 2: v0.4 章节执行闭环
  ↓
Phase 3: v0.5 世界与角色资产
  ↓
Phase 4: v0.6 轻量知识库
  ↓
Phase 5: v0.7 写法引擎、模型路由与任务中心
  ↓
Phase 6: v0.8 AiRuntime 抽象与 OpenAI-compatible fallback
  ↓
Phase 7: v0.8.1 迁移现有 AI 命令到 Runtime
  ↓
Phase 8: v0.8.2 BusinessToolRegistry 与 SkillRegistry
  ↓
Phase 9: v0.8.3 Node SDK Adapter / SdkBackedRuntime 接入
  ↓
Phase 10: v0.8.4 MCP、权限审批与内部 fallback 策略
```

---

## Phase 0：v0.2 体验地基验收与补齐

**目标**：确认当前基础功能真的适合长时间使用。只补齐体验地基缺口，不扩展新业务模块。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 0.1 | 核验四阶段页面是否统一使用工作区布局、滚动容器、操作栏 | `src/views/*.tsx`、`src/components/editor/**`、`src/components/shared/**` | 大纲、人物、目录、正文在小窗口下不遮挡、不横向溢出 | [~] 待人工验证 |
| 0.2 | 核验 AI 生成确认、生成状态、失败恢复、取消后保留内容 | `src/contexts/AIContext.tsx`、`src/components/ai/**`、各 editor | 有内容时生成不会直接覆盖；失败可重试或复制错误 | [~] 待人工验证 |
| 0.3 | 核验自动保存和快照恢复 | `src/hooks/useAutosave.ts`、`src/components/editor/SnapshotPanel.tsx`、`src-tauri/src/commands/snapshots.rs` | 大纲和正文自动保存；AI 生成/润色前可恢复快照 | [~] 待人工验证 |
| 0.4 | 核验下一步引导和过时原因 | `src/components/flow/FlowGuide.tsx`、`src/components/shared/StaleAlert.tsx`、`src-tauri/src/commands/stale.rs` | 每阶段能看到下一步；过时提示说明来源 | [~] 待人工验证 |
| 0.5 | 将生成日志 UI 化为基础历史面板 | `src-tauri/src/db/migrations.rs`、`src-tauri/src/commands/generation_logs.rs`、`src/components/ai/GenerationHistoryPanel.tsx` | 可查看最近生成的阶段、模型、状态、错误、输入/输出字数 | [x] 已实现 |
| 0.6 | 做一次端到端回归 | 全部 | 配置模型→创建项目→大纲→人物→章节→正文→润色/快照→重启后数据存在 | [ ] 未开始 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 门禁

- [ ] 四阶段布局和滚动体验通过人工验证。
- [ ] AI 生成可控化通过人工验证。
- [ ] 自动保存、快照、恢复通过人工验证。
- [ ] 下一步引导、过时原因通过人工验证。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 端到端回归验证。

---

## Phase 1：v0.3 开书定盘

**目标**：从“一上来写大纲”升级为“一句话灵感 -> 多方向候选 -> 项目设定 -> 初始大纲”。

### 数据迁移

新增 `project_profiles`：

```sql
CREATE TABLE IF NOT EXISTS project_profiles (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  premise TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  target_audience TEXT DEFAULT '',
  selling_point TEXT DEFAULT '',
  reader_promise TEXT DEFAULT '',
  narrative_pov TEXT DEFAULT 'third_person',
  pace_preference TEXT DEFAULT 'balanced',
  default_chapter_length INTEGER DEFAULT 3000,
  estimated_chapter_count INTEGER DEFAULT 30,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 1.1 | 增加 `project_profiles` 迁移、Rust model、Tauri command | `src-tauri/src/db/migrations.rs`、`models.rs`、`commands/profiles.rs` | 可创建、读取、保存项目设定 | [x] 已实现 |
| 1.2 | 前端类型和 invoke 封装 | `src/types/index.ts`、`src/lib/tauri.ts` | TypeScript 类型与 Rust 返回一致 | [x] 已实现 |
| 1.3 | 新增项目设定页或设置分区 | `src/views/ProjectProfileView.tsx` | 可编辑题材、卖点、目标读者、前 30 章承诺等字段 | [x] 已实现 |
| 1.4 | 新增 `IdeaToProjectWizard` | `src/views/IdeaToProjectWizard.tsx`、`src/views/ProjectList.tsx` | 用户输入一句灵感后可生成 3 个方向候选 | [x] 已实现 |
| 1.5 | 新增 AI 命令：生成方向候选、根据候选创建初始大纲 | `src-tauri/src/commands/ai.rs`、`src-tauri/src/ai/context.rs` | 每个候选包含标题、题材、卖点、目标读者、核心冲突、前 30 章承诺 | [x] 已实现 |
| 1.6 | 将项目设定注入大纲、人物、章节、正文上下文 | `src-tauri/src/ai/context.rs` | AI 请求上下文包含 `project_profiles` 字段 | [x] 已实现 |
| 1.7 | 保存候选选择后自动创建项目、写入设定、生成初始大纲 | `IdeaToProjectWizard.tsx`、`profiles.rs`、`ai.rs` | 新项目进入大纲阶段时已有设定和草稿大纲 | [x] 已实现 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 功能验证

1. 从项目列表点击“一句话开书”。
2. 输入一句灵感。
3. AI 返回 3 个方向候选。
4. 选择一个方向。
5. 自动创建项目、写入项目设定、生成初始大纲。
6. 大纲/人物/章节/正文生成上下文包含项目设定。

### 门禁

- [ ] 项目设定 CRUD 可用。
- [ ] 一句话开书可完整走通。
- [ ] 未配置模型时有明确提示，不创建半成品项目。
- [ ] 新增上下文不破坏旧四阶段生成。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 2：v0.4 章节执行闭环

**目标**：从“生成正文”升级为“章节任务单 -> 正文生成 -> AI 审核 -> 修复 -> 快照恢复”。

### 数据迁移

增强 `chapters`：

```sql
ALTER TABLE chapters ADD COLUMN goal TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN conflict_level INTEGER DEFAULT 3;
ALTER TABLE chapters ADD COLUMN hook TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN payoff TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN must_avoid TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN target_word_count INTEGER DEFAULT 3000;
```

新增 `chapter_reviews`：

```sql
CREATE TABLE IF NOT EXISTS chapter_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  overall_score INTEGER DEFAULT 0,
  continuity_score INTEGER DEFAULT 0,
  character_score INTEGER DEFAULT 0,
  pacing_score INTEGER DEFAULT 0,
  issues_json TEXT DEFAULT '[]',
  suggestions TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 2.1 | 迁移章节任务单字段和审核表 | `src-tauri/src/db/migrations.rs`、`models.rs` | 旧章节数据可正常读取，新字段有默认值 | [x] 已实现 |
| 2.2 | 扩展章节 CRUD | `src-tauri/src/commands/chapters.rs`、`src/hooks/useChapters.ts` | 可保存目标、冲突等级、钩子、伏笔、禁止事项、目标字数 | [x] 已实现 |
| 2.3 | UI 从章节摘要升级为章节任务单 | `src/views/ChapterEditor.tsx`、`src/views/ContentEditor.tsx` | 选中章节可编辑完整任务单 | [x] 已实现 |
| 2.4 | 正文生成上下文注入章节任务单 | `src-tauri/src/ai/context.rs` | prompt 包含本章目标、钩子、禁止事项、目标字数 | [x] 已实现 |
| 2.5 | 新增 AI 审核命令 `review_chapter_content` | `src-tauri/src/commands/ai.rs`、`src-tauri/src/ai/context.rs` | 返回评分、问题列表和修复建议，并保存到 `chapter_reviews` | [x] 已实现 |
| 2.6 | 新增 AI 修复命令 `repair_chapter_content` | 同上 | 修复前创建快照，修复后更新正文 | [x] 已实现 |
| 2.7 | 新增 `ChapterQualityPanel` | `src/components/ai/ChapterQualityPanel.tsx` | 可查看最近审核、评分、问题、建议，并触发修复 | [x] 已实现 |
| 2.8 | 生成历史面板支持审核/修复记录 | `src/components/ai/GenerationHistoryPanel.tsx` | 可区分 generate/review/repair/polish | [x] 已实现 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 功能验证

1. 为章节填写任务单。
2. 生成正文，确认内容遵守任务单。
3. 点击“AI 审核本章”。
4. 看到质量评分和问题列表。
5. 点击“一键修复”，修复前快照可恢复。

### 门禁

- [ ] 章节任务单可编辑、保存、重启后存在。
- [ ] 正文生成使用任务单字段。
- [ ] 审核报告可保存和查看。
- [ ] 修复前有快照，失败不覆盖原文。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 3：v0.5 世界与角色资产

**目标**：从静态大纲/人物文本，升级为可持续回灌的世界、角色、事实、伏笔资产。

### 数据迁移

新增：

```sql
CREATE TABLE IF NOT EXISTS world_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  rules TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS character_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relation_type TEXT DEFAULT '',
  tension TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS character_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  chapter_id INTEGER,
  state_summary TEXT DEFAULT '',
  goal TEXT DEFAULT '',
  emotion TEXT DEFAULT '',
  location TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id INTEGER,
  fact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS foreshadows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  setup_chapter_id INTEGER,
  payoff_chapter_id INTEGER,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'setup',
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 3.1 | 新增世界观、关系、状态、事实、伏笔表和命令 | `src-tauri/src/db/migrations.rs`、`models.rs`、`commands/**` | 每类资产可 CRUD | [x] 已实现 |
| 3.2 | 新增世界观视图 | `src/views`、`src/components/world` | 支持地点、势力、规则、历史、时间线、物件 | [x] 已实现 |
| 3.3 | 人物页增加关系和状态入口 | `src/views/CharacterEditor.tsx`、`src/components/characters` | 可维护角色关系和最新状态 | [x] 已实现 |
| 3.4 | 正文页增加事实/伏笔查看入口 | `src/views/ContentEditor.tsx`、`src/components/story` | 可查看并编辑故事事实、伏笔状态 | [x] 已实现 |
| 3.5 | 新增 AI 命令 `chapter_aftercare` | `src-tauri/src/commands/ai.rs`、`src-tauri/src/ai/context.rs` | 从本章正文提取新增事实、人物状态、新人物候选、伏笔、下一章衔接 | [x] 已实现 |
| 3.6 | 后护理结果需用户确认后写入资产 | 前端 aftercare UI、后端 commands | AI 结果不自动污染资产，用户可逐条接受/忽略 | [x] 已实现 |
| 3.7 | 正文生成上下文注入世界、角色状态、事实、伏笔 | `src-tauri/src/ai/context.rs` | 当前章节生成能看到相关长期资产 | [x] 已实现 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 功能验证

1. 创建世界观条目。
2. 创建角色关系和角色状态。
3. 生成一章正文后执行 `chapter_aftercare`。
4. 逐条确认事实、伏笔、角色状态变化。
5. 下一章生成上下文包含这些资产。

### 门禁

- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [x] 资产 CRUD 不影响旧四阶段。
- [x] 后护理结果必须可审阅后写入。
- [x] 伏笔支持 setup/payoff 状态。
- [x] 生成上下文不会无限膨胀，按当前章节相关性筛选。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 4：v0.6 轻量知识库

**目标**：支持本地资料导入、拆分、全文检索，并在生成前召回相关资料。先做 SQLite FTS5，不引入向量数据库。

### 数据迁移

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
  project_id UNINDEXED,
  title,
  content,
  source_type UNINDEXED,
  source_id UNINDEXED
);
```

如需管理来源，再新增普通表：

```sql
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  raw_content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 4.1 | 新增知识库表和命令 | `src-tauri/src/db/migrations.rs`、`commands/knowledge.rs` | 可新增、删除、搜索资料 | [x] 已实现 |
| 4.2 | 支持粘贴资料和导入 txt/md | 前端知识库视图、Tauri 文件能力 | 可将文本切 chunk 写入 FTS | [x] 已实现 |
| 4.3 | 实现本地 chunk 切分 | `src-tauri/src/commands/knowledge.rs` 或前端工具 | 长文本按段落/长度切分，保留标题 | [x] 已实现 |
| 4.4 | 新增知识库视图 | `src/views`、`src/components/knowledge` | 可查看来源、chunk、搜索结果 | [x] 已实现 |
| 4.5 | 正文生成前按章节任务单和关键词检索相关 chunk | `src-tauri/src/ai/context.rs` | prompt 中包含有限数量的资料片段 | [x] 已实现 |
| 4.6 | 简单拆书分析 | `src-tauri/src/commands/ai.rs` | 对资料生成结构化摘要，可保存为知识条目 | [x] 已实现 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 功能验证

1. 粘贴或导入一份资料。
2. 搜索关键词能命中 chunk。
3. 生成正文时能看到相关资料被注入。
4. 删除资料后不再召回。

### 门禁

- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [x] 不引入外部向量数据库。
- [x] 搜索结果数量受限，避免 prompt 过长。
- [x] 用户能确认哪些资料被注入。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 5：v0.7 写法引擎、模型路由与任务中心

**目标**：把风格参考、模型选择、生成历史升级为可复用的创作资产和可恢复任务入口。

### 数据迁移

```sql
CREATE TABLE IF NOT EXISTS style_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL UNIQUE,
  primary_preset_id INTEGER REFERENCES model_presets(id) ON DELETE SET NULL,
  fallback_preset_id INTEGER REFERENCES model_presets(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  result_json TEXT DEFAULT '{}',
  error TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 5.1 | 从参考文本提取写法规则 | `src-tauri/src/commands/ai.rs`、`src/views/Settings.tsx` | 用户可从样本文本生成规则并勾选启用 | [x] 已实现 |
| 5.2 | 生成、润色、审核上下文注入启用的写法规则 | `src-tauri/src/ai/context.rs` | prompt 包含规则池而不是只包含参考文本 | [x] 已实现 |
| 5.3 | 新增任务类型模型路由 | `src-tauri/src/commands/settings.rs` 或 `model_routes.rs`、设置页 | outline/characters/chapters/content/polish/review 可配置主模型和备用模型 | [x] 已实现 |
| 5.4 | AI 调用按任务类型选择模型，失败时提示备用模型重试 | `src-tauri/src/commands/ai.rs`、`src/contexts/AIContext.tsx` | 不破坏手动选择模型能力 | [x] 已实现 |
| 5.5 | 生成日志面板升级为轻量任务中心 | `generation_logs`、`jobs`、前端任务中心组件 | 可查看历史、错误、重试入口 | [x] 已实现 |
| 5.6 | 支持批量章节生成的最小可恢复任务 | `jobs`、`commands/ai.rs`、正文页 | 中断后可看到已完成章节和失败点 | [x] 已实现 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 门禁

- [x] 写法规则可启用/禁用。
- [x] 模型路由不覆盖用户临时手动选择。
- [x] 任务中心只做轻量恢复，不引入复杂 Agent Runtime。
- [x] 批量任务失败时不丢已生成章节。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 6：v0.8 AiRuntime 抽象与 OpenAI-compatible fallback

**目标**：建立项目内部统一 AI 操作入口。先不改变用户可见功能，只把现有 `AiClient` 包装成 fallback runtime，确保流式输出和现有业务不退化。

### 新增目录

```text
src-tauri/src/ai/runtime/
├─ mod.rs
├─ types.rs
├─ manager.rs
├─ openai_compatible.rs
└─ mock.rs

src-tauri/src/ai/tasks/
├─ mod.rs
├─ service.rs
├─ task_type.rs
└─ request_builder.rs   # Phase 7 创建
```

> Phase 6 只迁移 `generate_outline`，上下文构建仍由 `ContextBuilder` 处理，`request_builder.rs` 延至 Phase 7。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 6.1 | 定义 `AiRequest`、`AiDelta`、`AiRuntime`、`ThinkingPolicy`、`PermissionPolicy` | `src-tauri/src/ai/runtime/types.rs`、`mod.rs` | 类型覆盖 content/thinking/tool/skill/mcp/error/done 事件 | [x] 已实现 |
| 6.2 | 实现 `OpenAICompatibleRuntime` 包装当前 `AiClient` | `runtime/openai_compatible.rs`、`ai/client.rs` | 不改变现有 OpenAI-compatible 流式行为 | [x] 已实现 |
| 6.3 | 实现 `AiRuntimeManager` | `runtime/manager.rs` | 可根据 settings 选择 runtime，默认先为 `openai-compatible` | [x] 已实现 |
| 6.4 | 实现 `MockRuntime` | `runtime/mock.rs` | 可用于无真实模型的单元测试 | [x] 已实现 |
| 6.5 | 新增 Runtime settings | `commands/settings.rs`、`src/lib/tauri.ts`、`src/types/index.ts` | 可保存默认 runtime、fallback runtime、thinking policy、工具审批开关 | [x] 已实现 |
| 6.6 | 只迁移 `generate_outline` 到 Runtime | `commands/ai.rs`、`ai/tasks/**` | 大纲流式生成事件兼容，前端无感知变化 | [x] 已实现 |

### 验证命令

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

### 门禁

- [x] `generate_outline` 不再直接 `AiClient::new`。
- [x] `ai-chunk`、`ai-done`、`ai-error` 事件兼容。
- [x] thinking/content 区分不退化。
- [x] OpenAI-compatible fallback 可用。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [x] `cargo test --lib` 8 个测试全部通过（含 5 个新增）。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 7：v0.8.1 迁移现有 AI 命令到 Runtime

**目标**：所有现有 AI 命令统一走 `AiRuntimeManager`，`commands/ai.rs` 不再直接创建 `AiClient`。

### 迁移范围

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

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 7.1 | 抽出 `AiTaskService` | `src-tauri/src/ai/tasks/service.rs`、`commands/ai.rs` | Tauri command 只做参数接收和调用 service | [x] 已完成 |
| 7.2 | 抽出 request builder | `src-tauri/src/ai/tasks/request_builder.rs`、`ai/context.rs` | 上下文构建仍由业务控制，但统一产出 `AiRequest` | [x] 已完成 |
| 7.3 | 迁移基础生成命令 | `commands/ai.rs`、`ai/tasks/**` | outline/characters/chapters/content 全部走 Runtime | [x] 已完成 |
| 7.4 | 迁移开书、润色、审核、修复、aftercare、知识分析、写法提取 | 同上 | 所有命令不再直接调用 `AiClient` | [x] 已完成 |
| 7.5 | 迁移批量章节生成 | `jobs.rs`、`commands/ai.rs`、`ai/tasks/service.rs` | 批量任务通过 Runtime 执行，失败保留已完成进度 | [x] 已完成 |
| 7.6 | 保留生成日志行为 | `generation_logs`、`ai/tasks/service.rs` | status/input_chars/output_chars/error 与旧行为一致 | [x] 已完成 |

### 门禁

- [x] `rg "AiClient::new" src-tauri/src/commands src-tauri/src/ai/tasks` 无业务命令直连结果。
- [ ] 所有原有 AI 功能可启动。
- [ ] JSON 解析和数据库保存行为不退化。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [ ] 两阶段代码审查通过。

---

## Phase 8：v0.8.2 BusinessToolRegistry 与 SkillRegistry

**目标**：让 Runtime 能受控调用 OpenCodeWriter 内置业务工具和小说 Skills，但业务写入仍由 OpenCodeWriter 控制。

### 新增目录

```text
src-tauri/src/ai/tools/
├─ mod.rs
├─ registry.rs
├─ project_tools.rs
├─ knowledge_tools.rs
├─ world_tools.rs
└─ story_tools.rs

src-tauri/src/ai/skills/
├─ mod.rs
└─ registry.rs
```

### 第一批业务工具

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

### 第一批 Skills

```text
novel_outline_planner
novel_character_builder
novel_content_writer
chapter_review
chapter_repair
aftercare_extractor
style_rule_extractor
knowledge_retriever
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 8.1 | 定义 Tool/Skill 类型和权限模型 | `ai/tools/registry.rs`、`ai/skills/registry.rs` | 工具调用包含名称、参数 schema、权限、审计信息 | [x] 已实现 |
| 8.2 | 实现只读业务工具 | `project_tools.rs`、`knowledge_tools.rs`、`world_tools.rs` | Runtime 可读取项目上下文、世界观、知识库 | [x] 已实现 |
| 8.3 | 实现受控写入工具 | `story_tools.rs`、`snapshots`、`chapters` | 只允许写入快照、审核、事实、伏笔等受控表 | [x] 已实现 |
| 8.4 | 实现 SkillRegistry | `ai/skills/**` | review/repair/aftercare/style extract 可声明为 skill | [x] 已实现 |
| 8.5 | 将章节审核、修复、aftercare 迁移为 Skill 调用 | `ai/tasks/**`、`commands/ai.rs` | 业务层仍负责保存结果，Skill 只负责 AI 执行 | [x] 已实现 |
| 8.6 | 记录 tool_call/tool_result/skill_start/skill_result | `tool_call_logs` 表、`ai/events.rs` | 可审计 Runtime 内部调用 | [x] 已实现 |

### 安全门禁

- [x] 默认禁用 shell。
- [x] 默认禁用任意文件读写。
- [x] 外部工具默认不可用。
- [x] 所有写入工具必须白名单。
- [x] 工具调用有日志。
- [x] `pnpm build` 通过。
- [x] `cargo check` 通过。
- [x] `cargo test --lib` 13 个测试全部通过（含 5 个新增）。
- [ ] 两阶段代码审查通过。
- [ ] `pnpm tauri dev` 功能验证。

---

## Phase 9：v0.8.3 Node SDK Adapter / SdkBackedRuntime 接入

**目标**：以 `AiRuntime` 为边界接入 `@opencode-ai/sdk`。不引入 OpenCode Server，不让小说业务层直接依赖 SDK；SDK 只通过本地 Node SDK Adapter 被调用。

### 唯一路线

采用本地 sidecar/adapter 方式：

```text
Rust/Tauri SdkBackedRuntime
  -> local Node SDK Adapter sidecar
  -> @opencode-ai/sdk
  -> Providers / Tools / Skills / MCP / Thinking
```

不配置、不启动、不兼容外部 OpenCode Server。前端和小说业务代码也不直接调用 `@opencode-ai/sdk`。

说明：`@opencode-ai/sdk` 的 `createOpencode()` 会在 SDK 内部管理自身 client/server 生命周期；这由本地 Node SDK Adapter 封装，不作为 OpenCodeWriter 的额外用户配置服务，也不提供 `createOpencodeClient(baseUrl)` 这类外部 Server 兼容路径。

职责边界：

```text
OpenCodeWriter 业务层：构建小说任务、选择上下文、决定保存/快照/回灌。
SdkBackedRuntime：把 AiRequest 转给本地 SDK Adapter，并把事件转回 AiDelta。
Node SDK Adapter：薄桥接层，只负责调用 @opencode-ai/sdk，不做小说业务判断。
```

### 新增目录

```text
src-tauri/src/ai/runtime/
├─ sdk_backed.rs          # Rust 侧 Runtime，连接本地 adapter
└─ adapter_events.rs      # Adapter event -> AiDelta

sdk-adapter/
├─ package.json
├─ tsconfig.json
└─ src/
   ├─ index.ts            # 本地 adapter 入口
   ├─ protocol.ts         # Rust <-> Adapter JSON-RPC/stdio 协议
   ├─ sdk-client.ts       # @opencode-ai/sdk 调用封装
   └─ event-mapper.ts     # SDK event -> adapter event
```

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 9.1 | 新增本地 Node SDK Adapter 工程 | `sdk-adapter/**`、根构建脚本 | Adapter 可启动，能接收 ping/test 请求 | [x] 已实现，ping 已验证 |
| 9.2 | 定义 Rust 与 Adapter 通信协议 | `sdk-adapter/src/protocol.ts`、`src-tauri/src/ai/runtime/sdk_backed.rs` | 协议覆盖 request、delta、error、done、abort | [x] 已实现 |
| 9.3 | 实现 `SdkBackedRuntime` | `runtime/sdk_backed.rs`、`runtime/manager.rs` | 可把 `AiRequest` 转发给本地 Adapter | [x] 已实现 |
| 9.4 | Adapter 封装 `@opencode-ai/sdk` | `sdk-adapter/src/sdk-client.ts` | SDK 普通生成、流式输出、thinking 事件可映射 | [~] 普通生成封装已编译，真实模型与 token 级事件待验证 |
| 9.5 | 实现事件适配 | `adapter_events.rs`、`ai/events.rs`、`sdk-adapter/src/event-mapper.ts` | SDK/Adapter 事件映射为 `AiDelta` 和现有 Tauri 事件 | [x] 已实现 |
| 9.6 | 首先接入低风险任务 | `analyze_text`、`review_chapter_content` | 可用 SDK-backed runtime 完成分析/审核，不影响正文生成 | [~] Runtime 默认 SDK-backed，待真实模型验证 |
| 9.7 | 将 SDK-backed 作为默认 AI 底座 | `runtime/manager.rs`、`settings.rs`、构建脚本 | AI 命令默认经 `SdkBackedRuntime -> Node SDK Adapter -> @opencode-ai/sdk` 执行；不在设置页暴露 Runtime 选择 | [x] 已实现 |
| 9.8 | 保留 OpenAI-compatible 内部 fallback | `runtime/manager.rs`、`runtime/resilient.rs` | fallback 只作为内部降级/排障路径，不作为普通用户配置项；SDK-backed 启动失败或首帧错误时自动降级 | [x] 已实现 |

### 门禁

- [~] SDK-backed runtime 已成为默认 AI 底座，普通生成待真实模型端到端验证。
- [~] thinking 事件可区分，不进入作品正文；已保留事件映射，待真实 SDK 事件验证。
- [x] SDK 错误映射为统一 `AiDelta::Error`。
- [x] 本地 SDK Adapter 不做小说业务判断，不直接写业务数据库。
- [x] 不新增 OpenCode Server 配置、进程或兼容路径。
- [x] 不在设置页暴露 SDK-backed / OpenAI-compatible Runtime 切换。
- [x] OpenAI-compatible fallback 保留为内部路径，SDK-backed 启动失败或首帧错误时自动降级。
- [x] 两阶段代码审查通过。

### 本轮验证记录

```bash
pnpm install
pnpm --dir sdk-adapter build
'{"type":"ping","id":"manual"}' | node sdk-adapter/dist/index.js --stdio
pnpm build
cd src-tauri && cargo test --lib
cd src-tauri && cargo check
```

结果：Adapter 编译通过；ping 返回 `pong` 和 `done`；`pnpm build` 通过但仍有既有 chunk 警告；`cargo test --lib` 17 个测试通过；`cargo check` 通过但仍有既有 unused/dead_code warning。

### 2026-07-06 调整记录

普通用户不需要理解或选择 Runtime。自本记录起，OpenCodeWriter 的 AI 底座默认固定为 SDK-backed，OpenAI-compatible 只保留为内部 fallback / 排障能力；不得在设置页增加 Runtime 切换 UI。

本次调整验证：

```bash
pnpm build:sdk-adapter
cd src-tauri && cargo test --lib
pnpm build
cd src-tauri && cargo check
```

结果：Adapter 编译通过；`cargo test --lib` 18 个测试通过；`pnpm build` 通过且会先执行 `pnpm build:sdk-adapter`；`cargo check` 通过但仍有既有 unused/dead_code warning。

### 2026-07-06 fallback 策略记录

新增内部 `ResilientRuntime`：`AiRuntimeManager::create` 会把 SDK-backed primary 和 OpenAI-compatible fallback 包装为一个运行时。若 SDK-backed 在启动阶段失败，或首个 runtime 事件就是错误，则自动转入 OpenAI-compatible；若已经向前端输出过内容/工具/思考事件，则不再二次生成，避免同一 session 混合两段输出。

本次调整验证：

```bash
cd src-tauri && cargo test --lib
pnpm build
cd src-tauri && cargo check
```

结果：`cargo test --lib` 20 个测试通过，包含 SDK 启动失败 fallback、首帧错误 fallback；`pnpm build` 通过；`cargo check` 通过但仍有既有 unused/dead_code warning。

---

## Phase 10：v0.8.4 MCP、权限审批与内部 fallback 策略

**目标**：让 SDK-backed Runtime 可安全使用 MCP，并补齐内部 fallback / 降级策略。SDK-backed 已是默认 AI 底座，不再做用户可见 Runtime 切换。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 | 状态 |
|----|------|----------|----------|------|
| 10.1 | 新增 MCP 配置和白名单 | settings、`runtime/mcp.rs`、设置页 | 可配置 MCP server、启用状态、允许工具 | [x] 已实现 |
| 10.2 | 新增 MCP 工具列表读取 | `runtime/mcp.rs` | 可查看可用 MCP 工具 | [x] 已实现 |
| 10.3 | 新增用户审批流 | 前端审批弹窗、`PermissionPolicy` | 外部 MCP 调用默认需要确认 | [x] 已实现 |
| 10.4 | MCP 调用日志 | `generation_logs` 或专用日志表 | 可追踪 mcp_call/mcp_result/error | [x] 已实现 |
| 10.5 | 内部 fallback 策略固化 | `runtime/manager.rs`、`ai/tasks/service.rs` | SDK-backed 失败时按明确策略降级或提示；OpenAI-compatible 不作为普通用户配置项 | [x] 已实现 |

### 当前边界

当前 `@opencode-ai/sdk` 本地类型未暴露明确 MCP server 注入接口，因此本阶段先完成 MCP 配置、白名单、审批弹窗、事件日志和默认禁用策略；`sdk-adapter` 对非空 `mcp_servers` 或 `allow_mcp=true` 会显式报错，不静默执行或绕过审批。后续若 SDK 版本提供稳定 MCP 接入方式，必须先补“请求前审批 -> Adapter 执行 -> mcp_result 审计”的闭环，再允许真实外部 MCP 调用。

### 门禁

- [x] 默认禁用 MCP。
- [x] MCP 写入/危险工具默认不可执行。
- [x] 用户能看到并批准工具调用。
- [x] 出错时可回退 OpenAI-compatible。
- [x] 两阶段代码审查通过。

### 本轮验证记录

```bash
cd src-tauri && cargo test --lib
pnpm build
cd src-tauri && cargo check
pnpm tauri build --debug
rg -n "OpenCode Server|opencode_server_url|get_runtime_settings|save_runtime_settings|RuntimeSettings|ai_runtime_default|ai_runtime_fallback|createOpencodeClient\(" -S src src-tauri sdk-adapter AGENTS.md DEV-PLAN.md
rg -n "TODO|todo|panic!|unwrap\(|expect\(" -S src src-tauri sdk-adapter
```

结果：`cargo test --lib` 22 个测试通过；`pnpm build` 通过并先编译 SDK Adapter；`cargo check` 通过；`pnpm tauri build --debug` 通过并生成 debug MSI / NSIS 包；OpenCode Server / Runtime 切换残留搜索仅命中文档说明，无代码配置入口；SDK Adapter 已对未落地的真实 MCP 执行做显式拒绝，避免静默绕过审批；风险搜索命中既有启动路径 `expect`、OpenAI stream `unwrap` 和若干测试 `unwrap`。仍有既有 Vite chunk 警告和 Rust unused/dead_code warning。

---

## Product Spec 映射

| Product Spec | 当前/后续阶段 |
|--------------|---------------|
| F1 项目管理 | 已有；Phase 1 增加开书定盘创建项目 |
| F2 大纲编写 | 已有；Phase 1 增加方向候选生成初始大纲 |
| F3 人物小传 | 已有；Phase 3 增加关系和状态演变 |
| F4 章节目录 | 已有；Phase 2 升级章节任务单 |
| F5 正文生成 | 已有；Phase 2 增加审核修复闭环 |
| F6 Skills 系统 | 当前仍是业务侧能力；Phase 8 升级为 Runtime 可调用的 SkillRegistry |
| F7 写作风格配置 | 已有；Phase 5 升级写法规则池 |
| F8 文档驱动上下文 | 已有；Phase 6/7 保持由业务层构建 `AiRequest`，不交给 SDK 自主决定 |
| F9 过时标记 | 已有；Phase 0 核验过时原因和引导 |
| F10 AI 模型配置 | 已有；Phase 5 增加模型路由，Phase 6/9/10 增加 Runtime 配置和 fallback |
| F11 内置创作资源 | 已有；后续随写法和知识库扩展 |
| F12 去 AI 味机制 | 已有基础；Phase 5 升级为写法引擎，Phase 8 可沉淀为 Skills |

## 对标建议映射

| 对标缺口 | 计划位置 |
|----------|----------|
| 自动导演开书 | Phase 1 |
| 项目设定/书级 framing | Phase 1 |
| 世界观/本书世界 | Phase 3 |
| 卷级规划和节奏板 | Phase 2 先做章节任务单；完整卷系统暂不做 |
| 章节审核、质量修复 | Phase 2 |
| 状态回灌 | Phase 3 |
| 角色库、关系网、角色演变 | Phase 3 |
| 知识库/拆书/RAG | Phase 4，SQLite FTS5 轻量版 |
| 写法引擎 | Phase 5 |
| 任务中心和可恢复长任务 | Phase 5 轻量版 |
| 模型路由 | Phase 5 |
| SDK-first 底层 AI 适配 | Phase 6-10 |
| Tools / Skills / MCP / Thinking 统一事件 | Phase 8-10 |

## 每阶段统一验证策略

每个 Phase 完成后至少执行：

```bash
pnpm build
cd src-tauri && cargo check
pnpm tauri dev
```

涉及数据库迁移时额外验证：

1. 旧数据库启动不报错。
2. 新表/新字段存在。
3. 旧项目数据仍可读取。
4. 新功能写入后重启仍存在。

涉及 AI 调用时额外验证：

1. 未配置模型时不发起请求，并提示用户配置。
2. API 失败不覆盖旧内容。
3. 生成/审核/修复前后的 `generation_logs` 有记录。
4. 需要覆盖正文或大纲时先创建快照。

涉及 Runtime / SDK-first 改造时额外验证：

1. 业务层不直接依赖 SDK Adapter 内部实现、`@opencode-ai/sdk` 或 `AiClient`。
2. 所有 AI 命令通过 `AiRuntimeManager` 执行。
3. `OpenAICompatibleRuntime` 作为 fallback 可用。
4. thinking/content/tool/skill/mcp/error/done 事件映射稳定。
5. 默认禁用 shell、任意文件读写和未授权 MCP 工具。
6. 业务写入工具只能写入白名单表，并有日志。

## 完成标记规则

- `[ ]` 未开始。
- `[~]` 进行中。
- `[x]` 已完成且有验证证据。

只有在最终回复中列出刚运行的命令和结果摘要后，才允许把门禁标记为 `[x]`。
