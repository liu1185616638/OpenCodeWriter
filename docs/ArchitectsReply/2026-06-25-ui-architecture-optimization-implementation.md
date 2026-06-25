# UI 架构优化落地记录

日期：2026-06-25

问题主题：继续优化当前页面 UI 架构，重点解决侧栏、滚动条、人物功能区自适应问题。

## 本次已落地改动

本次改动基于 `master` 分支最新代码完成，主要提交了以下方向：

1. 侧栏从整栏隐藏式折叠改为图标栏折叠。
2. 标题栏增加常驻侧栏切换按钮。
3. ScrollArea 组件增强暗色模式滚动条表现。
4. 人物功能区改为响应式布局。
5. 人物字段输入从“是否有换行”判断改为“字段类型 + 内容长度”判断。
6. 增加全局滚动条工具类 `.app-scrollbar`。

---

## 1. 侧栏架构优化

### 修改文件

- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/TitleBar.tsx`
- `src/App.tsx`

### 主要变化

#### 1.1 Sidebar 使用 icon 折叠模式

原来的侧栏没有显式传入 `collapsible`，因此使用 `Sidebar` 默认值 `offcanvas`。点击折叠后会把整个侧栏移出屏幕，导致用户看不到功能切换按钮。

本次改为：

```tsx
<Sidebar collapsible="icon" className="rounded-xl border border-sidebar-border shadow-lg">
```

效果：

- 折叠后保留图标栏。
- 不再整栏消失。
- 功能入口仍可点击。

#### 1.2 Header 防止 Logo 和程序名换行

新增 `SidebarBrand` 组件，核心策略：

- Logo 图标 `shrink-0`。
- 程序名 `min-w-0 truncate whitespace-nowrap`。
- 折叠态隐藏程序名。

这样可以避免 `OpenCodeWriter` 和图标换行。

#### 1.3 导航按钮组件化

新增 `SidebarNavButton` 内部组件：

- 统一图标、文字、右侧状态图标布局。
- icon 折叠态自动隐藏文字和状态图标。
- 使用 `title` 保留折叠态 hover 提示。

#### 1.4 标题栏增加常驻侧栏切换按钮

`TitleBarActions` 增加：

```ts
showSidebarToggle?: boolean;
```

工作区标题栏启用：

```ts
showSidebarToggle: true
```

这样即使侧栏折叠到图标态，用户也能在标题栏中清晰恢复或折叠侧栏。

---

## 2. 滚动区域架构优化

### 修改文件

- `src/components/ui/scroll-area.tsx`
- `src/styles/globals.css`
- `src/components/layout/AppSidebar.tsx`
- `src/views/CharacterEditor.tsx`

### 主要变化

#### 2.1 增强现有 ScrollArea 组件

仓库中已有 `src/components/ui/scroll-area.tsx`，本次没有重复新增，而是增强了样式：

- Root 增加 `overflow-hidden`。
- Viewport 统一 `h-full w-full`。
- Scroll thumb 使用主题变量。
- 暗色模式下降低滚动条突兀感。

#### 2.2 侧栏滚动交给 ScrollArea

侧栏内容区从直接裸 `overflow-auto` 改为：

```tsx
<SidebarContent className="overflow-hidden px-3">
  <ScrollArea className="h-full">
    ...
  </ScrollArea>
</SidebarContent>
```

这样侧栏在项目多、导航多时不会撑破布局。

#### 2.3 新增全局滚动条工具类

在 `globals.css` 中新增 `.app-scrollbar`，用于 textarea 等仍然需要原生滚动的输入场景。

用途：

- 长文本输入框。
- AI 生成内容展示。
- 后续其他原生滚动容器。

---

## 3. 人物功能区布局优化

### 修改文件

- `src/views/CharacterEditor.tsx`

### 主要变化

#### 3.1 SmartInput 替换为 CharacterField

原逻辑：

```ts
value.includes("\n") ? Textarea : Input
```

问题：AI 生成的大段文字如果没有换行，仍然会显示为单行输入框。

新逻辑：

```ts
const multilineFields = new Set(["appearance", "personality", "motivation", "relationships", "key_events"]);
const shouldMultiline = multilineFields.has(fieldKey) || value.length > 48 || value.includes("\n");
```

效果：

- 外貌、性格、动机、关系、关键事件默认使用 `Textarea`。
- 身份等短字段仍使用 `Input`。
- 超过一定长度也自动切换成多行输入。

#### 3.2 字段布局改为响应式 grid

原来是固定 flex：

```tsx
flex items-start gap-3
```

改为：

```tsx
grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-start
```

效果：

- 窄窗口下 label 和输入框上下排列。
- 宽窗口下保持左右布局。
- 避免输入框被挤到不可用。

#### 3.3 人物卡片标题增加自适应约束

新增：

- `min-w-0`
- `truncate`
- 摘要仅在 `md` 及以上显示

效果：

- 长姓名不会撑爆卡片。
- 摘要不会在窄屏挤占主信息。

#### 3.4 人物列表改用 ScrollArea

从：

```tsx
<div className="flex-1 px-8 py-5 overflow-auto min-h-0 space-y-6">
```

改为：

```tsx
<ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-8 sm:py-5">
```

效果：

- 保留完整高度约束。
- 滚动条样式统一。
- 小窗口下左右 padding 减少。

#### 3.5 底部操作栏改为可换行

原来底部操作栏是单行 flex，窗口变窄会挤压。

现在改为：

```tsx
flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60
```

模型选择不再嵌套在 `Button` 中，避免 `Button` 的 `whitespace-nowrap` 和 Select 内部交互冲突。

---

## 4. 影响范围

### 正向影响

- 侧栏不会再整栏消失。
- 侧栏折叠后仍保留功能图标。
- 标题栏有明确的侧栏切换入口。
- 暗色模式滚动条更柔和。
- 人物区长文本字段可正常编辑。
- 窄窗口下人物字段不会严重挤压。
- 底部操作栏不会因模型名称过长而明显溢出。

### 可能需要后续微调

1. `SidebarRail` 的实际鼠标命中区域需要在桌面端运行后观察。
2. `Textarea` 的 `max-h-[240px]` 是否合适，可以根据实际生成文本长度调整。
3. `ScrollArea` 的 thumb 颜色可继续根据最终视觉稿微调。
4. 项目切换菜单目前仍是占位回调，后续可以接入真正的切换项目动作。

---

## 本次提交涉及的核心 commit

- `16daca77392476d482fb01295cef0aa9835b3d06`：优化 ScrollArea 暗色滚动条。
- `ac09e80250211169f9e94fca25343d4c09166e60`：侧栏改为图标折叠和响应式导航。
- `b88e0d9bfbcead7ff89931782d5da8dd6612629d`：标题栏增加常驻侧栏切换按钮。
- `1bace39ce07cff10908c2636591c242ff0180f61`：启用工作区标题栏侧栏切换。
- `4ba8b34e72315d9f9af32e5ac7d63114702a1bab`：人物编辑器响应式布局优化。
- `a7813776822cb38de3e1e108f53380714fc95423`：新增全局滚动条工具类。

---

## 建议下一步

下一阶段建议从“单页修复”进入“UI 设计系统统一”：

1. 抽象 `PageHeader`、`ActionBar`、`EditorPanel`。
2. 所有编辑器页面统一采用：Header / Alert Area / ScrollArea Body / ActionBar。
3. 把人物、大纲、目录、正文四个阶段页面统一成同一套布局骨架。
4. 将 ScrollArea 推广到全部编辑器页面，减少裸 `overflow-auto`。
