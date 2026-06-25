# OpenCodeWriter：AI 生成人物问题分析与推荐修改方案

> 仓库：`liu1185616638/OpenCodeWriter`  
> 分支：`master`  
> 日期：2026-06-25  
> 重点问题：AI 生成人物是否基于大纲、为什么后端和前端控制台都有输出但页面不显示、不保存、重新打开不存在。

---

## 1. 结论摘要

当前项目中，**AI 生成人物确实是基于当前项目大纲内容生成的**。

但是，当前“AI 生成人物”功能只完成了：

```text
读取大纲
构建 Prompt
调用模型
流式返回文本
前端 AIContext 接收 ai-chunk
```

还没有完成：

```text
CharacterEditor 页面展示 AI 返回内容
解析 AI 返回的人物文本
写入 characters 表
重新加载角色卡片
```

所以你看到的现象是合理的：

```text
后端有打印输出
前端控制台也接到了回答
页面没有显示
没有保存
重新打开也不存在
```

这不是模型没返回，也不是大纲没传，而是**缺少“展示 + 解析 + 入库”三个步骤**。

---

## 2. AI 生成人物是否基于大纲？

结论：**是的，是基于大纲生成。**

### 2.1 后端生成入口

文件：

```text
src-tauri/src/commands/ai.rs
```

当前 `generate_characters` 的核心逻辑是：

```rust
let outline_content = get_outline_content(&state, project_id)?;
let preset = get_preset(&state, preset_id)?;
drop(state);

let builder = ContextBuilder::new();
let messages = builder.build_characters_context(&outline_content);
let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name);

stream_and_emit(&client, messages, &app, &session_id).await?;

Ok(session_id)
```

关键点：

```rust
let outline_content = get_outline_content(&state, project_id)?;
```

说明它会先读取当前项目的大纲。

然后：

```rust
let messages = builder.build_characters_context(&outline_content);
```

说明大纲内容会被传入人物生成上下文。

---

### 2.2 Prompt 构建逻辑

文件：

```text
src-tauri/src/ai/context.rs
```

`build_characters_context` 中明确要求：

```text
请根据以下大纲，为小说创建完整的人物小传。

## 小说大纲

{outline}
```

并且还要求：

```text
请先在 <thinking> 标签内构思角色需求和关系，
然后在 </thinking> 之后严格按照模板格式生成人物。
```

因此当前人物生成链路是：

```text
project_id
  ↓
读取 outlines 表中的 content
  ↓
构建人物生成 Prompt
  ↓
调用模型
  ↓
流式返回人物小传文本
```

这一部分没有问题。

---

## 3. 当前“AI 生成人物”的实际链路

当前代码中的实际链路如下：

```text
点击 AI 生成人物
  ↓
CharacterEditor.handleGenerate()
  ↓
useAI().generate()
  ↓
Tauri invoke("generate_characters")
  ↓
Rust generate_characters()
  ↓
读取大纲
  ↓
调用模型 stream_chat()
  ↓
stream_and_emit()
  ↓
emit ai-chunk
  ↓
前端 AIContext 监听 ai-chunk
  ↓
streamedContent / thinkingContent 更新
  ↓
CharacterEditor 没有使用 streamedContent
  ↓
页面不显示
  ↓
onComplete 只 load()
  ↓
characters 表没有新增数据
  ↓
重新打开仍然不存在
```

---

## 4. 根因一：CharacterEditor 没有使用 AI 返回内容

文件：

```text
src/views/CharacterEditor.tsx
```

当前人物页从 `useAI()` 只取了：

```tsx
const { generating, error, generate, cancel } = useAI();
```

没有取：

```tsx
streamedContent
thinkingContent
generatingStage
```

也没有渲染：

```tsx
<StreamingView />
```

所以：

```text
AIContext 收到了模型返回
但 CharacterEditor 页面完全没有拿出来显示
```

当前页面主区域只渲染数据库里的角色：

```tsx
{main.map(c => <CharacterCard ... />)}
{supporting.map(c => <CharacterCard ... />)}
{minor.map(c => <CharacterCard ... />)}
```

