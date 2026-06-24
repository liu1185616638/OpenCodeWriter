# DEV-PLAN — OpenCodeWriter

## 技术选型证据

| 选型 | 版本/方案 | 证据 |
|------|----------|------|
| 运行时 | bun >= 1.3.0 | OpenTUI `@opentui/core` 的 engines 要求 |
| UI 框架 | `@opentui/core` 0.4.x | 提供 Box/Text/Input/Textarea/Select/ScrollBox/TabSelect/EditBuffer 等组件，原生 Zig 渲染，支持 themeMode 暗色/亮色切换 |
| 语言 | TypeScript 5.x | OpenTUI 提供 TypeScript 类型定义 |
| 数据库 | bun:sqlite | bun 内置 SQLite 绑定，同步 API，better-sqlite3 在 bun 1.3 下不兼容（ERR_DLOPEN_FAILED），改用 bun:sqlite |
| AI 调用 | OpenAI SDK (`openai`) npm 包 | 官方维护，支持 OpenAI 兼容 API（baseURL 可配置），streaming 支持 |
| 构建 | bun 原生 TypeScript 执行 | 无需编译步骤，`bun src/index.ts` 直接运行 |
| 测试 | bun:test | bun 内置测试框架，零配置 |

## 架构边界

```
src/
├─ main.ts                  # 入口：初始化 Renderer、数据库、路由
├─ db/
│   ├─ index.ts             # SQLite 连接、迁移
│   ├─ models.ts            # 表结构定义（projects, outlines, characters, chapters, contents, settings, model_presets, skills）
│   └─ migrations/          # SQL 迁移文件
├─ ai/
│   ├─ client.ts            # OpenAI 兼容客户端封装（支持多预设切换、streaming）
│   ├─ context-builder.ts   # 文档驱动上下文组装（按阶段注入方法论/模板/示例/上游文档）
│   └─ prompts/             # 各阶段 prompt 模板
├─ resources/               # 内置创作资源
│   ├─ methodology.md       # 创作方法论
│   ├─ templates/           # 各阶段模板
│   │   ├─ outline.md
│   │   ├─ characters.md
│   │   ├─ chapters.md
│   │   └─ content.md
│   ├─ examples/            # 各阶段示例
│   │   ├─ outline.md
│   │   ├─ characters.md
│   │   └─ chapters.md
│   └─ stopwords.json       # AI 味高频词库
├─ skills/                  # Skill 系统
│   ├─ loader.ts            # 扫描并加载 Skill 定义
│   ├─ executor.ts          # 执行 Skill
│   └─ builtin/             # 内置 Skill 定义文件
│       └─ polish.skill.md  # 润色 Skill（可卸载）
├─ services/
│   ├─ project-service.ts   # 项目 CRUD
│   ├─ outline-service.ts   # 大纲读写 + 过时标记
│   ├─ character-service.ts # 人物读写 + 层级管理
│   ├─ chapter-service.ts   # 章节目录读写
│   ├─ content-service.ts   # 正文读写
│   ├─ settings-service.ts  # 设置/模型预设/风格配置
│   └─ stale-tracker.ts     # 过时标记级联计算
├─ ui/
│   ├─ app.ts               # 顶层布局：左右分屏
│   ├─ theme.ts             # 暗色/亮色主题令牌定义
│   ├─ components/          # 可复用 UI 组件
│   │   ├─ panel.ts         # 面板容器
│   │   ├─ status-bar.ts    # 状态栏
│   │   ├─ action-bar.ts    # 操作栏（AI生成/模型选择/保存）
│   │   ├─ alert-bar.ts     # 提示条（过时/错误）
│   │   ├─ confirm-modal.ts # 确认模态框
│   │   └─ progress.ts      # 进度显示
│   ├─ views/
│   │   ├─ setup-wizard.ts  # V1 配置向导
│   │   ├─ project-list.ts  # V2 项目列表
│   │   ├─ workspace.ts     # V3 项目工作区（含左面板）
│   │   ├─ outline-editor.ts    # V3a 大纲编辑
│   │   ├─ character-editor.ts  # V3b 人物编辑
│   │   ├─ chapter-editor.ts    # V3c 章节目录
│   │   ├─ content-editor.ts    # V3d 正文编辑
│   │   └─ settings.ts          # V4 设置
│   └─ keybindings.ts       # 全局快捷键注册
└─ lib/
    ├─ stopwatch.ts         # 高频词扫描与标记
    └─ style-reference.ts   # 风格参考文本截断处理
```

