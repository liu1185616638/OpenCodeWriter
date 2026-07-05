# 2026-07-05 对比 AI-Novel-Writing-Assistant 的核心功能差距与优化建议

## 用户问题

对比 `https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant.git`，当前项目实现的核心功能还有哪些欠缺？参考上面的 AI-Novel-Writing-Assistant 项目，给出一个优化建议。

## 当前 OpenCodeWriter 最新状态判断

截至本次读取 master 分支，OpenCodeWriter 当前已经具备基础 AI 小说创作闭环：

- 项目管理。
- 大纲生成与编辑。
- 人物生成与编辑。
- 章节目录生成、编辑、排序、润色。
- 正文按章节生成、编辑、润色。
- 模型预设配置与模型列表获取。
- 写作风格配置、参考文本、自定义高频词。
- 过时标记与过时原因查询。
- 内容快照和生成日志表。
- Tauri + SQLite 本地桌面应用形态。

当前主工作区仍然是四阶段：

```text
outline -> characters -> chapters -> content
```

这说明 OpenCodeWriter 的定位更接近“轻量桌面 AI 小说创作工具”，而对标仓库 `AI-Novel-Writing-Assistant` 已经是“长篇小说生产系统 / AI Native Production Engine”。两者差异不只是页面数量，而是产品架构层级不同。

## 对标项目核心能力概括

`AI-Novel-Writing-Assistant` 的 README 中明确定位为：

- Creative Hub。
- 自动导演开书。
- 本书世界上下文。
- 整本生产主链。
- 写法引擎。
- 章节生成、审核、修复、状态回灌。
- 拆书、知识库、RAG。
- 角色资源账本、世界手册。
- 漫画、短剧衍生工坊。
- 模型路由与任务中心。

它的典型流程不是“大纲 -> 人物 -> 目录 -> 正文”，而是：

```text
一句灵感
-> 自动导演方向候选
-> 项目设定
-> 故事宏观规划
-> 本书世界
-> 角色准备
-> 卷战略 / 卷骨架
-> 节奏 / 拆章
-> 章节执行
-> 审核 / 修复 / 状态回灌
-> 整本生产任务
```

## 核心功能差距

### 1. 缺少“自动导演开书”能力

OpenCodeWriter 当前新建项目主要是输入项目名，然后进入大纲阶段。对标项目可以从一句灵感开始，让 AI 自动整理项目设定、书级 framing、生成多个整本方向和标题组，并支持方向不满意时局部重做。

当前缺口：

- 没有“一句话灵感开书”。
- 没有多方向候选。
- 没有书名/卖点/目标读者/前 30 章承诺等开书定盘字段。
- 没有方向确认前的对比、修订、重做机制。

建议做轻量版：

新增 `IdeaToProjectWizard`：

```text
一句灵感
-> AI 生成 3 个方向候选
-> 每个方向包含：标题、题材、卖点、目标读者、核心冲突、前 30 章承诺
-> 用户选择一个方向
-> 自动创建项目并生成初始大纲
```

优先级：P1。

### 2. 缺少“项目设定 / 书级 framing”层

OpenCodeWriter 当前 `projects` 表只有项目名、当前阶段和时间字段。对标项目的 Novel 模型包含大量书级字段：标题、简介、目标读者、卖点、竞品感、前 30 章承诺、写作模式、叙事视角、节奏偏好、情感强度、AI 自由度、章节长度、预计章节数、类型、世界观等。

当前缺口：

- 项目没有题材、标签、目标读者、卖点。
- 没有商业化网文常用的读者承诺字段。
- 没有默认章节长度和预计章节数。
- 没有全书级设定面板。

建议做轻量版：

新增 `project_profiles` 表：

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

在生成大纲、人物、目录、正文时统一注入这组书级上下文。

优先级：P0.5 / P1。

### 3. 缺少“世界观 / 本书世界”模块

OpenCodeWriter 当前只有大纲、人物、章节、正文，没有世界观独立资产。对标项目有世界观、世界手册、本书世界上下文，并且世界、地图、势力图谱可进入章节上下文。

当前缺口：

- 没有世界观生成。
- 没有势力、地点、规则、时间线等结构化数据。
- 正文生成只依赖大纲、人物、章节、上一章和风格配置。
- 没有“本书世界”作为长期上下文资产。

建议做轻量版：

新增一个阶段或设置页：`世界观`。

