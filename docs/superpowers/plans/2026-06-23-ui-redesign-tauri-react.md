# UI 重构实施计划：Tauri + React + shadcn/ui

> 依据规格文档：`docs/superpowers/specs/2026-06-23-ui-redesign-tauri-react.md`

## 核心原则

1. **组件优先**：shadcn/ui 有的直接用；没有的查社区组件（如 react-markdown、react-dnd-kit）；只有确实不存在才手写
2. **分层写入**：Rust 后端 / React 前端 / 共享类型 各自独立目录，不混放
3. **渐进迁移**：数据层 → 框架骨架 → 视图组件 → AI流式 → 快捷键 → 清理旧代码

---

## 目录结构

### Rust 后端 `src-tauri/src/`

```
src-tauri/src/
├─ main.rs              # Tauri 入口，注册所有 command
├─ db/
│   ├─ mod.rs           # 连接池、迁移执行
│   └─ migrations.rs    # 嵌入 001_init.sql
├─ models.rs            # Rust struct 映射数据库表
├─ commands/
│   ├─ mod.rs           # command 模块声明
│   ├─ projects.rs      # create/list/delete/switch
│   ├─ outlines.rs      # read/save/status
│   ├─ characters.rs    # CRUD + tier
│   ├─ chapters.rs      # CRUD + sort
│   ├─ contents.rs      # CRUD + stale
│   ├─ settings.rs      # key-value + 预设
│   ├─ style.rs         # 风格配置读写
│   └─ stale.rs         # 级联标记 + 清除
├─ ai/
│   ├─ mod.rs           # 模块声明
│   ├─ client.rs        # reqwest + SSE 流式
│   ├─ context.rs       # 上下文组装（方法论/模板/示例/上游）
│   └─ events.rs        # Tauri Event 发射 ai-chunk
├─ resources/
│   ├─ mod.rs           # 资源文件加载
│   ├─ methodology.rs   # methodology.md 嵌入
│   ├─ templates.rs     # 各阶段模板嵌入
│   ├─ examples.rs      # 各阶段示例嵌入
│   └─ stopwords.rs     # 高频词库嵌入 + 扫描
├─ skills/
│   ├─ mod.rs           # 模块声明
│   ├─ loader.rs        # 扫描 skills 目录
│   └─ executor.rs      # 执行 Skill
└─ lib/
    ├─ style_ref.rs     # 风格参考截断（2000字）
    └─ stopwords.rs     # 高频词扫描标记
```

### React 前端 `src/`

```
src/
├─ App.tsx              # 路由 + 布局根组件
├─ main.tsx             # React 入口挂载
├─ types/
│   ├─ index.ts         # 前端 TypeScript 类型定义
│   └─ tauri.ts         # invoke() 返回类型映射
├─ hooks/
│   ├─ useProjects.ts   # 项目列表状态
│   ├─ useOutline.ts    # 大纲读写
│   ├─ useCharacters.ts # 人物读写
│   ├─ useChapters.ts   # 章节读写
│   ├─ useContent.ts    # 正文读写
│   ├─ useSettings.ts   # 设置/预设
│   ├─ useAI.ts         # AI 流式生成（listen ai-chunk）
│   ├─ useStale.ts      # 过时标记状态
│   ├─ useKeybindings.ts # 全局快捷键
│   └─ useTheme.ts      # 主题切换
├─ lib/
│   ├─ tauri.ts         # invoke/listen 封装
│   ├─ utils.ts         # 通用工具函数
│   └─ cn.ts            # clsx + tailwind-merge
├─ components/
│   ├─ ui/              # shadcn/ui 组件（自动生成）
│   ├─ layout/
│   │   ├─ AppSidebar.tsx    # 左侧 Sidebar（项目+阶段+Skills+状态）
│   │   ├─ EditorHeader.tsx  # 编辑区顶部标题栏
│   │   └─ ActionBar.tsx     # [AI生成] [模型▼] [保存]
│   ├─ shared/
│   │   ├─ StaleAlert.tsx    # 黄色过时提示条
│   │   ├─ ConnectionStatus.tsx # 模型名+连接灯
│   │   ├─ StageNav.tsx      # 阶段导航项（图标+名称+状态符号）
│   │   └─ ProgressOverlay.tsx # AI生成进度
│   └─ markdown/
│      ├─ MarkdownEditor.tsx # 可编辑 Markdown（react-markdown + remark-gfm）
│      └─ MarkdownPreview.tsx # 只读渲染
├─ views/
│   ├─ SetupWizard.tsx   # V1 配置向导
│   ├─ ProjectList.tsx   # V2 项目列表
│   ├─ OutlineEditor.tsx # V3a 大纲编辑
│   ├─ CharacterEditor.tsx # V3b 人物编辑
│   ├─ ChapterEditor.tsx   # V3c 章节目录
│   ├─ ContentEditor.tsx   # V3d 正文编辑
│   └─ Settings.tsx        # V4 设置
└─ styles/
    ├─ globals.css        # CSS 变量（暗色/亮色令牌）
    └─ theme.ts           # 主题常量定义
```

