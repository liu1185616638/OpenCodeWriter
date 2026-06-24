# UI 重构设计规格：Tauri + React + shadcn/ui

## 概述

将 OpenCodeWriter 从 OpenTUI（终端 TUI）架构迁移到 Tauri + React + shadcn/ui 桌面应用架构，以还原 Pencil 设计稿的视觉效果。

## 技术栈

| 层 | 技术 | 版本 | 说明 |
|---|------|------|------|
| 桌面壳 | Tauri | v2 | Rust 后端，系统 WebView，包体 ~10MB |
| 前端框架 | React | 19 | SPA，响应式布局 |
| UI 组件 | shadcn/ui | 最新 | Button/Card/Input/Select/Sidebar/Tabs/Dialog 等 |
| 样式 | TailwindCSS | v4 | CSS 变量映射 Design Brief 视觉令牌 |
| 图标 | Lucide React | 最新 | 与 Pencil 设计稿图标一致 |
| 包管理 | pnpm | 最新 | 前端依赖管理 |
| 数据库 | SQLite | 通过 Tauri Rust 侧 | bun:sqlite 迁移到 Rust rusqlite |
| AI 调用 | Tauri HTTP | 通过 Tauri Rust 侧 | OpenAI 兼容 API，流式 SSE |
| 状态管理 | React State + Tauri Commands | — | 前端 UI 状态，后端数据/AI 操作 |

## 架构

### 当前架构（废弃）

```
单进程 bun → TypeScript 代码 → OpenTUI 终端渲染
                → bun:sqlite 直接操作
                → openai SDK 调用
```

### 新架构

```
Tauri 进程
├── Rust 后端（tauri::command）
│   ├── SQLite 数据操作（rusqlite）
│   ├── AI API 调用（reqwest + SSE 流式）
│   ├── 文件读写（资源文件）
│   └── 迁移管理
└── WebView 前端（React SPA）
    ├── UI 渲染（shadcn/ui 组件）
    ├── 状态管理（React hooks）
    ├── 键盘快捷键
    └── 通过 invoke() 调用 Rust 命令
```

### 前后端通信

所有数据操作通过 Tauri Commands：

```rust
#[tauri::command]
async fn create_project(name: String) -> Result<Project, String> { ... }

#[tauri::command]
async fn list_projects() -> Result<Vec<Project>, String> { ... }

#[tauri::command]
async fn generate_outline(project_id: i64) -> Result<(), String> { ... }
// 流式通过 Tauri Event 发送 chunk
```

前端调用：

```typescript
const project = await invoke<Project>("create_project", { name: "测试" });
await invoke("generate_outline", { projectId: 1 });
// 监听流式事件
listen("ai-chunk", (event) => { ... });
```

## 页面设计

对应 Pencil 设计稿 7 个视图，全部使用 shadcn/ui 组件还原。

### V1 配置向导

居中卡片布局，三步表单。

- 外层：全屏背景 bg-primary，居中容器
- 卡片：shadcn Card，cornerRadius、阴影
- 三步表单：每步聚焦一个 Input（API 地址/API Key/模型名）
- 步骤指示器：文字 "步骤 1/3"
- 按钮：shadcn Button primary（连接测试）+ secondary（上一步）
- 连接成功：绿色提示 → 自动跳转项目列表
- 连接失败：红色 Alert → 重试按钮

### V2 项目列表

左右布局：左侧 Sidebar + 右侧内容区。

- 左侧 Sidebar：Logo + 项目列表（当前高亮 accent 背景）+ 新建按钮
- 右侧：Welcome Card（标题 + 副标题 + 创建按钮）
- 项目项：项目名 + 进度指示（大纲✓ 人物● 目录○ 正文○）
- 创建：底部弹出 Input + Enter 确认
- 删除：shadcn Dialog 确认框

### V3a 大纲编辑（核心工作区）

25:75 分屏：左侧 Sidebar + 右侧编辑区。

**左侧 Sidebar（固定结构）**：
1. Header：Logo + 主题切换按钮
2. 项目列表区：Section Title "项目" + 项目项（当前 accent 高亮）+ 新建按钮
3. 创作阶段区：Section Title "创作阶段" + 四个阶段项（图标+名称+状态符号 ✓/●/◉/○/⚠）
4. Skills 区：Section Title "Skills" + Skill 项列表
5. Footer：当前模型名 + 连接状态指示灯

**右侧编辑区**：
1. Editor Header：阶段标题 + 保存状态提示
2. Editor Area：Markdown 渲染的大纲内容，可编辑
3. Action Bar：[AI 生成大纲] 按钮 + [模型: xxx ▼] 按钮 + [Ctrl+S 保存] 按钮

### V3b 人物编辑

同左侧 + 右侧：
1. 顶部过时提示条（黄色 shadcn Alert）："大纲已修改，人物可能需要更新"
2. 三层级折叠列表：Collapsible 组件，▼ 主要角色/▼ 重要配角/▼ 其他角色
3. 角色卡片：展开后显示各字段（姓名/身份/外貌/性格/动机/关系/事件）
4. 操作栏：[AI 生成人物] + [模型] + [保存]

### V3c 章节目录

同左侧 + 右侧：
1. 顶部过时提示条
2. 章节列表：序号 + 标题 + 摘要预览
3. 选中章节：高亮 + 右侧摘要编辑区
4. 操作栏：[AI 生成目录]

### V3d 正文编辑

同左侧 + 右侧分栏：
1. 顶部过时提示条
2. 左栏（章节列表）：仅标题，可选择
3. 右栏（正文编辑）：Textarea + 流式输出
4. 高频词标记：特殊颜色下划线
5. 操作栏：[AI 生成正文] + [模型] + [保存] + [Skill: 润色]

