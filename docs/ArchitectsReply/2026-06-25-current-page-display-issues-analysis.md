# 当前页面显示问题检查与分析

日期：2026-06-25

问题主题：侧栏折叠与标题换行、暗色模式滚动条、人物功能区布局自适应

## 结论概览

本次检查基于 `master` 分支代码。当前问题主要不是业务逻辑错误，而是布局组件的默认行为和表单自适应策略不匹配导致的 UI 问题。

优先级建议：

1. 先修侧栏折叠模式：从 `offcanvas` 改为 `icon`，并保证折叠后仍保留功能图标和可恢复按钮。
2. 再统一滚动容器：新增 `ScrollArea` 组件，替换当前散落的 `overflow-auto`。
3. 最后修人物区：长文本字段默认使用自适应 `Textarea`，卡片、按钮区和字段区增加响应式布局。

---

## 1. 侧栏图标与程序名换行、点击后整栏收起

### 现象

- Logo 图标和 `OpenCodeWriter` 在空间不足时换行。
- 点击侧栏折叠按钮后，整个侧栏被收起到屏幕外。
- 折叠后没有保留各功能切换图标，也没有明显的再次展开按钮。

### 代码定位

- `src/components/layout/AppSidebar.tsx`
  - `AppSidebar` 使用 `<Sidebar className="rounded-xl border border-sidebar-border shadow-lg">`，未传入 `collapsible`。
  - Header 内部为 `flex items-center gap-2 px-6 py-5`，品牌区没有 `min-w-0`、`truncate`、`whitespace-nowrap`。
  - 折叠按钮调用 `toggleSidebar`。
- `src/components/ui/sidebar.tsx`
  - `Sidebar` 默认参数是 `collapsible = "offcanvas"`。
  - `offcanvas` 状态下 gap 宽度变为 0，容器移动到屏幕外。
  - `SidebarTrigger` 和 `SidebarRail` 已存在，但当前实际页面没有充分使用。
- `src/components/layout/TitleBar.tsx`
  - 菜单里有“视图 / 切换侧边栏”，但标题栏没有一个常驻的图标级展开按钮。

### 根因

`Sidebar` 默认使用 `offcanvas`，点击折叠后不是图标栏模式，而是整栏隐藏模式。当前 `AppSidebar` 里的导航按钮也是手写 `button`，不是 `SidebarMenuButton`，所以即便改成 `icon` 模式，也不会自动完成“只显示图标、隐藏文字、tooltip 提示”的折叠态体验。

### 建议修复

#### 1.1 将侧栏改成图标折叠模式

把普通视图和设置视图里的：

```tsx
<Sidebar className="rounded-xl border border-sidebar-border shadow-lg">
```

改为：

```tsx
<Sidebar collapsible="icon" className="rounded-xl border border-sidebar-border shadow-lg">
```

这样折叠后侧栏宽度会保留为 `--sidebar-width-icon`，而不是整栏 offcanvas 消失。

#### 1.2 修复 Logo 区换行

Header 建议改成：

```tsx
<SidebarHeader className="flex flex-row items-center gap-2 px-4 py-4" data-tauri-drag-region>
  <div className="flex min-w-0 flex-1 items-center gap-2 pointer-events-none">
    <div className="h-8 w-8 shrink-0 rounded-lg bg-primary flex items-center justify-center">
      <BookIcon className="h-4 w-4 text-primary-foreground" />
    </div>
    <span className="min-w-0 truncate whitespace-nowrap text-sm font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">
      OpenCodeWriter
    </span>
  </div>
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8 shrink-0 rounded-full border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
    onClick={toggleSidebar}
  >
    <PanelLeft className="h-4 w-4" />
  </Button>
</SidebarHeader>
```

关键点：

- `flex-row` 明确覆盖 `SidebarHeader` 默认的 `flex-col`。
- `min-w-0 + truncate + whitespace-nowrap` 防止标题换行。
- Logo 图标加 `shrink-0`。
- 折叠态隐藏标题文字和 header 内按钮。

#### 1.3 保留折叠态导航图标

建议把阶段按钮由当前手写结构改为更适合 sidebar 的结构：图标在左、文字在右，文字折叠时隐藏。

示例：

```tsx
<button
  className={cn(
    "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors",
    "group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
  )}
  onClick={() => onSelectStage(key)}
  title={label}
>
  <NavIcon className="h-5 w-5 shrink-0" />
  <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">{label}</span>
  <span className="group-data-[collapsible=icon]:hidden">
    <StageIcon status={stageStatuses[key]} />
  </span>
</button>
```

当前 `stages` 已经有 `icon` 字段，但渲染阶段时没有解构使用，建议改为：