---

## Phase 1：Tauri + React 项目初始化

**目标**：空项目可启动，Tauri窗口显示React空白页。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 1.1 | `pnpm create tauri-app` 初始化项目，选 React + TypeScript | `src-tauri/`, `src/` | `pnpm tauri dev` 启动窗口 |
| 1.2 | 安装前端依赖：react, tailwindcss v4, lucide-react | `package.json` | `pnpm install` 无错误 |
| 1.3 | 配置 TailwindCSS v4 + CSS变量主题 | `src/styles/globals.css`, `tailwind.config.ts` | 暗色令牌生效 |
| 1.4 | `pnpm dlx shadcn@latest init` 初始化 shadcn/ui | `components.json` | shadcn 配置就绪 |
| 1.5 | 安装关键 shadcn 组件 | `src/components/ui/` | Sidebar, Card, Button, Input, Textarea, Select, Dialog, Alert, Collapsible, Tabs, DropdownMenu, Progress 全部就绪 |

### 依赖

```json
{
  "react": "^19",
  "react-dom": "^19",
  "@tauri-apps/api": "^2",
  "@tauri-apps/plugin-shell": "^2",
  "tailwindcss": "^4",
  "lucide-react": "latest",
  "clsx": "latest",
  "tailwind-merge": "latest"
}
```

社区组件（后续 Phase 按需安装）：
- `react-markdown` + `remark-gfm` — Markdown 渲染
- `@dnd-kit/core` + `@dnd-kit/sortable` — 章节拖拽排序
- `tiptap` 或 `@uiw/react-md-editor` — Markdown 可编辑

### 验证命令

```bash
pnpm install
pnpm tauri dev           # Tauri窗口可见空白React页
pnpm dlx shadcn@latest add button   # 组件安装无错误
```

### 门禁

- [ ] Tauri 窗口启动无错误
- [ ] React 页面渲染
- [ ] TailwindCSS 暗色令牌生效
- [ ] shadcn/ui 组件安装就绪

---

## Phase 2：Rust 数据层

**目标**：所有数据库操作通过 Tauri Command 完成，前端 invoke() 可调用。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 2.1 | 实现 db 模块：连接池 + 迁移执行 | `src-tauri/src/db/mod.rs`, `migrations.rs` | 启动时自动建表 |
| 2.2 | 定义 Rust models（映射数据库 8 张表） | `src-tauri/src/models.rs` | struct 字段与 001_init.sql 一致 |
| 2.3 | 实现 projects command（create/list/delete/get） | `src-tauri/src/commands/projects.rs` | invoke 测试通过 |
| 2.4 | 实现 outlines command（read/save/update_status） | `src-tauri/src/commands/outlines.rs` | invoke 测试通过 |
| 2.5 | 实现 characters command（CRUD + tier过滤 + sort） | `src-tauri/src/commands/characters.rs` | invoke 测试通过 |
| 2.6 | 实现 chapters command（CRUD + reorder） | `src-tauri/src/commands/chapters.rs` | invoke 测试通过 |
| 2.7 | 实现 contents command（CRUD + stale标记） | `src-tauri/src/commands/contents.rs` | invoke 测试通过 |
| 2.8 | 实现 settings command（key-value CRUD + preset CRUD） | `src-tauri/src/commands/settings.rs` | invoke 测试通过 |
| 2.9 | 实现 style_configs command（read/save） | `src-tauri/src/commands/style.rs` | invoke 测试通过 |
| 2.10 | 实现 stale command（级联标记 + 查询 + 清除） | `src-tauri/src/commands/stale.rs` | 级联规则与 Design Brief 一致 |
| 2.11 | 在 main.rs 注册所有 command | `src-tauri/src/main.rs` | tauri dev 启动无错误 |
| 2.12 | 前端类型定义（映射 Rust 返回结构） | `src/types/index.ts`, `src/types/tauri.ts` | 类型与 Rust models 对齐 |