数据表建议：

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
```

`item_type` 可先支持：

```text
location 地点
faction 势力
rule 规则
history 历史
timeline 时间线
artifact 物件
```

优先级：P1。

### 4. 缺少卷级规划和节奏板

OpenCodeWriter 当前只有章节目录，没有“卷战略 / 卷骨架 / 节奏段 / 章节目标 / 任务单”。对标项目明确把卷战略、卷骨架、节奏板、拆章节分开，适合长篇连载。

当前缺口：

- 章节列表只有标题和摘要。
- 没有卷。
- 没有章节目标、冲突等级、爽点、钩子、伏笔、信息揭示等级。
- 没有当前卷完成度。

建议做轻量版：

先不要做完整卷系统，可以增强 `chapters` 表：

```sql
ALTER TABLE chapters ADD COLUMN goal TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN conflict_level INTEGER DEFAULT 3;
ALTER TABLE chapters ADD COLUMN hook TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN payoff TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN must_avoid TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN target_word_count INTEGER DEFAULT 3000;
```

UI 上把章节摘要编辑升级成“章节任务单”：

```text
章节标题
章节摘要
本章目标
冲突等级
结尾钩子
伏笔/回收
禁止事项
目标字数
```

优先级：P1，且比完整“卷系统”更适合当前项目。

### 5. 缺少章节审核、质量修复和质量评分

OpenCodeWriter 当前有正文生成和润色，但没有生成后的审核、问题定位、修复闭环。对标项目的章节执行链覆盖正文生成、AI 审核、可修复问题处理、质量债务记录、角色状态 / 事实 / 伏笔回灌、下一章入口。

当前缺口：

- 没有质量报告。
- 没有连续性检查。
- 没有人物一致性检查。
- 没有剧情推进检查。
- 没有修复建议和一键修复。
- 没有质量评分。

建议做轻量版：

新增 `ChapterQualityPanel`：

```text
[AI 审核本章]
- 连贯性问题
- 人物口吻问题
- 设定冲突
- 节奏拖沓
- AI 味表达
- 结尾钩子强度
```

数据表：

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

新增 AI 命令：

```rust
review_chapter_content
repair_chapter_content
```

优先级：P1，高收益。

### 6. 缺少状态回灌机制

OpenCodeWriter 当前生成正文时使用大纲、人物、章节、风格、上一章正文。写完一章后，没有把新增事实、人物变化、伏笔、关系进展回灌到结构化资产。

对标项目会把章节结果回灌到角色状态、事实、伏笔、下一章入口等。

当前缺口：

- 人物状态不会随章节推进变化。
- 新出现的人物不会进入待确认区。
- 新事实不会沉淀。
- 伏笔不会记录和提醒回收。
- 下一章生成无法利用本章结构化结论，只能参考上一章全文。

建议做轻量版：

新增 `chapter_aftercare` 命令：正文保存后或用户点击按钮后执行：

```text
提取本章新增事实
提取人物状态变化
提取新人物候选
提取伏笔和待回收事项
生成下一章衔接提示
```

数据表：

```sql
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

优先级：P1 / P2，适合在章节审核之后做。

### 7. 缺少角色库、关系网和角色演变

OpenCodeWriter 当前角色字段较少：name、tier、identity、appearance、personality、motivation、relationships、key_events。对标项目角色模型包含故事功能、阵营、立场、能力、当前状态、目标、外貌细节、角色弧线、关系阶段、时间线、候选角色、角色资源账本等。

当前缺口：

- 角色关系只是文本字段。
- 没有角色关系图。
- 没有角色状态随章节演变。
- 没有基础角色库。
- 没有角色候选确认机制。

建议做轻量版：

第一阶段只加两张表：

```sql
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
```

优先级：P1。

### 8. 缺少知识库 / 拆书 / RAG

OpenCodeWriter 当前没有资料导入、拆书、参考作品分析、向量检索。对标项目有拆书工作台、知识库、RAG、Qdrant、检索 trace、chunk 去重、上下文化分块和重排。

当前缺口：

- 不能导入参考资料。
- 不能拆解参考小说。
- 没有资料召回。
- 长篇生成只能依赖当前数据库字段和上一章正文。

建议做轻量版：

不要一开始接 Qdrant。先做本地 SQLite FTS5 轻量知识库：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
  project_id UNINDEXED,
  title,
  content,
  source_type UNINDEXED,
  source_id UNINDEXED
);
```

支持：

- 粘贴资料。
- 导入 txt/md。
- 自动切 chunk。
- 正文生成前按关键词检索相关 chunk。

优先级：P2。当前阶段不建议直接上完整 RAG。

### 9. 缺少真正的写法引擎

OpenCodeWriter 当前有写作风格配置和高频词过滤。对标项目的写法引擎是可保存、编辑、绑定、试写、复用的长期资产，并参与生成、检测、修正链路。

当前缺口：

- 参考文本只作为一段提示注入。
- 没有从样本文本提取写法特征。
- 没有可启用/禁用的写法规则池。
- 没有每个项目/章节绑定不同写法。
- 没有写法试写和效果对比。

建议做轻量版：

升级 `style_configs`：

```text
参考文本 -> AI 提取写法特征 -> 用户勾选启用 -> 注入生成/润色/审核
```

新增表：

```sql
CREATE TABLE IF NOT EXISTS style_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

优先级：P1。

### 10. 缺少任务中心和可恢复长任务

OpenCodeWriter 当前 AI 调用是单次 invoke + 流式事件。对标项目有 Agent Runtime、任务状态、checkpoint、等待审批、失败恢复、任务中心。