### 数据库表结构

```sql
-- 模型预设
CREATE TABLE model_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_base TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 项目
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  current_stage TEXT DEFAULT 'outline',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 大纲
CREATE TABLE outlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  status TEXT DEFAULT 'empty',  -- empty/draft/completed
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 人物
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,           -- main/supporting/minor
  identity TEXT DEFAULT '',
  appearance TEXT DEFAULT '',
  personality TEXT DEFAULT '',
  motivation TEXT DEFAULT '',
  relationships TEXT DEFAULT '',
  key_events TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 章节目录
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 正文
CREATE TABLE contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  stale INTEGER DEFAULT 0,      -- 0=正常, 1=过时
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 过时标记
CREATE TABLE stale_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,     -- characters/chapters/contents
  target_id INTEGER,             -- NULL 表示整个类型全部过时
  source_type TEXT NOT NULL,     -- outline/characters/chapters
  created_at TEXT DEFAULT (datetime('now'))
);

-- 写作风格配置（每项目）
CREATE TABLE style_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  reference_text TEXT DEFAULT '',
  narrative_voice TEXT DEFAULT 'third_person',
  formality TEXT DEFAULT 'moderate',
  emotion_intensity TEXT DEFAULT 'moderate',
  custom_stopwords TEXT DEFAULT '[]',  -- JSON 数组
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 全局设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## 阶段依赖

```
Phase 0: 项目脚手架
  ↓
Phase 1: 数据层 + AI 客户端
  ↓
Phase 2: 基础 UI 框架 + 配置向导
  ↓
Phase 3: 项目管理 + 大纲编辑
  ↓
Phase 4: 人物编辑
  ↓
Phase 5: 章节目录 + 正文编辑
  ↓
Phase 6: 过时标记系统
  ↓
Phase 7: 写作风格 + 去 AI 味机制
  ↓
Phase 8: Skills 系统
  ↓
