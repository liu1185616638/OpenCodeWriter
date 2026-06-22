# Skill 来源记录

检索时间：2026-06-22。

GitHub 精确检索覆盖了文章中的 11 个名称，未找到路径与名称均匹配的公开 `SKILL.md`；继续检索时 GitHub Code Search 返回速率限制。以下只采用已核实的一手仓库作为相似职责参考，不直接复制许可证不明或附带第三方条款的内容。

| Skill | 精确同名 | 相似来源 | 采用内容 | 本地调整 |
| --- | --- | --- | --- | --- |
| `product-spec-builder` | 未找到 | [openai/skills: notion-spec-to-implementation](https://github.com/openai/skills/tree/main/skills/.curated/notion-spec-to-implementation) | 从规格形成可执行、可追踪产物的边界 | 需求访谈和逐层解锁依据文章自建；不复制受 Notion 许可约束的正文 |
| `design-brief-builder` | 未找到 | [openai/skills: figma-generate-design](https://github.com/openai/skills/tree/main/skills/.curated/figma-generate-design) | 设计系统、组件与变量优先 | 增加“形态先于视觉”和抽象词转设计属性；不复制受 Figma 条款约束的正文 |
| `design-maker` | 未找到 | [openai/skills: figma-generate-design](https://github.com/openai/skills/tree/main/skills/.curated/figma-generate-design) | 复用组件、变量和样式构建设计稿 | 工具保持可选；同时兼容 Pencil/Figma，缺少 MCP 时停止并说明 |
| `dev-planner` | 未找到 | [obra/superpowers: writing-plans](https://github.com/obra/superpowers/tree/main/skills/writing-plans)、[openai/skills: notion-spec-to-implementation](https://github.com/openai/skills/tree/main/skills/.curated/notion-spec-to-implementation) | 明确文件、验证命令、依赖顺序和无占位计划 | 采用文章的 Phase 可编译、可运行、可见门禁 |
| `dev-builder` | 未找到 | [obra/superpowers: executing-plans](https://github.com/obra/superpowers/tree/main/skills/executing-plans)、[obra/superpowers: test-driven-development](https://github.com/obra/superpowers/tree/main/skills/test-driven-development) | 按计划执行、测试先行、证据化完成 | 压缩成纪律和验收标准，不固化详细过程 |
| `bug-fixer` | 未找到 | [obra/superpowers: systematic-debugging](https://github.com/obra/superpowers/tree/main/skills/systematic-debugging) | 证据优先、验证假设、禁止猜修 | 限制同时最多三个假设；连续三次失败强制停下重审 |
| `code-review` | 未找到 | [obra/superpowers: requesting-code-review](https://github.com/obra/superpowers/tree/main/skills/requesting-code-review)、[openai/skills: security-best-practices](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices) | 独立上下文、证据化发现、安全检查 | 增加两阶段审查、引导真实性和测试真实性 |
| `release-builder` | 未找到 | [obra/superpowers: finishing-a-development-branch](https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch)、[openai/skills: security-best-practices](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices) | 分支收尾、验证、安全检查 | 增加从安装产物测试和隐私审计硬门禁 |
| `goal-creator` | 未找到 | [openai/skills: define-goal](https://github.com/openai/skills/tree/main/skills/.curated/define-goal) | 目标具体、可测量、成功标准明确 | 输出 4000 字符以内的 `/goal` 指令，只生成不发送 |
| `evolution-engine` | 未找到 | 无足够贴近的公开 Skill | 无 | 依据文章的信号→建议→逐条确认短链自建，支持规则新增和退休 |
| `skill-builder` | 未找到 | [openai/skills: skill-creator](https://github.com/openai/skills/tree/main/skills/.system/skill-creator) | Skill 结构、渐进披露、初始化和校验 | 增加“最后手段”和必须经用户批准的项目规则 |

`obra/superpowers` 使用 MIT License。`openai/skills` 中采用的条目具有各自许可证；本项目只抽取通用原则并重新编写，未复制第三方受限正文。
