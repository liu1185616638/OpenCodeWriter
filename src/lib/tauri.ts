/**
 * tauri.ts — 桶文件（barrel）
 *
 * 实际实现已按领域拆分至 src/lib/api/ 目录。
 * 此文件保持向后兼容，所有 `import { ... } from "@/lib/tauri"` 仍可正常工作。
 *
 * @see src/lib/api/index.ts
 */

export * from "./api/index";
