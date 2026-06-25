# 截图反馈 UI 问题修复记录

日期：2026-06-25

问题主题：人物界面异常空白、程序宽度自适应不足、编辑器滚动条暗色适配、折叠侧栏图标显示不全。

## 反馈问题

用户截图反馈了三个问题：

1. 人物界面中，角色名和人物摘要之间出现异常大空白，并且人物卡片没有很好自适应程序宽度。
2. 除人物列表外，大纲、目录、正文的滚动条也需要适配暗色模式。
3. 侧栏折叠后，左侧图标显示不全，被裁切。

---

## 1. 人物界面异常空白与宽度自适应

### 根因

`CharacterEditor.tsx` 中角色卡片标题行原来使用横向 `flex`，并把摘要设置为：

```tsx
<span className="ml-2 hidden min-w-0 flex-1 truncate text-right text-sm text-muted-foreground md:block">
```

这里的 `flex-1 + text-right` 会把摘要推到卡片最右侧，所以截图中角色名与 `身份：...` 之间出现大量空白。

同时人物页面根容器没有足够的 `min-w-0 / overflow-hidden / max-w-full` 约束，长文本在极端情况下容易造成横向撑宽。

### 修复

修改文件：

- `src/views/CharacterEditor.tsx`

主要改动：

1. 角色卡片标题行由单行 flex 改为三列 grid：

```tsx
grid-cols-[auto_minmax(0,1fr)_auto]
```

2. 中间主体区改成可自适应的标题 + 摘要结构：

```tsx
<div className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
```

3. 摘要不再 `text-right`，避免被推到最右边。

4. 页面根容器增加：

```tsx
min-w-0 overflow-hidden
```

5. ScrollArea 与内部列表增加：

```tsx
min-w-0 max-w-full overflow-x-hidden
```

### 预期效果

- 角色名、标签、身份/动机摘要会自然靠近排列。
- 不会再出现截图中大片异常空白。
- 窗口宽度变化时，摘要会在剩余空间内截断，不会撑开页面。

---

## 2. 大纲、目录、正文滚动条暗色适配

### 根因

上次只重点处理了人物列表，其他编辑器仍存在裸 `overflow-auto` 或 textarea 原生滚动条。

### 修复

修改文件：

- `src/views/OutlineEditor.tsx`
- `src/views/ChapterEditor.tsx`
- `src/views/ContentEditor.tsx`

### 大纲页

- 引入 `ScrollArea`。
- 主编辑区外层从 `overflow-auto` 改成 `ScrollArea`。
- 大纲 textarea 添加 `.app-scrollbar`。
- 底部操作栏改为 `flex-wrap`，避免撑宽。

### 目录页

- 章节列表改成 `ScrollArea`。
- 章节详情编辑区改成 `ScrollArea`。
- 章节摘要 textarea 添加 `.app-scrollbar`。
- 新建章节弹窗摘要 textarea 添加 `.app-scrollbar`。
- 主体增加 `min-w-0 overflow-hidden`。

### 正文页

- 左侧章节列表改成 `ScrollArea`。
- 正文编辑区改成 `ScrollArea`。
- 正文 textarea 添加 `.app-scrollbar`。
- 标题、章节按钮、正文区增加 `truncate / min-w-0`。
- 底部操作栏改为可换行。

### 预期效果

- 大纲、目录、正文都使用主题化滚动条。
- 暗色模式下滚动条不会再显得刺眼。
- 页面宽度不足时不容易被模型选择、章节标题或长正文撑开。

---

## 3. 折叠侧栏图标显示不全

### 根因

侧栏折叠后宽度是 `3rem`，但 `AppSidebar` 内部仍然保留：

- `SidebarContent` 的 `px-3`
- `SidebarGroup` 默认 `p-2`
- 导航按钮宽度虽然是 `w-full`，但实际可用宽度被多层 padding 压缩

最终导致折叠态图标容器宽度不足，图标被裁切。

### 修复

修改文件：

- `src/components/layout/AppSidebar.tsx`

主要改动：

1. `SidebarBrand` 折叠态减少 padding 并居中：

```tsx
group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2
```

2. `SidebarContent` 折叠态减少 padding：

```tsx
group-data-[collapsible=icon]:px-1
```

3. `SidebarGroup` 折叠态取消默认 padding：

```tsx
group-data-[collapsible=icon]:p-0
```

4. 导航按钮折叠态固定为 `w-10 h-10`：

```tsx
group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10
```

### 预期效果

- 折叠态左侧图标完整显示。
- 图标点击区域稳定为 40px。
- 不再出现截图二中图标被切掉一部分的情况。

---

## 本次提交

- `c311ff83d4676dde643344249e86c0a72ce54819`：修复折叠侧栏图标裁切。
- `ec7a61f93b145171c3cb371556bca32e5220af28`：修复人物卡片摘要异常空白和宽度约束。
- `bddb75e2737e7279dcce57178d9944d0f9399f2f`：大纲页滚动条适配暗色。
- `9cb60aee9034e563ce035e817ba4c03a755c37aa`：目录页滚动条和布局适配。
- `57b39c21a230e99add072fb900ecf9071e308da5`：正文页滚动条和布局适配。

---

## 后续建议

1. 本地执行 `npm run build`，确认 Tailwind 任意值和 Radix ScrollArea 类型无编译问题。
2. 在 Tauri 桌面端分别测试：展开侧栏、折叠侧栏、人物卡片展开、窗口缩窄、暗色模式滚动。
3. 如果后续希望进一步统一体验，可以抽象公共 `EditorShell`，让大纲、人物、目录、正文共用同一套 Header / Body / ActionBar 布局。