### Rust 依赖（Cargo.toml）

```toml
[dependencies]
tauri = { version = "2", features = [] }
rusqlite = { version = "0.31", features = ["bundled"] }
reqwest = { version = "0.12", features = ["stream"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
futures = "0.3"
```

### 验证命令

```bash
cd src-tauri && cargo build   # 编译无错误
pnpm tauri dev                # 启动后 invoke("list_projects") 返回空数组
```

### 门禁

- [ ] 所有 command 编译通过
- [ ] 数据库迁移自动执行
- [ ] 每个 command invoke 返回正确类型
- [ ] stale 级联规则正确

---

## Phase 3：前端布局框架 + 配置向导

**目标**：Sidebar + 编辑区布局可见，配置向导可完成首次 API 配置。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 3.1 | 实现 CSS 变量主题（暗色/亮色完整令牌映射） | `src/styles/globals.css` | 切换主题所有令牌生效 |
| 3.2 | 实现 AppSidebar 组件（项目列表 + 阶段导航 + Skills + 底部状态） | `src/components/layout/AppSidebar.tsx` | Sidebar 结构完整 |
| 3.3 | 实现 App 根布局（Sidebar + 右侧内容区 + 路由） | `src/App.tsx` | 左右分屏可见 |
| 3.4 | 实现路由逻辑：首次启动→配置向导→项目列表 | `src/App.tsx`, `src/hooks/useSettings.ts` | 无预设时自动进入向导 |
| 3.5 | 实现配置向导视图（三步表单 + 连接测试） | `src/views/SetupWizard.tsx` | 三步可完成，测试连接成功/失败 |
| 3.6 | 实现 ConnectionStatus 组件（模型名 + 连接灯） | `src/components/shared/ConnectionStatus.tsx` | 状态灯显示 |
| 3.7 | 实现 useTheme hook + 主题切换 | `src/hooks/useTheme.ts` | Ctrl+T 切换暗色/亮色 |
| 3.8 | 实现 useKeybindings hook | `src/hooks/useKeybindings.ts` | Ctrl+T 可响应 |

### 组件复用策略

| UI元素 | 使用方式 | 来源 |
|--------|---------|------|
| 侧边栏 | shadcn Sidebar | 直接用 |
| 三步表单 | shadcn Card + Input + Button | 组合 |
| 连接测试按钮 | shadcn Button primary | 直接用 |
| 成功/失败提示 | shadcn Alert | 直接用 |
| 步骤指示 | 自定义文字 "步骤 1/3" | 简单文本，无需组件 |

### 验证命令

```bash
pnpm tauri dev
# 1. 首次启动 → 进入配置向导
# 2. 输入 API 信息 → 测试连接 → 成功跳转项目列表
# 3. Ctrl+T → 主题切换
```

### 门禁

- [ ] Sidebar + 内容区布局正确
- [ ] 配置向导三步可完成
- [ ] 连接测试真实可用
- [ ] 主题切换即时生效

---

## Phase 4：项目管理 + 大纲编辑

