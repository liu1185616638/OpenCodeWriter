import type { CreationStage } from "@/types";

export interface StageProgressInput {
  outlineContent?: string;
  characterCount?: number;
  chapterCount?: number;
  selectedChapterId?: number | null;
}

export function getNextStep(stage: CreationStage, input: StageProgressInput): string {
  switch (stage) {
    case "outline":
      return input.outlineContent?.trim()
        ? "大纲已有内容，可以进入人物设计。"
        : "先生成或编写故事大纲。";
    case "characters":
      return input.characterCount
        ? "人物已有内容，可以进入章节目录。"
        : "先根据大纲生成人物。";
    case "chapters":
      return input.chapterCount
        ? "章节目录已有内容，可以进入正文创作。"
        : "先根据大纲和人物生成章节目录。";
    case "content":
      return input.selectedChapterId
        ? "可以生成或编辑当前章节正文。"
        : "先选择一个章节。";
    case "world":
      return "维护世界观、角色关系和故事资产。";
    case "knowledge":
      return "导入参考资料，支持全文检索和拆书分析。";
  }
}