如果数据库没有新角色，页面自然不会变化。

---

## 5. 根因二：onComplete 只重新加载，没有保存

文件：

```text
src/views/CharacterEditor.tsx
```

当前 `handleGenerate` 的完成回调是：

```tsx
onComplete: () => {
  load();
  toast.success("人物已生成");
}
```

这只做了：

```text
1. load()
2. toast.success()
```

没有做：

```text
1. 解析 AI 返回内容
2. createCharacter()
3. updateCharacter()
4. 写入 characters 表
```

所以实际结果是：

```text
AI 返回完成
  ↓
load()
  ↓
重新查询 characters 表
  ↓
characters 表没有新数据
  ↓
页面还是空
```

---

## 6. 根因三：Rust 后端 generate_characters 也没有写数据库

文件：

```text
src-tauri/src/commands/ai.rs
```

当前 `generate_characters` 只是：

```rust
stream_and_emit(&client, messages, &app, &session_id).await?;
Ok(session_id)
```

`stream_and_emit` 的作用是：

```text
读取模型流式响应
发送 ai-chunk 给前端
最后 emit_done
返回完整 content
```

但是 `generate_characters` 没有使用返回的完整 content，也没有插入 `characters` 表。

目前缺少类似逻辑：

```rust
let content = stream_and_emit(...).await?;
let characters = parse_characters(content);
insert_characters(project_id, characters);
```

---

## 7. 根因四：模型输出是 Markdown，但数据库需要结构化字段

当前人物模板文件：

```text
src-tauri/resources/templates/characters.md
```

输出格式是 Markdown：

```md
## 主要角色

### [角色名]
- **身份**：（职业/地位/角色定位）
- **外貌**：（关键特征，2-3句）
- **性格**：（核心特质+矛盾面）
- **动机**：（内在驱动力）
- **人物关系**：（与其他角色的关键关系）
- **关键事件**：（推动角色弧线的重要事件）

## 重要配角
（同上格式，可简略）

## 其他角色
（简要描述即可）
```

但是 `characters` 表需要的是结构化字段：

```text
name
tier
identity
appearance
personality
motivation
relationships
key_events
sort_order
```

所以必须增加这个步骤：

```text
Markdown 人物小传
  ↓
解析成 Character[]
  ↓
写入 characters 表
```

当前该步骤不存在。

---

## 8. 根因五：手动添加人物里的 AI 命令不存在

文件：

```text
src/views/CharacterEditor.tsx
```

当前手动添加弹窗中调用了：

```tsx
await generate("generate_character_from_description", {
  projectId: project.id,
  presetId: currentPreset.id,
  description: newDescription.trim(),
  tier: newTier,
});
```

但是 Rust 注册的 AI 命令只有：

```text
generate_outline
generate_characters
generate_chapters
generate_content
```

没有：

```text
generate_character_from_description
```

所以这个入口目前也有问题。第一版建议先禁用或删除该 AI 按钮，后续再单独实现。

---

# 9. 推荐修复方案总览

建议分两阶段。

## 阶段一：前端最小修复

目标：

```text
1. 生成人物时页面能显示 AI 返回内容
2. 生成完成后把 Markdown 解析成角色
3. 调用现有 create/update 接口写入 characters 表
4. 重新打开项目后能看到保存的人物
```

优点：

```text
改动小
不用重构 Rust 后端
可以快速验证功能闭环
```

缺点：

```text
Markdown 解析依赖模型输出格式
如果模型格式漂移，可能解析失败
```

## 阶段二：长期推荐架构

目标：

```text
让 AI 直接输出 JSON
Rust 后端生成完成后解析并入库
前端只负责显示流式过程和刷新列表
```

优点：

```text
结构更稳定
职责更清晰
减少前端解析复杂度
```

---

# 10. 阶段一修改点 1：CharacterEditor 渲染 StreamingView

## 10.1 修改 import

文件：

```text
src/views/CharacterEditor.tsx
```

新增：

```tsx
import { StreamingView } from "@/components/shared/StreamingView";
```

---

## 10.2 修改 useAI 解构

把：

```tsx
const { generating, error, generate, cancel } = useAI();
```