**目标**：可创建/删除项目，进入大纲编辑，AI流式生成大纲。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 4.1 | 实现 ProjectList 视图（Welcome Card + 项目列表 + 进度指示） | `src/views/ProjectList.tsx` | 项目列表可见 |
| 4.2 | 实现项目 CRUD（Ctrl+N新建 + Dialog确认删除） | `src/views/ProjectList.tsx`, `src/hooks/useProjects.ts` | 新建/删除可用 |
| 4.3 | 实现 StageNav 组件（四阶段 + 状态符号 ✓/●/◉/○/⚠） | `src/components/shared/StageNav.tsx` | 阶段导航可见 |
| 4.4 | 实现 OutlineEditor 视图（Markdown编辑区 + ActionBar） | `src/views/OutlineEditor.tsx` | 可手动输入大纲 |
| 4.5 | 实现 ActionBar 组件（[AI生成] [模型▼] [Ctrl+S保存]） | `src/components/layout/ActionBar.tsx` | 三按钮可见可交互 |
| 4.6 | 实现 AI 流式生成大纲（invoke + listen ai-chunk） | `src-tauri/src/ai/`, `src/hooks/useAI.ts` | 点击AI生成后内容流式出现 |
| 4.7 | 实现模型预设选择下拉（shadcn Select） | `src/components/layout/ActionBar.tsx` | 可切换模型 |
| 4.8 | 保存大纲到数据库（Ctrl+S → invoke save_outline） | `src/views/OutlineEditor.tsx` | 保存后重启内容仍在 |

### 组件复用策略

| UI元素 | 使用方式 | 来源 |
|--------|---------|------|
| Welcome Card | shadcn Card | 直接用 |
| 新建项目 | 底部弹出 Input + Enter | shadcn Input 组合 |
| 删除确认 | shadcn Dialog | 直接用 |
| 进度指示 | 自定义状态符号组合 | 简单文本 |
| Markdown编辑 | react-markdown 渲染 + Textarea 编辑 | 社区组件 |
| 模型选择 | shadcn Select | 直接用 |

### 验证命令

```bash
pnpm tauri dev
# 1. Ctrl+N → 创建项目 → 进入大纲编辑
# 2. 手动输入 → Ctrl+S → 重启后内容存在
# 3. 点击AI生成 → 流式输出 → 可编辑
# 4. 切换模型 → 重新生成
```

### 门禁

- [ ] 项目 CRUD 全流程
- [ ] 大纲手动+AI生成均可工作
- [ ] 流式输出可见
- [ ] 保存持久化

---

## Phase 5：人物编辑

**目标**：三级层级折叠展示人物，AI基于大纲生成人物。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 5.1 | 实现 CharacterEditor 视图（StaleAlert + 三级折叠） | `src/views/CharacterEditor.tsx` | 三层折叠展开 |
| 5.2 | 实现 StaleAlert 组件 | `src/components/shared/StaleAlert.tsx` | 黄色提示条可见 |
| 5.3 | 三级折叠：shadcn Collapsible × 3（主要/重要/其他） | `src/views/CharacterEditor.tsx` | 每层可折叠 |
| 5.4 | 角色卡片展开编辑（各字段 Input/Textarea） | `src/views/CharacterEditor.tsx` | 展开后可编辑 |
| 5.5 | AI生成人物（注入大纲+模板） | `src-tauri/src/ai/context.rs` | 生成后三级有内容 |
| 5.6 | 人物增删操作 | `src/hooks/useCharacters.ts` | CRUD可用 |
| 5.7 | 阶段准入：大纲空时阻止进入 | `src/views/CharacterEditor.tsx` | 空大纲时提示 |

### 组件复用

| UI元素 | 使用方式 | 来源 |
|--------|---------|------|
| 过时提示条 | shadcn Alert (variant="warning") | 直接用 |
| 三级折叠 | shadcn Collapsible | 直接用 |
| 角色字段编辑 | shadcn Input / Textarea | 直接用 |
| 人物增删 | shadcn Button + Dialog | 直接用 |

### 验证命令

```bash
pnpm tauri dev
# 1. 大纲完成后进入人物
# 2. AI生成 → 三级列表出现
# 3. 展开 → 编辑 → 保存
# 4. 大纲为空时被阻止
```

### 门禁