当前缺口：

- 没有后台任务队列。
- 没有任务状态中心。
- 没有 checkpoint 恢复。
- 没有批量章节生成的中断恢复。

建议做轻量版：

先做 `generation_logs` 的 UI 化，不直接上完整任务系统：

```text
生成历史面板
- 阶段
- 模型
- 状态
- 输入/输出字数
- 错误信息
- 重试按钮
```

后续再扩展为 `jobs` 表：

```sql
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

优先级：P1。

### 11. 缺少模型路由

OpenCodeWriter 当前模型是预设列表，用户在页面底部选择当前模型。对标项目支持 OpenAI、DeepSeek、SiliconFlow、xAI 等多提供商，并可按规划、正文、审阅、拆书等任务拆开路由。

当前缺口：

- 没有按任务设置默认模型。
- 没有备用模型。
- 没有失败自动切换。
- 没有限速、重试和模型健康状态。

建议做轻量版：

新增 `model_routes` 表：

```sql
CREATE TABLE IF NOT EXISTS model_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL UNIQUE,
  primary_preset_id INTEGER REFERENCES model_presets(id) ON DELETE SET NULL,
  fallback_preset_id INTEGER REFERENCES model_presets(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

任务类型先支持：

```text
outline
characters
chapters
content
polish
review
```

优先级：P1。

## 不建议短期照搬的能力

以下能力对标项目有，但 OpenCodeWriter 当前不建议短期照搬：

1. 漫画工作台。
2. 短剧改编工作台。
3. 完整 LangGraph Agent Runtime。
4. Qdrant 向量数据库。
5. 大型 Monorepo 架构。
6. 复杂发布站和文档站。
7. 完整自动成书驾驶。

原因：OpenCodeWriter 当前优势是 Tauri 本地桌面轻量工具，如果过早照搬复杂生产系统，会快速抬高实现成本和维护成本。

## 建议的优化主线

不要直接追求“功能数量对齐”，建议把对标项目压缩成 OpenCodeWriter 的三条增强主线：

### 主线 A：从“四步写作”升级为“开书定盘 + 四步写作”

新增：

- 一句话灵感开书。
- 项目设定 / 书级 framing。
- 方向候选和标题候选。
- 开书确认后自动生成初始大纲。

这是最适合当前项目的第一优先级，因为它补的是用户开始写之前最容易卡住的地方。

### 主线 B：从“生成正文”升级为“章节执行闭环”

新增：

- 章节任务单。
- 正文生成。
- AI 审核。
- 一键修复。
- 快照恢复。
- 状态回灌。

这是让工具真正支撑长篇创作的关键。

### 主线 C：从“人物文本字段”升级为“角色与世界资产”

新增：

- 世界观模块。
- 角色关系表。
- 角色状态演变。
- 伏笔和事实记录。
- 生成上下文按当前章节精准注入。

这是解决长篇小说越写越散的关键。

## 推荐迭代路线

### V0.2：先完成当前 P0

继续完成：

- 布局、滚动、自适应。
- AI 生成可控化。
- 自动保存和快照。
- 下一步引导和过时原因。

这是地基，必须先稳。

### V0.3：开书定盘版本

新增：

- 项目设定页。
- 一句话灵感开书。
- 三套方向候选。
- 标题候选。
- 自动生成初始大纲。

对应对标项目的“自动导演开书”，但做轻量版。

### V0.4：章节执行闭环版本

新增：

- 章节任务单。
- 章节审核。
- 章节修复。
- 质量评分。
- 生成历史面板。

对应对标项目的“章节执行链 + 质量修复”。

### V0.5：世界与角色资产版本

新增：

- 世界观模块。
- 角色关系网。
- 角色状态演变。
- 故事事实。
- 伏笔账本。

对应对标项目的“本书世界 + 角色资源账本 + 状态回灌”。

### V0.6：轻量知识库版本

新增：

- 本地资料导入。
- SQLite FTS 检索。
- 生成上下文召回。
- 简单拆书分析。

对应对标项目的“知识库 / RAG / 拆书”，但不直接引入 Qdrant。

## 最终建议

对 OpenCodeWriter 来说，最值得参考的不是对标项目的漫画、短剧、复杂 Agent，而是它的三个核心产品判断：

1. 长篇小说需要“开书定盘”，不能直接从大纲开始。
2. 长篇小说需要“章节执行闭环”，不能只生成正文。
3. 长篇小说需要“状态回灌”，不能让人物、世界、伏笔停留在静态文本里。

因此，当前项目后续最优路线是：

```text
先完成 P0 体验地基
-> 做轻量自动导演开书
-> 做章节审核修复闭环
-> 做世界观与角色状态资产
-> 最后再做知识库/RAG
```

这样既能吸收 AI-Novel-Writing-Assistant 的核心价值，又不会让 OpenCodeWriter 过早变成复杂难维护的大系统。