改成：

```tsx
const {
  generating,
  streamedContent,
  thinkingContent,
  error,
  generate,
  cancel,
  generatingStage,
} = useAI();
```

---

## 10.3 在人物列表区域中显示流式内容

找到：

```tsx
<div className="flex-1 px-8 py-5 overflow-auto space-y-6">
```

在里面最前面加：

```tsx
{generating && generatingStage === "characters" && (
  <StreamingView
    content={streamedContent}
    thinkingContent={thinkingContent}
    generating={generating}
  />
)}
```

推荐结构：

```tsx
<div className="flex-1 px-8 py-5 overflow-auto space-y-6">
  {generating && generatingStage === "characters" && (
    <StreamingView
      content={streamedContent}
      thinkingContent={thinkingContent}
      generating={generating}
    />
  )}

  {main.length > 0 && (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-primary px-2">主要角色</h3>
      {main.map(c => (
        <CharacterCard
          key={c.id}
          character={c}
          onUpdate={update}
          onDelete={remove}
        />
      ))}
    </div>
  )}

  ...
</div>
```

这样可以先解决：

```text
前端控制台有输出，但页面不显示
```

---

# 11. 阶段一修改点 2：新增 Markdown 解析器

新增文件：

```text
src/lib/parseCharacters.ts
```

建议内容：

```ts
import type { CharacterTier } from "@/types";

export interface ParsedCharacter {
  name: string;
  tier: CharacterTier;
  identity: string;
  appearance: string;
  personality: string;
  motivation: string;
  relationships: string;
  key_events: string;
}

function normalizeTier(section: string): CharacterTier {
  if (section.includes("主要角色")) return "main";
  if (section.includes("重要配角")) return "supporting";
  return "minor";
}

function pickField(block: string, label: string): string {
  const regex = new RegExp(
    `-\\s*\\*\\*${label}\\*\\*[:：]\\s*([\\s\\S]*?)(?=\\n-\\s*\\*\\*|\\n###|\\n##|$)`
  );

  const match = block.match(regex);
  return match?.[1]?.trim() ?? "";
}

export function stripThinkingTags(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}

export function parseCharactersFromMarkdown(markdown: string): ParsedCharacter[] {
  const result: ParsedCharacter[] = [];
  const cleaned = stripThinkingTags(markdown);

  const sectionRegex = /##\s*(主要角色|重要配角|其他角色)([\s\S]*?)(?=\n##\s*|$)/g;

  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionRegex.exec(cleaned)) !== null) {
    const sectionTitle = sectionMatch[1];
    const sectionBody = sectionMatch[2];
    const tier = normalizeTier(sectionTitle);

    const characterRegex = /###\s*(.+?)\n([\s\S]*?)(?=\n###\s*|$)/g;
    let characterMatch: RegExpExecArray | null;

    while ((characterMatch = characterRegex.exec(sectionBody)) !== null) {
      const name = characterMatch[1].trim();
      const block = characterMatch[2];

      if (!name || name.includes("[角色名]")) continue;

      result.push({
        name,
        tier,
        identity: pickField(block, "身份"),
        appearance: pickField(block, "外貌"),
        personality: pickField(block, "性格"),
        motivation: pickField(block, "动机"),
        relationships: pickField(block, "人物关系"),
        key_events: pickField(block, "关键事件"),
      });
    }
  }

  return result;
}
```

---

# 12. 阶段一修改点 3：CharacterEditor 生成完成后解析并保存

## 12.1 引入解析函数

文件：

```text
src/views/CharacterEditor.tsx
```

新增：

```tsx
import { parseCharactersFromMarkdown } from "@/lib/parseCharacters";
```

---

## 12.2 从 useCharacters 取出 create

当前：

```tsx
const { characters, main, supporting, minor, loading, load, update, remove } = useCharacters(project.id);
```

改成：

```tsx
const {
  characters,
  main,
  supporting,
  minor,
  loading,
  load,
  create,
  update,
  remove,
} = useCharacters(project.id);
```

---

## 12.3 修改 onComplete

当前：

```tsx
onComplete: () => {
  load();
  toast.success("人物已生成");
}
```

改成：

```tsx
onComplete: async (content) => {
  const parsed = parseCharactersFromMarkdown(content);

  if (parsed.length === 0) {
    toast.error("人物解析失败", {
      description: "AI 已返回内容，但没有解析出角色，请检查输出格式。",
    });
    return;
  }

  for (const item of parsed) {
    const created = await create(item.name, item.tier);

    await update(created.id, {
      identity: item.identity,
      appearance: item.appearance,
      personality: item.personality,
      motivation: item.motivation,
      relationships: item.relationships,
      key_events: item.key_events,
    });
  }

  await load();

  toast.success("人物已生成", {
    description: `已保存 ${parsed.length} 个角色`,
  });
}
```

这样链路变成：

```text
AI 返回 Markdown
  ↓
