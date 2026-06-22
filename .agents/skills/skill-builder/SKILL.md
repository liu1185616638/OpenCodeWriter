---
name: skill-builder
description: 在用户明确批准后创建或更新项目级 Agent Skill。用于进化建议确认需要新能力、现有 Skill 无法合理扩展或用户直接要求造 Skill；优先复用 GitHub 或扩展现有 Skill，新建是最后手段。
---

# 构建 Skill

## 输入

读取获批建议、现有 `.agents/skills`、具体触发示例和预期产物。先检索同名公开 Skill，再检索职责相近且许可证允许的实现。

## 原则

- 先判断现有 Skill 是否只需小幅扩展；能扩展就不新建。
- 使用小写短横线命名，保持单一职责和清晰触发边界。
- `SKILL.md` 只写必要工作知识；重型资料放 `references/`，确定性重复操作才写 `scripts/`。
- frontmatter 只保留 `name` 和 `description`；description 同时说明何时用和何时不用。
- 使用官方初始化器和校验器，不手造不一致骨架。

## 产出

创建最小 Skill 目录、`SKILL.md`、`agents/openai.yaml` 及确有必要的资源；记录来源、许可证和本地调整。

## 验收

- 使用 `quick_validate.py` 通过结构检查。
- 显式触发示例、隐式触发示例和不应触发示例边界清晰。
- 没有占位文件、重复文档、一次性抽象或未测试脚本。
- 更新已有 Skill 时，UI 元数据与正文保持一致。

## 停止条件

用户未批准、职责与现有 Skill 重叠、来源许可不清或缺少具体使用示例时停止，不创建目录。
