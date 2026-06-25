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