onComplete(content)
  ↓
parseCharactersFromMarkdown(content)
  ↓
create(name, tier)
  ↓
update(id, fields)
  ↓
load()
  ↓
页面显示人物卡片
  ↓
数据库已保存
```

---

# 13. 阶段一修改点 4：避免重复生成时叠加旧角色

当前如果重复点击“AI 生成人物”，上面的逻辑会继续新增角色，可能造成重复。

可以先用简单策略：**同名角色跳过**。

```tsx
const existingNames = new Set(characters.map(c => c.name.trim()));

for (const item of parsed) {
  if (existingNames.has(item.name.trim())) {
    continue;
  }

  const created = await create(item.name, item.tier);

  await update(created.id, {
    identity: item.identity,
    appearance: item.appearance,
    personality: item.personality,
    motivation: item.motivation,
    relationships: item.relationships,
    key_events: item.key_events,
  });
}
```

更好的设计是提供两个按钮：

```text
AI 补充人物
AI 重新生成人物
```

其中：

```text
AI 补充人物：跳过同名角色，只新增不存在的人物
AI 重新生成人物：先删除当前人物，再保存新人物
```

---

# 14. 阶段二：长期推荐改成 JSON 结构化输出

Markdown 适合阅读，但不适合稳定入库。长期建议让模型直接输出 JSON。

## 14.1 修改人物生成 Prompt

文件：

```text
src-tauri/src/ai/context.rs
```

把人物生成输出要求改成：

```text
请严格输出 JSON，不要输出 Markdown，不要使用代码块，不要添加解释说明。

JSON 结构如下：

{
  "characters": [
    {
      "name": "角色名",
      "tier": "main",
      "identity": "身份",
      "appearance": "外貌",
      "personality": "性格",
      "motivation": "动机",
      "relationships": "人物关系",
      "key_events": "关键事件"
    }
  ]
}

字段要求：

- tier 只能是 main、supporting、minor
- main 表示主要角色
- supporting 表示重要配角
- minor 表示其他角色
- 每个字段必须是字符串
- characters 至少包含 3 个角色
- 不要省略字段
```

---

## 14.2 JSON 解析函数示例

可以新增：

```text
src/lib/parseCharactersJson.ts
```

示例：

```ts
import type { CharacterTier } from "@/types";

export interface ParsedCharacter {
  name: string;
  tier: CharacterTier;
  identity: string;
  appearance: string;
  personality: string;
  motivation: string;
  relationships: string;
  key_events: string;
}

function isTier(value: string): value is CharacterTier {
  return value === "main" || value === "supporting" || value === "minor";
}

export function parseCharactersFromJson(text: string): ParsedCharacter[] {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();

  const data = JSON.parse(cleaned);
  const list = Array.isArray(data) ? data : data.characters;

  if (!Array.isArray(list)) {
    throw new Error("characters 字段不是数组");
  }

  return list
    .filter(item => item && typeof item.name === "string")
    .map(item => ({
      name: String(item.name ?? "").trim(),
      tier: isTier(item.tier) ? item.tier : "supporting",
      identity: String(item.identity ?? "").trim(),
      appearance: String(item.appearance ?? "").trim(),
      personality: String(item.personality ?? "").trim(),
      motivation: String(item.motivation ?? "").trim(),
      relationships: String(item.relationships ?? "").trim(),
      key_events: String(item.key_events ?? "").trim(),
    }))
    .filter(item => item.name);
}
```

---

# 15. 阶段三：更完整的后端入库方案

长期建议让 Rust 后端负责解析和入库。

推荐链路：

```text
前端点击 AI 生成人物
  ↓
