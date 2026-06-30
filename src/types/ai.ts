export type GenerationApplyMode = "replace" | "append" | "draft";

export type GenerationStatus =
  | "idle"
  | "confirming"
  | "generating"
  | "cancelled"
  | "failed"
  | "completed";

export interface GenerationTaskMeta {
  stage?: string;
  command?: string;
  presetId?: number;
  modelName?: string;
  startedAt?: number;
  endedAt?: number;
  applyMode?: GenerationApplyMode;
}
