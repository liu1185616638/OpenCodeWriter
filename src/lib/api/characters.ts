/**
 * API: Characters — 人物、关系、状态
 */

import { invoke } from "@tauri-apps/api/core";
import type { Character, CharacterRelation, CharacterState } from "@/types";

export async function listCharacters(projectId: number): Promise<Character[]> {
  return invoke("list_characters", { projectId });
}

export async function listCharactersByTier(projectId: number, tier: string): Promise<Character[]> {
  return invoke("list_characters_by_tier", { projectId, tier });
}

export async function createCharacter(projectId: number, name: string, tier: string): Promise<Character> {
  return invoke("create_character", { projectId, name, tier });
}

export async function updateCharacter(id: number, fields: Record<string, string>): Promise<Character> {
  return invoke("update_character", { id, ...fields });
}

export async function deleteCharacter(id: number): Promise<void> {
  return invoke("delete_character", { id });
}

export async function listCharacterRelations(projectId: number): Promise<CharacterRelation[]> {
  return invoke("list_character_relations", { projectId });
}

export async function createCharacterRelation(projectId: number, sourceCharacterId: number, targetCharacterId: number, relationType: string): Promise<CharacterRelation> {
  return invoke("create_character_relation", { projectId, sourceCharacterId, targetCharacterId, relationType });
}

export async function updateCharacterRelation(id: number, fields: Partial<Pick<CharacterRelation, 'relation_type' | 'tension' | 'summary'>>): Promise<CharacterRelation> {
  return invoke("update_character_relation", { id, fields });
}

export async function deleteCharacterRelation(id: number): Promise<void> {
  return invoke("delete_character_relation", { id });
}

export async function listCharacterStates(projectId: number, characterId?: number, limit?: number): Promise<CharacterState[]> {
  return invoke("list_character_states", { projectId, characterId, limit });
}

export async function createCharacterState(params: {
  projectId: number;
  characterId: number;
  chapterId?: number | null;
  stateSummary: string;
  goal: string;
  emotion: string;
  location: string;
}): Promise<CharacterState> {
  return invoke("create_character_state", params);
}

export async function deleteCharacterState(id: number): Promise<void> {
  return invoke("delete_character_state", { id });
}