- [ ] 三级折叠展示正确
- [ ] AI生成基于大纲上下文
- [ ] 阶段准入控制

---

## Phase 6：章节目录 + 正文编辑

**目标**：章节目录可生成/排序/编辑，正文逐章AI生成+流式输出。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 6.1 | 实现 ChapterEditor 视图（StaleAlert + 章节列表） | `src/views/ChapterEditor.tsx` | 章节列表可见 |
| 6.2 | 章节拖拽排序（@dnd-kit/sortable） | `src/views/ChapterEditor.tsx` | 可拖拽重排 |
| 6.3 | AI生成目录（注入大纲+人物+模板） | `src-tauri/src/ai/context.rs` | 生成后列表有章节 |
| 6.4 | 章节增删 + 编辑标题/摘要 | `src/hooks/useChapters.ts` | CRUD可用 |
| 6.5 | 实现 ContentEditor 视图（左章节列表 + 右正文编辑） | `src/views/ContentEditor.tsx` | 选中章节显示正文区 |
| 6.6 | AI生成正文（注入大纲+人物+目录+风格+模板） | `src-tauri/src/ai/context.rs` | 流式输出 |
| 6.7 | 阶段准入：目录空时正文不可进入 | `src/views/ContentEditor.tsx` | 阻止+提示 |
| 6.8 | 高频词标记（下划线+特殊颜色） | `src/views/ContentEditor.tsx` | AI味词可见 |

### 组件复用

| UI元素 | 使用方式 | 来源 |
|--------|---------|------|
| 章节排序 | @dnd-kit/sortable | 社区组件 |
| 正文编辑 | shadcn Textarea 或 tiptap | 组合 |
| 高频词标记 | 自定义 CSS 下划线 | 简单样式 |

### 验证命令

```bash
pnpm tauri dev
# 1. 完成大纲+人物 → 生成目录
# 2. 拖拽调整顺序
# 3. 选中章节 → AI生成正文 → 流式
# 4. 高频词被标记
```

### 门禁

- [ ] 章节 CRUD + 拖拽排序
- [ ] 正文逐章流式生成
- [ ] 高频词标记可见
- [ ] 阶段准入

---

## Phase 7：AI 流式 + Rust 后端完善

**目标**：AI客户端完整，context-builder各阶段注入逻辑验证，Skill系统可用。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 7.1 | 实现 Rust AI client（reqwest + SSE 流式） | `src-tauri/src/ai/client.rs` | 流式返回 chunk |
| 7.2 | 实现 Tauri Event 发射（ai-chunk / ai-done / ai-error） | `src-tauri/src/ai/events.rs` | 前端 listen 可接收 |
| 7.3 | 实现 context-builder（方法论/模板/示例/上游文档按阶段组装） | `src-tauri/src/ai/context.rs` | 各阶段注入正确 |
| 7.4 | 嵌入资源文件（methodology.md + templates + examples + stopwords.json） | `src-tauri/src/resources/` | context-builder 可读取 |
| 7.5 | 实现 Skill 加载器 + 执行器 | `src-tauri/src/skills/` | 润色 Skill 可执行 |
| 7.6 | 前端 useAI hook 完善（流式监听 + 错误处理 + 进度） | `src/hooks/useAI.ts` | 流式生成完整 |
| 7.7 | 风格参考截断 + 人设约束注入 | `src-tauri/src/lib/style_ref.rs`, `src-tauri/src/ai/context.rs` | 正文生成上下文包含风格+人设 |

### 验证命令

```bash
pnpm tauri dev
# 1. AI生成大纲 → 流式完整输出
# 2. AI生成正文 → 上下文含风格参考+人设
# 3. 执行润色 Skill → 正文二次加工
```

### 门禁

- [ ] 流式生成不中断
- [ ] context-builder 各阶段注入正确
- [ ] Skill 加载+执行可用

---

## Phase 8：设置 + 快捷键 + 打磨