```tsx
{stages.map(({ key, label, icon: NavIcon }) => (...))}
```

#### 1.4 增加常驻展开按钮

当前 `SidebarTrigger` 组件已存在，建议在 `TitleBar` 左侧增加一个小图标按钮，或者使用 `SidebarRail`。否则 offcanvas 或极窄状态下，用户只能通过菜单“视图 / 切换侧边栏”恢复，不直观。

推荐方案：

- `TitleBar` 左侧显示一个 `PanelLeft` 按钮，绑定 `actions.onToggleSidebar`。
- `AppSidebar` 内部增加 `<SidebarRail />`，鼠标靠近侧栏边缘可折叠/展开。

---

## 2. 暗色模式滚动条太直白

### 现象

暗色模式下仍然使用浏览器原生滚动条，视觉上过于突兀。

### 代码定位

- `src/styles/globals.css`
  - 目前只有主题变量和 `html, body { overflow: hidden; }`，没有统一滚动条样式。
- `src/components/ui/sidebar.tsx`
  - `SidebarContent` 直接使用 `overflow-auto`。
- `src/views/CharacterEditor.tsx`
  - 人物列表区直接使用 `overflow-auto`。
- `package.json`
  - 当前已有 `radix-ui` 依赖，适合直接封装 Radix ScrollArea。

### 建议修复

推荐使用 Radix / shadcn 风格的 `ScrollArea` 组件，而不是继续在各处写裸 `overflow-auto`。

新增文件：`src/components/ui/scroll-area.tsx`

```tsx
import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import { cn } from "src/lib/cn";

function ScrollArea({ className, children, ...props }: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-px transition-colors",
        orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border/70 hover:bg-border" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
```

替换示例：

```tsx
<ScrollArea className="flex-1 min-h-0 px-8 py-5">
  <div className="space-y-6 pr-3">
    ...人物列表...
  </div>
</ScrollArea>
```

侧栏内容也可以替换为：

```tsx
<SidebarContent className="px-4 overflow-hidden">
  <ScrollArea className="h-full">
    ...groups...
  </ScrollArea>
</SidebarContent>
```

保底方案：如果暂时不封装组件，也可以先加一个 `.app-scrollbar` 工具类：

```css
.app-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--border) 70%, transparent) transparent;
}

.app-scrollbar::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.app-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.app-scrollbar::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--border) 70%, transparent);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}

.app-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
  border: 3px solid transparent;
  background-clip: content-box;
}
```

---

## 3. 人物功能区显示不全、没有自适应、展开后输入框单行显示

### 现象

- 人物列表在窗口高度或宽度不足时显示不完整。
- 展开人物卡片后，字段输入框基本都是单行输入，不适合人物小传、外貌、性格、关系、关键事件等长文本。
- 底部操作按钮横向排列，在窄窗口下容易挤压或溢出。

### 代码定位

- `src/views/CharacterEditor.tsx`
  - `SmartInput` 只有包含换行时才切换为 `Textarea`。
  - `CharacterCard` 字段行使用 `flex items-start gap-3`，窄窗口下不会自动改成上下布局。
  - 人物列表区为 `flex-1 px-8 py-5 overflow-auto min-h-0 space-y-6`，左右 padding 偏大。
  - 底部按钮区为 `flex items-center gap-2 px-6 py-2`，没有 `flex-wrap`、`shrink-0`、边界样式。

### 根因

`SmartInput` 的判断条件过窄：AI 生成的内容很可能是一整段长文本，但没有换行符，因此仍然走 `<Input />`。这会造成长文本只能横向滚动或被截断，看起来像“所有输入框都是单行”。

### 建议修复

#### 3.1 长文本字段默认使用 Textarea

建议不要让长文本字段依赖换行判断，而是按字段类型决定。

示例：

```tsx
const multilineFields = new Set([
  "appearance",
  "personality",
  "motivation",
  "relationships",
  "key_events",
]);

function CharacterField({
  fieldKey,
  value,
  onChange,
  placeholder,
}: {
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const shouldMultiline = multilineFields.has(fieldKey) || value.length > 40 || value.includes("\n");

  if (shouldMultiline) {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[72px] max-h-[220px] resize-y text-sm bg-background leading-6"
      />
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="text-sm bg-background"
    />
  );
}
```

然后替换当前：

```tsx
<SmartInput ... />
```

为：

```tsx
<CharacterField
  fieldKey={key}
  value={editing[key] ?? (character[key as keyof Character] as string) ?? ""}
  onChange={(v) => setEditing(prev => ({ ...prev, [key]: v }))}
  placeholder={placeholder}
/>
```