Phase 9: 设置 + 主题切换 + 打磨
```

## Phase 0：项目脚手架

**目标**：可运行的空项目，验证 OpenTUI + bun + SQLite 集成。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 0.1 | 初始化 bun 项目，安装依赖 | `package.json`, `bun.lock` | `bun install` 无错误 |
| 0.2 | 创建入口文件，初始化 OpenTUI Renderer 显示空白窗口 | `src/main.ts` | `bun run src/main.ts` 启动 TUI 界面 |
| 0.3 | 验证 better-sqlite3 在 bun 下可运行 | `src/db/index.ts` | 创建内存 SQLite 连接，建表查询无错误 |
| 0.4 | 创建项目目录结构（所有空文件占位） | `src/**` | 目录结构完整，TypeScript 无导入错误 |

### 依赖

```json
{
  "@opentui/core": "^0.4.0",
  "openai": "^4.0.0"
}
```

> 注：better-sqlite3 在 bun 下不兼容，改用 `bun:sqlite`（bun 内置，无需安装）。

### 验证命令

```bash
bun install
bun run src/main.ts    # 启动 TUI 空白窗口
bun test               # 空测试套件通过
```

### 门禁

- [x] 编译/启动无错误
- [x] TUI 空白窗口可见
- [x] SQLite 连接测试通过（bun:sqlite 替代 better-sqlite3）
- [ ] 两阶段代码审查通过

---

## Phase 1：数据层 + AI 客户端

**目标**：数据库迁移完整，所有 service 层可 CRUD，AI 客户端可调通 OpenAI 兼容 API。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 1.1 | 编写数据库迁移（全部建表 SQL） | `src/db/migrations/001_init.sql`, `src/db/index.ts` | 迁移执行后所有表存在 |
| 1.2 | 实现 project-service（创建/列表/删除/切换） | `src/services/project-service.ts` | 单元测试覆盖 CRUD |
| 1.3 | 实现 outline-service（读取/保存/状态更新） | `src/services/outline-service.ts` | 单元测试通过 |
| 1.4 | 实现 character-service（CRUD + tier 层级） | `src/services/character-service.ts` | 单元测试通过 |
| 1.5 | 实现 chapter-service（CRUD + 排序） | `src/services/chapter-service.ts` | 单元测试通过 |
| 1.6 | 实现 content-service（CRUD + stale 字段） | `src/services/content-service.ts` | 单元测试通过 |
| 1.7 | 实现 settings-service（key-value + 模型预设 CRUD） | `src/services/settings-service.ts` | 单元测试通过 |
| 1.8 | 实现 AI 客户端封装（支持多预设、baseURL 配置、streaming） | `src/ai/client.ts` | 可用测试 API Key 调通，流式返回可读 |
| 1.9 | 实现 context-builder（按阶段组装上下文字符串） | `src/ai/context-builder.ts` | 单元测试：验证各阶段注入了正确的上下文组件 |

### 验证命令

```bash
bun test               # 所有 service + AI 客户端测试通过
```

### 门禁

- [x] 所有 service 单元测试通过（39 tests, 81 assertions）
- [ ] AI 客户端 streaming 调用实测通过（需真实 API Key，Phase 2 配置向导后验证）
- [x] context-builder 各阶段注入逻辑验证
- [ ] 两阶段代码审查通过

---

## Phase 2：基础 UI 框架 + 配置向导

**目标**：左右分屏布局可见，主题令牌生效，配置向导可完成首次配置。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 2.1 | 定义暗色/亮色主题令牌 | `src/ui/theme.ts` | 两种主题的令牌值与 Design Brief 一致 |
| 2.2 | 实现顶层 App 布局（左面板 25% + 右面板 75%） | `src/ui/app.ts` | 启动后可见左右分屏 |
| 2.3 | 实现左面板基础结构（项目列表区 + 阶段导航区 + 底部状态栏） | `src/ui/app.ts` | 左面板三个区域可见 |
| 2.4 | 实现配置向导视图（三步表单：API地址/Key/模型名 + 连接测试） | `src/ui/views/setup-wizard.ts` | 输入 API 信息后可测试连接 |
| 2.5 | 实现路由逻辑：首次启动→配置向导→项目列表 | `src/main.ts` | 无配置时自动进入向导，完成后进入项目列表 |
| 2.6 | 注册全局快捷键框架 | `src/ui/keybindings.ts` | Ctrl+T 可切换主题 |

### 验证命令

```bash
bun run src/main.ts    # 启动后可见分屏布局
# 首次启动进入配置向导
# Ctrl+T 切换暗色/亮色主题
```

### 门禁

- [ ] 分屏布局正确渲染
- [ ] 配置向导三步可完成，API 连接测试可用
- [ ] 主题切换即时生效
- [ ] 两阶段代码审查通过

---

## Phase 3：项目管理 + 大纲编辑

**目标**：可创建项目、进入大纲编辑区、AI 生成大纲并手动编辑。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 3.1 | 实现项目列表视图（列表展示 + Ctrl+N 新建 + 删除确认） | `src/ui/views/project-list.ts` | 创建/删除项目可见 |
| 3.2 | 实现左面板创作阶段导航（四阶段 + 状态图标） | `src/ui/app.ts` | 四阶段节点显示，点击大纲可切换 |
| 3.3 | 实现大纲编辑视图（Textarea 编辑区 + 底部操作栏） | `src/ui/views/outline-editor.ts` | 可手动输入大纲文本 |
| 3.4 | 实现操作栏组件（[AI生成] [模型▼] [保存]） | `src/ui/components/action-bar.ts` | 三个按钮可见可交互 |
| 3.5 | 对接 AI 生成大纲：context-builder 注入方法论+模板+示例，调用 AI，流式输出到编辑区 | `src/ui/views/outline-editor.ts`, `src/ai/context-builder.ts` | 点击 AI 生成后大纲内容流式出现 |
| 3.6 | 实现模型预设选择下拉 | `src/ui/components/action-bar.ts` | 可选择不同预设，生成时使用选中预设 |
| 3.7 | 保存大纲到数据库 | `src/ui/views/outline-editor.ts` | Ctrl+S 保存，重启后内容仍在 |

### 验证命令

```bash
bun run src/main.ts
# 1. 创建项目 → 进入大纲编辑
# 2. 手动输入大纲 → Ctrl+S 保存 → 重启后内容存在
# 3. 点击 [AI生成] → 大纲流式生成 → 可编辑
# 4. 切换模型预设 → 重新生成
```

### 门禁

- [ ] 项目 CRUD 全流程可用
- [ ] 大纲手动编辑+AI 生成均可工作
- [ ] 保存持久化验证
- [ ] 两阶段代码审查通过

---

## Phase 4：人物编辑

**目标**：基于大纲生成人物小传，三级层级折叠展示，可编辑单个人物卡片。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 4.1 | 实现人物编辑视图：三级折叠列表（主要角色/重要配角/其他角色） | `src/ui/views/character-editor.ts` | 三个层级可折叠展开 |
| 4.2 | AI 生成人物：注入大纲+人物模板，AI 输出按层级解析 | `src/ui/views/character-editor.ts`, `src/ai/context-builder.ts` | 生成后三级列表有内容 |
| 4.3 | 实现角色卡片展开编辑（姓名/身份/外貌/性格/动机/关系/事件） | `src/ui/views/character-editor.ts` | 展开角色可逐字段编辑 |
| 4.4 | 人物新增/删除操作 | `src/ui/views/character-editor.ts` | 可手动添加/删除角色 |
| 4.5 | 阶段准入控制：大纲未完成时人物阶段不可进入 | `src/ui/views/character-editor.ts` | 大纲空时点击人物被阻止并提示 |

### 验证命令

```bash
bun run src/main.ts
# 1. 完成大纲后进入人物阶段
# 2. AI 生成 → 三级列表出现
# 3. 展开角色 → 编辑字段 → 保存
# 4. 新增/删除角色
# 5. 大纲为空时点击人物 → 被阻止
```

### 门禁

- [ ] 三级层级展示正确
- [ ] AI 生成基于大纲上下文
- [ ] 阶段准入控制生效
- [ ] 两阶段代码审查通过

---

## Phase 5：章节目录 + 正文编辑

**目标**：可生成章节目录、逐章生成正文、手动编辑。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 5.1 | 实现章节目录视图（列表：序号+标题+摘要预览，可拖拽排序） | `src/ui/views/chapter-editor.ts` | 目录列表可见，可调整顺序 |
| 5.2 | AI 生成章节目录：注入大纲+人物+目录模板 | `src/ai/context-builder.ts` | 生成后列表有章节 |
| 5.3 | 手动增删章节、编辑标题和摘要 | `src/ui/views/chapter-editor.ts` | 可手动管理章节 |
| 5.4 | 实现正文编辑视图（左侧章节列表 + 右侧正文 Textarea） | `src/ui/views/content-editor.ts` | 选中章节显示正文编辑区 |
| 5.5 | AI 生成正文：注入大纲+人物+目录+风格+正文模板，流式输出 | `src/ai/context-builder.ts` | 点击生成后正文流式出现 |
| 5.6 | 切换模型重新生成正文 | `src/ui/views/content-editor.ts` | 换模型后重新生成替换旧内容 |
| 5.7 | 阶段准入控制：目录未完成时正文不可进入 | `src/ui/views/content-editor.ts` | 目录为空时点击正文被阻止 |

### 验证命令

```bash
bun run src/main.ts
# 1. 完成大纲+人物后生成章节目录
# 2. 手动调整章节顺序/增删
# 3. 选中章节 → AI 生成正文 → 流式显示
# 4. 换模型重新生成
# 5. 手动编辑正文 → 保存
```

### 门禁

- [ ] 章节 CRUD + 排序可用
- [ ] 正文逐章生成+流式显示
- [ ] 模型切换重新生成
- [ ] 阶段准入控制
- [ ] 两阶段代码审查通过

---

## Phase 6：过时标记系统

**目标**：上游修改后下游自动标记过时，用户可选择重新生成或标记为最新。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 6.1 | 实现 stale-tracker：大纲修改→标记人物/目录/正文，人物修改→标记目录/正文，目录修改→标记正文 | `src/services/stale-tracker.ts` | 单元测试验证级联规则 |
| 6.2 | 在各编辑视图保存时触发 stale-tracker | 各 editor 文件 | 保存后下游状态变为 ⚠ |
| 6.3 | 左侧面板阶段图标显示 ⚠ 过时标记 | `src/ui/app.ts` | 过时阶段显示 ⚠ 图标 |
| 6.4 | 实现提示条组件（黄色过时提示 + [重新生成] [标记为最新]） | `src/ui/components/alert-bar.ts` | 过时阶段编辑区顶部显示提示条 |
| 6.5 | 重新生成：基于最新上游重新 AI 生成 | 各 editor 文件 | 重新生成后内容更新，标记清除 |
| 6.6 | 标记为最新：清除过时标记，保留当前内容 | 各 editor 文件 | 标记后 ⚠ 消失，内容不变 |

### 验证命令

```bash
bun run src/main.ts
# 1. 完成大纲→人物→目录→正文全流程
# 2. 修改大纲 → 人物/目录/正文显示 ⚠
# 3. 点"标记为最新" → ⚠ 消失
# 4. 修改人物 → 目录/正文显示 ⚠
# 5. 点"重新生成" → 内容更新
```

### 门禁

- [ ] 级联规则与 Design Brief 一致
- [ ] 提示条和图标正确显示
- [ ] 重新生成/标记为最新均可工作
- [ ] 两阶段代码审查通过

---

## Phase 7：写作风格 + 去 AI 味机制

**目标**：风格参考文本注入、高频词扫描标记、人设约束注入。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 7.1 | 实现 style-reference 截断处理（2000 字上限 + 字数统计） | `src/lib/style-reference.ts` | 超长文本截断，返回截断提示 |
| 7.2 | context-builder 集成风格参考注入（正文和润色阶段） | `src/ai/context-builder.ts` | 正文生成时上下文包含风格参考 |
| 7.3 | 实现 AI 味高频词库加载 + 扫描标记 | `src/lib/stopwords.ts`, `src/resources/stopwords.json` | 扫描文本返回高频词位置和替换建议 |
| 7.4 | 正文编辑区高频词可视化标记（下划线 + hover 替换建议） | `src/ui/views/content-editor.ts` | 生成后高频词可见标记 |
| 7.5 | context-builder 集成人设约束注入：正文生成时自动注入该章出场人物人设卡片 | `src/ai/context-builder.ts` | prompt 中包含人设约束 |
| 7.6 | 创建内置资源文件（方法论/模板/示例/高频词库） | `src/resources/**` | 所有资源文件存在，context-builder 可读取 |

### 验证命令

```bash
bun run src/main.ts
# 1. 配置风格参考文本（超 2000 字验证截断）
# 2. 生成正文 → 上下文包含风格参考+人设约束
# 3. 高频词在正文中被标记
# 4. 上下文包含内置方法论/模板/示例
```

### 门禁

- [ ] 风格参考注入验证
- [ ] 高频词扫描标记可见
- [ ] 人设约束注入验证
- [ ] 内置资源完整性
- [ ] 两阶段代码审查通过

---

## Phase 8：Skills 系统

**目标**：可加载预定义 Skill 并执行，润色 Skill 可安装和执行。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 8.1 | 定义 Skill 文件格式（.skill.md：名称/描述/适用阶段/prompt 模板） | `src/skills/loader.ts` | 格式文档明确 |
| 8.2 | 实现 Skill 加载器（启动时扫描 skills/ 目录，解析 .skill.md） | `src/skills/loader.ts` | 格式错误的 Skill 跳过并日志记录 |
| 8.3 | 实现 Skill 执行器（按定义注入上下文+调用 AI，结果写入编辑区） | `src/skills/executor.ts` | Skill 执行后结果可观察 |
| 8.4 | 左侧面板显示当前阶段可用 Skill 列表 | `src/ui/app.ts` | Skills 区域显示可用 Skill |
| 8.5 | 创建润色 Skill 定义文件 | `src/skills/builtin/polish.skill.md` | 文件格式合法，可被加载执行 |
| 8.6 | 编写 Skill 使用文档 | `docs/skills.md` | 用户可按文档创建自定义 Skill |

### 验证命令

```bash
bun run src/main.ts
# 1. Skills 列表在左面板显示
# 2. 执行润色 Skill → 正文被二次加工
# 3. 删除润色 Skill 文件 → 重启后列表无润色 Skill
```

### 门禁

- [ ] Skill 加载+执行+结果显示
- [ ] 格式错误时优雅降级
- [ ] 润色 Skill 完整可用
- [ ] 两阶段代码审查通过

---

## Phase 9：设置 + 主题切换 + 打磨

**目标**：设置视图完整，主题切换完善，整体打磨。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 9.1 | 实现设置视图（模型预设管理 + 写作风格配置 + 主题切换 + 关于） | `src/ui/views/settings.ts` | 所有设置项可查看编辑 |
| 9.2 | 模型预设 CRUD 在设置中可用 | `src/ui/views/settings.ts` | 新增/编辑/删除预设 |
| 9.3 | 写作风格配置界面（参考文本编辑+字数统计+拟人化参数+高频词表编辑） | `src/ui/views/settings.ts` | 配置可保存生效 |
| 9.4 | 完善快捷键覆盖所有高频操作 | `src/ui/keybindings.ts` | 所有 Design Brief 定义的快捷键可用 |
| 9.5 | 最小终端尺寸检查（120×30） | `src/main.ts` | 小于此尺寸拒绝启动并提示 |
| 9.6 | 全面功能验证：端到端走通大纲→人物→目录→正文全流程 | 全部 | 完整流程无阻断 |
| 9.7 | 性能检查：大数据量（100+ 章节）下响应时间 | - | 列表滚动流畅，AI 生成不卡 UI |

### 验证命令

```bash
bun run src/main.ts
# 1. Ctrl+, 打开设置 → 配置模型/风格/主题
# 2. Ctrl+T 切换主题 → 暗色/亮色即时生效
# 3. 全流程：配置→创建项目→大纲→人物→目录→正文→润色→保存
# 4. 缩小终端至 119×29 → 提示尺寸不足
```

### 门禁

- [ ] 设置视图所有功能可用
- [ ] 快捷键全覆盖
- [ ] 端到端全流程无阻断
- [ ] 两阶段代码审查通过
- [ ] 最终功能验证通过

---

## Spec 映射

| Spec ID | Phase | 任务 |
|---------|-------|------|
| F1 项目管理 | 3 | 3.1 |
| F2 大纲编写 | 3 | 3.3, 3.5, 3.7 |
| F3 人物小传 | 4 | 4.1–4.5 |
| F4 章节目录 | 5 | 5.1–5.3 |
| F5 正文生成 | 5 | 5.4–5.7 |
| F6 Skills 系统 | 8 | 8.1–8.6 |
| F7 写作风格配置 | 7, 9 | 7.1–7.2, 9.3 |
| F8 文档驱动上下文 | 1, 7 | 1.9, 7.2, 7.5, 7.6 |
| F9 过时标记 | 6 | 6.1–6.6 |
| F10 AI 模型配置 | 2, 9 | 2.4, 9.2 |
| F11 内置创作资源 | 7 | 7.6 |
| F12 去 AI 味机制 | 7, 8 | 7.2–7.5, 8.5 |

## 测试策略

| 层级 | 工具 | 覆盖范围 |
|------|------|---------|
| 单元测试 | bun:test | 所有 service、lib、AI 客户端、context-builder |
| 集成测试 | bun:test | 数据库迁移 + service 端到端 |
| 功能验证 | 手动 | TUI 界面交互、AI 生成流式输出、主题切换 |

每个 Phase 完成后运行：

```bash
bun test               # 自动化测试全通过
bun run src/main.ts    # 手动功能验证
```