**目标**：设置视图完整，快捷键全覆盖，主题完善，整体打磨。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 8.1 | 实现 Settings 视图（Tabs: 模型预设/写作风格/主题/关于） | `src/views/Settings.tsx` | 四个Tab可见 |
| 8.2 | 模型预设管理（新增/编辑/删除） | `src/views/Settings.tsx` | CRUD可用 |
| 8.3 | 写作风格配置（参考文本+字数统计+拟人化参数+高频词表） | `src/views/Settings.tsx` | 配置可保存 |
| 8.4 | 主题切换完善（DropdownMenu暗/亮/系统） | `src/components/layout/AppSidebar.tsx` | 三选项切换 |
| 8.5 | 快捷键全覆盖 | `src/hooks/useKeybindings.ts` | Ctrl+N/S/G/1-4/M/,/T/P 全可用 |
| 8.6 | 端到端功能验证 | 全部 | 大纲→人物→目录→正文→润色→保存全流程 |

### 快捷键清单

| 快捷键 | 功能 |
|--------|------|
| Ctrl+N | 新建项目 |
| Ctrl+S | 保存 |
| Ctrl+G | AI生成 |
| Ctrl+1-4 | 切换阶段 |
| Ctrl+M | 切换模型 |
| Ctrl+, | 打开设置 |
| Ctrl+T | 切换主题 |
| Ctrl+P | 切换项目 |
| Esc | 取消/关闭 |

### 组件复用

| UI元素 | 使用方式 | 来源 |
|--------|---------|------|
| 设置Tabs | shadcn Tabs | 直接用 |
| 预设管理列表 | shadcn Card 列表 + Dialog | 组合 |
| 参数选择 | shadcn Select | 直接用 |
| 主题切换 | shadcn DropdownMenu | 直接用 |
| 字数统计 | 自定义文字 | 简单计算 |

### 验证命令

```bash
pnpm tauri dev
# 1. Ctrl+, → 设置完整可用
# 2. Ctrl+T → 主题即时切换
# 3. 全流程走通无阻断
```

### 门禁

- [ ] 设置所有功能可用
- [ ] 快捷键全覆盖
- [ ] 端到端全流程无阻断

---

## Phase 9：清理旧代码 + 构建验证

**目标**：删除 OpenTUI 相关代码，Tauri 构建可打包 Windows 安装包。

### 任务

| ID | 任务 | 涉及文件 | 完成标准 |
|----|------|---------|---------|
| 9.1 | 删除 src/ui/ 整个目录（旧OpenTUI UI） | `src/ui/` | 目录不存在 |
| 9.2 | 删除 src/main.ts（旧入口） | `src/main.ts` | 文件不存在 |
| 9.3 | 删除旧依赖（@opentui/core, openai SDK） | `package.json` | 无旧依赖 |
| 9.4 | 删除旧 bun:sqlite 代码 | `src/db/index.ts` 等旧文件 | 不存在 |
| 9.5 | 清理 package.json（移除旧脚本） | `package.json` | 只有 tauri 相关脚本 |
| 9.6 | 配置 Tauri 构建参数（窗口大小、图标、包名） | `src-tauri/tauri.conf.json` | 配置正确 |
| 9.7 | Windows 构建测试 | - | `pnpm tauri build` 生成 .msi |

### 验证命令

```bash
pnpm tauri build          # 生成 Windows 安装包
# 安装包可安装、可启动、功能完整
```

### 门禁

- [ ] 旧代码完全清除
- [ ] Windows 安装包可生成
- [ ] 安装后功能完整
- [ ] 两阶段代码审查通过

---

## Spec 映射

| Spec 视图 | Phase | 任务 |
|-----------|-------|------|
| V1 配置向导 | 3 | 3.5 |
| V2 项目列表 | 4 | 4.1-4.2 |
| V3a 大纲编辑 | 4 | 4.4-4.8 |
| V3b 人物编辑 | 5 | 5.1-5.7 |
| V3c 章节目录 | 6 | 6.1-6.4 |
| V3d 正文编辑 | 6 | 6.5-6.8 |
| V4 设置 | 8 | 8.1-8.5 |
| AI流式 | 7 | 7.1-7.7 |
| 旧代码清理 | 9 | 9.1-9.7 |