### V4 设置

覆盖右侧面板：
1. 模型预设：列表 + 新增/编辑/删除
2. 写作风格：Textarea（2000字上限 + 字数统计）+ 拟人化参数 Select + 高频词表
3. 主题切换：暗/亮 Toggle
4. 关于：版本号 + 资源目录路径

## 视觉令牌映射

Pencil 设计稿 CSS 变量 → TailwindCSS shadcn 主题：

### 暗色主题

| 设计稿变量 | TailwindCSS 变量 | 值 | 用途 |
|-----------|-----------------|-----|------|
| $--background | --background | #1a1b26 | 主背景 |
| $--foreground | --foreground | #c0caf5 | 主文字 |
| $--card | --card | #24283b | 卡片背景 |
| $--primary | --primary | #7aa2f7 | 主强调色 |
| $--primary-foreground | --primary-foreground | #1a1b26 | 主强调文字 |
| $--secondary | --secondary | #414868 | 次强调色 |
| $--secondary-foreground | --secondary-foreground | #c0caf5 | 次强调文字 |
| $--muted-foreground | --muted-foreground | #565f89 | 占位符 |
| $--accent | --accent | #414868 | 选中背景 |
| $--accent-foreground | --accent-foreground | #c0caf5 | 选中文字 |
| $--border | --border | #565f89 | 边框 |
| $--input | --input | #565f89 | 输入框边框 |
| $--sidebar | --sidebar | #1a1b26 | 侧边栏背景 |
| $--sidebar-foreground | --sidebar-foreground | #c0caf5 | 侧边栏文字 |
| $--sidebar-accent | --sidebar-accent | #414868 | 侧边栏选中 |
| $--sidebar-accent-foreground | --sidebar-accent-foreground | #c0caf5 | 侧边栏选中文字 |
| $--sidebar-border | --sidebar-border | #565f89 | 侧边栏边框 |
| 自定义 success | --success | #9ece6a | ✓ 完成状态 |
| 自定义 warning | --warning | #e0af68 | ⚠ 过时/警告 |
| 自定义 error | --error | #f7768e | 错误 |
| 自定义 highlight | --highlight | #bb9af7 | 高频词标记 |

### 亮色主题

对应 Design Brief 亮色令牌值。

## 组件对应表

| 设计稿元素 | shadcn/ui 组件 | 说明 |
|-----------|---------------|------|
| 侧边栏 | Sidebar | 项目列表 + 阶段导航 + Skills + 状态 |
| 卡片 | Card | 配置向导、欢迎卡片、角色卡片 |
| 按钮 | Button (primary/secondary/outline/ghost) | AI 生成/保存/模型切换 |
| 输入框 | Input | 配置向导、项目创建 |
| 多行编辑 | Textarea | 大纲编辑、正文编辑、风格参考 |
| 下拉选择 | Select | 模型切换、拟人化参数 |
| 折叠列表 | Collapsible | 三层级人物列表 |
| 确认框 | Dialog | 删除确认 |
| 提示条 | Alert | 过时警告、错误提示 |
| 进度 | Progress | AI 生成进度 |
| 标签切换 | Tabs | 设置视图子项 |
| 主题切换 | DropdownMenu | 侧边栏底部 |

## 键盘快捷键

| 快捷键 | 功能 | 实现方式 |
|--------|------|---------|
| Ctrl+N | 新建项目 | React 全局键盘事件 |
| Ctrl+S | 保存 | React 全局键盘事件 |
| Ctrl+G | AI 生成 | React 全局键盘事件 |
| Ctrl+1-4 | 切换阶段 | React 全局键盘事件 |
| Ctrl+M | 切换模型 | React 全局键盘事件 |
| Ctrl+, | 打开设置 | React 全局键盘事件 |
| Ctrl+T | 切换主题 | React 全局键盘事件 |
| Ctrl+P | 切换项目 | React 全局键盘事件 |
| Esc | 取消/关闭 | React/shadcn 内置 |

## 数据层迁移

TypeScript Service → Rust Tauri Command：

| Service | Rust Command 文件 | 说明 |
|---------|-----------------|------|
| project-service | src-tauri/src/projects.rs | CRUD + 切换 |
| outline-service | src-tauri/src/outlines.rs | 读取/保存/状态 |
| character-service | src-tauri/src/characters.rs | CRUD + tier |
| chapter-service | src-tauri/src/chapters.rs | CRUD + 排序 |
| content-service | src-tauri/src/contents.rs | CRUD + stale |
| settings-service | src-tauri/src/settings.rs | key-value + 预设 |
| stale-tracker | src-tauri/src/stale.rs | 级联标记 |
| ai-client | src-tauri/src/ai.rs | 流式生成 + 事件 |
| context-builder | src-tauri/src/context.rs | 上下文组装 |
| stopwords | src-tauri/src/stopwords.rs | 扫描 + 标记 |

数据库迁移 SQL 保持不变（001_init.sql），Rust 侧用 rusqlite 执行。

## 迁移策略

分阶段逐步替换，保留数据兼容性：

1. 初始化 Tauri + React + shadcn 项目结构
2. 实现 Rust 数据层（迁移 + 所有 Command）
3. 实现前端路由和布局框架
4. 实现各视图组件
5. 实现 AI 流式生成（Tauri Event）
6. 实现快捷键和主题切换
7. 删除旧 OpenTUI 代码

数据目录保持 `~/.opencode-writer/data.db`，新旧版本共享同一数据库。