Rust generate_characters()
  ↓
stream_and_emit() 流式给前端预览
  ↓
拿到完整 content
  ↓
parse_generated_characters(content)
  ↓
insert into characters
  ↓
emit_done
  ↓
前端 load()
```

当前 `stream_and_emit` 已经能返回完整正文：

```rust
Ok(full_content)
```

所以后端只是没有使用这个返回值。

## 15.1 推荐修改 generate_characters

当前：

```rust
stream_and_emit(&client, messages, &app, &session_id).await?;
Ok(session_id)
```

推荐改成：

```rust
let content = stream_and_emit(&client, messages, &app, &session_id).await?;

let db_state = app.state::<DbState>();
save_generated_characters(&db_state, project_id, &content)?;

Ok(session_id)
```

注意：当前函数里有：

```rust
drop(state);
```

如果后续要保存，需要在生成完成后重新通过 `app.state::<DbState>()` 获取数据库状态。

---

# 16. 关于是否要流式显示人物卡片

不建议第一版边生成边解析成卡片，因为流式 Markdown 是不完整的，边解析容易出现：

```text
角色名到了，但字段没到
字段到了，但角色块没结束
<thinking> 还没结束
模型输出格式中途变化
```

第一版推荐：

```text
生成中：显示 StreamingView Markdown 预览
生成完成：解析完整内容并保存为角色卡片
保存后：隐藏 StreamingView，显示角色卡片
```

---

# 17. 必须注意：思维链可能污染人物解析

如果模型把思维链作为正文 `content` 返回，而不是作为 `reasoning_content` 返回，那么 `streamedContent` 可能包含：

```text
<thinking>...</thinking>
```

或：

```text
<think>...</think>
```

所以解析前必须清理：

```ts
.replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
.replace(/<think>[\s\S]*?<\/think>/g, "")
```

长期建议在 Rust `client.rs` 层统一拆分：

```text
reasoning_content → thinking
<thinking>...</thinking> → thinking
<think>...</think> → thinking
正式内容 → content
```

这样所有生成阶段都会更干净。

---

# 18. 推荐最终落地顺序

## 第一步：修复页面不显示

修改：

```text
src/views/CharacterEditor.tsx
```

实现：

```text
generating && generatingStage === "characters" 时显示 StreamingView
```

验证：

```text
点击 AI 生成人物后，页面能看到流式文本
```

---

## 第二步：新增解析器

新增：

```text
src/lib/parseCharacters.ts
```

实现：

```text
parseCharactersFromMarkdown()
stripThinkingTags()
```

验证：

```text
把模型返回的人物 Markdown 粘进去能解析出 Character[]
```

---

## 第三步：生成完成后保存

修改：

```text
src/views/CharacterEditor.tsx
```

实现：

```text
onComplete(content)
  → parseCharactersFromMarkdown(content)
  → create()
  → update()
  → load()
