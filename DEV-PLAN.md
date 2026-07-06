# DEV-PLAN — OpenCodeWriter

本文是当前仓库后续实现的开发计划。计划基于以下事实源更新：

- `Product-Spec.md`
- `Design-Brief.md`
- `docs/superpowers/plans/2026-06-23-ui-redesign-tauri-react.md`
- `docs/ArchitectsReply/2026-06-29-p0-step-by-step-development-plan.md`
- `docs/ArchitectsReply/2026-07-05-compare-ai-novel-writing-assistant-optimization.md`
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

## 后续开发原则

1. 先完成 `v0.2` 体验地基验收，再扩展长篇创作能力。
2. 每个版本必须能编译、运行，并从用户入口看到结果。
3. 新表通过 `src-tauri/src/db/migrations.rs` 增量迁移，不破坏旧数据。
4. 新 AI 能力必须先在后端命令层定义清楚输入输出，再接前端。
5. 不直接引入 Qdrant、LangGraph、大型 Agent Runtime；优先使用 SQLite 和现有 Tauri 架构做轻量实现。
6. 不做漫画、短剧、复杂生产系统；OpenCodeWriter 保持本地桌面长篇小说写作工具定位。

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

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|----------|----------|
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

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|----------|----------|
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

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|----------|----------|
| 5.1 | 从参考文本提取写法规则 | `src-tauri/src/commands/ai.rs`、`src/views/Settings.tsx` | 用户可从样本文本生成规则并勾选启用 [x] 已实现 |
| 5.2 | 生成、润色、审核上下文注入启用的写法规则 | `src-tauri/src/ai/context.rs` | prompt 包含规则池而不是只包含参考文本 [x] 已实现 |
| 5.3 | 新增任务类型模型路由 | `src-tauri/src/commands/settings.rs` 或 `model_routes.rs`、设置页 | outline/characters/chapters/content/polish/review 可配置主模型和备用模型 [x] 已实现 |
| 5.4 | AI 调用按任务类型选择模型，失败时提示备用模型重试 | `src-tauri/src/commands/ai.rs`、`src/contexts/AIContext.tsx` | 不破坏手动选择模型能力 [x] 已实现 |
| 5.5 | 生成日志面板升级为轻量任务中心 | `generation_logs`、`jobs`、前端任务中心组件 | 可查看历史、错误、重试入口 [x] 已实现 |
| 5.6 | 支持批量章节生成的最小可恢复任务 | `jobs`、`commands/ai.rs`、正文页 | 中断后可看到已完成章节和失败点 [x] 已实现 |

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

## Product Spec 映射

| Product Spec | 当前/后续阶段 |
|--------------|---------------|
| F1 项目管理 | 已有；Phase 1 增加开书定盘创建项目 |
| F2 大纲编写 | 已有；Phase 1 增加方向候选生成初始大纲 |
| F3 人物小传 | 已有；Phase 3 增加关系和状态演变 |
| F4 章节目录 | 已有；Phase 2 升级章节任务单 |
| F5 正文生成 | 已有；Phase 2 增加审核修复闭环 |
| F6 Skills 系统 | 保留现状；后续按实际缺口单独规划 |
| F7 写作风格配置 | 已有；Phase 5 升级写法规则池 |
| F8 文档驱动上下文 | 已有；Phase 1/2/3/4/5 持续扩展上下文源 |
| F9 过时标记 | 已有；Phase 0 核验过时原因和引导 |
| F10 AI 模型配置 | 已有；Phase 5 增加模型路由 |
| F11 内置创作资源 | 已有；后续随写法和知识库扩展 |
| F12 去 AI 味机制 | 已有基础；Phase 5 升级为写法引擎 |

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

## 完成标记规则

- `[ ]` 未开始。
- `[~]` 进行中。
- `[x]` 已完成且有验证证据。

只有在最终回复中列出刚运行的命令和结果摘要后，才允许把门禁标记为 `[x]`。