#### 3.2 字段行改成响应式 grid

当前字段行：

```tsx
<div key={key} className="flex items-start gap-3">
```

建议改成：

```tsx
<div key={key} className="grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-start">
  <label className="text-xs text-muted-foreground pt-2 sm:w-auto">{label}</label>
  <div className="min-w-0">
    ...field...
  </div>
</div>
```

窄屏时 label 和输入框上下排列；宽屏时左右排列。

#### 3.3 卡片标题行防止挤爆

当前卡片标题行里姓名、层级、摘要、箭头都在同一行，但没有完整的 `min-w-0` / `truncate` 约束。

建议：

```tsx
<CollapsibleTrigger className="flex min-w-0 items-center gap-2 w-full px-4 sm:px-6 py-4 hover:bg-accent/50 transition-colors">
  <TierIcon className={`h-5 w-5 shrink-0 ${tierColor}`} />
  <span className="min-w-0 truncate font-semibold text-foreground">{character.name}</span>
  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full ...">{tierLabel}</span>
  {subtitle && !expanded && (
    <span className="hidden min-w-0 flex-1 truncate text-right text-sm text-muted-foreground md:block">
      {subtitle}
    </span>
  )}
  <ChevronDown className="h-4 w-4 shrink-0 ..." />
</CollapsibleTrigger>
```

#### 3.4 人物列表和底部操作栏自适应

人物列表：

```tsx
<ScrollArea className="flex-1 min-h-0 px-4 py-4 sm:px-8 sm:py-5">
  <div className="space-y-6 pr-3">
    ...
  </div>
</ScrollArea>
```

底部操作栏：

```tsx
<div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
```

模型选择按钮建议拆成普通容器，不要把 `Select` 放进 `Button` 里，避免按钮的 `whitespace-nowrap`、`shrink-0` 和 Select 内部交互互相影响。

推荐：

```tsx
<div className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm text-secondary-foreground">
  <Cpu className="h-4 w-4" />
  <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
    <SelectTrigger className="h-auto w-[min(220px,60vw)] border-0 bg-transparent p-0 focus:ring-0">
      <SelectValue placeholder="模型 ▼" />
    </SelectTrigger>
    <SelectContent>
      {presets.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.model_name})</SelectItem>)}
    </SelectContent>
  </Select>
</div>
```

---

## 建议修改文件清单

1. `src/components/layout/AppSidebar.tsx`
   - `<Sidebar collapsible="icon">`
   - Header 防换行。
   - 阶段导航改为图标优先、文字折叠隐藏。
   - 使用 `SidebarRail` 或确保 `TitleBar` 有常驻 `SidebarTrigger`。

2. `src/components/layout/TitleBar.tsx`
   - 左侧增加一个 `PanelLeft` / `SidebarTrigger` 风格按钮，绑定 `actions.onToggleSidebar`。

3. `src/components/ui/scroll-area.tsx`
   - 新增 Radix ScrollArea 封装。

4. `src/components/ui/sidebar.tsx`
   - `SidebarContent` 可改为默认 `overflow-hidden`，实际滚动交给 `ScrollArea`。
   - 或保留 `overflow-auto`，但统一加滚动条样式类。

5. `src/views/CharacterEditor.tsx`
   - `SmartInput` 改成按字段类型判断的 `CharacterField`。
   - 字段行改为响应式 grid。
   - 卡片标题行增加 `min-w-0` 和 `truncate`。
   - 列表区替换为 `ScrollArea`。
   - 底部操作栏增加 `shrink-0 flex-wrap border-t`。

6. `src/styles/globals.css`
   - 如果暂时不用 ScrollArea，至少增加 `.app-scrollbar` 暗色适配样式。

---

## 推荐实施顺序

1. 先改 `AppSidebar.tsx`：解决侧栏整栏消失和 Logo 换行。
2. 新增 `scroll-area.tsx`：统一滚动体验。
3. 改 `CharacterEditor.tsx`：修复人物卡片自适应和长文本输入。
4. 最后再微调暗色主题变量和滚动条 hover 颜色。

## 风险提示

- 如果直接把 `Sidebar` 改为 `collapsible="icon"`，但不处理当前手写按钮，折叠态可能仍然显示异常。因此侧栏折叠模式和导航按钮结构应一起改。
- `Textarea` 如果全部自动撑高，超长人物数据会让单张卡片过高。建议设置 `max-h-[220px]` 和内部滚动，或者使用 `resize-y` 让用户自行调节。
- `ScrollArea` 替换时要注意父级必须有明确高度，例如 `flex-1 min-h-0`，否则滚动区域不会按预期收缩。