```

验证：

```text
生成完成后出现角色卡片
重新打开项目后角色仍存在
```

---

## 第四步：修复手动添加 AI 命令

当前不存在：

```text
generate_character_from_description
```

二选一：

```text
1. 删除/禁用这个 AI 生成入口，只保留手动添加
2. 在 Rust 侧新增 generate_character_from_description 命令
```

建议第一版先删除或禁用，避免用户点击报错。

---

## 第五步：升级为 JSON 结构化输出

修改：

```text
src-tauri/src/ai/context.rs
```

让人物生成直接输出 JSON。

然后前端或后端解析 JSON，比 Markdown 更稳定。

---

## 第六步：最终迁移到后端入库

修改：

```text
src-tauri/src/commands/ai.rs
```

让 `generate_characters` 生成完成后直接解析并写入数据库。

前端只负责：

```text
显示流式过程
生成完成后 load()
```

---

# 19. 最小代码修改清单

## 19.1 新增文件

```text
src/lib/parseCharacters.ts
```

作用：

```text
解析 AI Markdown 输出为 ParsedCharacter[]
```

---

## 19.2 修改文件

```text
src/views/CharacterEditor.tsx
```

修改点：

```text
1. 引入 StreamingView
2. 引入 parseCharactersFromMarkdown
3. useAI 增加 streamedContent、thinkingContent、generatingStage
4. useCharacters 增加 create
5. 生成中渲染 StreamingView
6. onComplete 解析并保存角色
```

---

## 19.3 后续建议修改文件

```text
src-tauri/src/ai/context.rs
```

修改点：

```text
让人物生成输出 JSON
```

```text
src-tauri/src/commands/ai.rs
```

修改点：

```text
后端解析并入库
```

```text
src-tauri/src/lib.rs
```

修改点：

```text
如果保留“根据描述生成单个人物”，需要注册 generate_character_from_description
```

---

# 20. 验证步骤

## 20.1 验证是否基于大纲

在后端打印：

```rust
eprintln!("[generate_characters] outline len={}", outline_content.len());
eprintln!(
    "[generate_characters] outline preview={}",
    outline_content.chars().take(120).collect::<String>()
);
```

如果大纲长度大于 0，说明确实传入了大纲。

---

## 20.2 验证前端是否收到流

前端控制台应该看到：

```text
[ai-chunk] #1 type=thinking len=...
[ai-chunk] #2 type=content len=...
```

如果能看到，说明 `AIContext` 正常。

---

## 20.3 验证页面是否显示

点击“AI 生成人物”后，人物页面主区域应该出现：

```text
构思过程
人物 Markdown 输出
```

如果控制台有 chunk，但页面没显示，说明 `StreamingView` 没挂到 `CharacterEditor`。

---

## 20.4 验证是否保存

生成完成后：

```text
characters.length
```

应该从 0 变成大于 0。

重新打开项目后仍然存在，说明数据库已经写入。

---

# 21. 关键判断

当前问题不是：

```text
模型没返回
大纲没传
Tauri 事件没发
前端完全没收到
```

而是：

```text
人物页没有展示 AIContext 里的 streamedContent
人物页没有解析 AI 返回内容
人物页没有写 characters 表
后端 generate_characters 也没有写 characters 表
```

所以只要补齐：

```text
展示
解析
保存
```

这三个环节，问题就能解决。

---

# 22. 推荐最终架构

最终建议架构如下：

```text
用户点击 AI 生成人物
  ↓
CharacterEditor 调用 generate_characters
  ↓
Rust 读取大纲
  ↓
Rust 构造人物生成 Prompt
  ↓
模型流式返回
  ↓
Rust emit ai-chunk 给前端
  ↓
前端 StreamingView 展示生成过程
  ↓
Rust 收集完整 content
  ↓
Rust 解析 JSON/Markdown
  ↓
Rust 写入 characters 表
  ↓
Rust emit ai-done
  ↓
前端 load()
  ↓
角色卡片显示
```

职责划分：

```text
Rust：生成、解析、保存
React：展示、交互、刷新
AIContext：统一管理流式状态
```

---

# 23. 最终优先级建议

| 优先级 | 修改项 | 目的 |
|---|---|---|
| P0 | CharacterEditor 渲染 StreamingView | 解决页面不显示 |
| P0 | onComplete 解析并 create/update | 解决不保存 |
| P0 | 解析前清理 thinking 标签 | 避免思维链污染 |
| P1 | 禁用或实现 generate_character_from_description | 避免手动添加 AI 报错 |
| P1 | 人物 Prompt 改 JSON 输出 | 提高解析稳定性 |
| P2 | Rust 后端解析并入库 | 优化架构 |
| P2 | 支持重新生成/追加生成模式 | 避免重复角色 |

---

# 24. 一句话总结

当前 AI 生成人物已经基于大纲，但只完成了“生成文本并发给前端事件”这一步；还缺少 `CharacterEditor` 中的流式展示、AI 文本解析、数据库写入。因此前后端都有输出，但页面没有角色卡片，重新打开也不存在。
