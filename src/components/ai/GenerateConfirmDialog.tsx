import { useState } from "react";
import type { GenerationApplyMode } from "@/types/ai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GenerateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: GenerationApplyMode) => void;
}

const OPTIONS: {
  value: GenerationApplyMode;
  label: string;
  note?: string;
  disabled?: boolean;
}[] = [
  { value: "replace", label: "替换当前内容" },
  { value: "append", label: "追加到当前内容后面" },
  {
    value: "draft",
    label: "保存为草稿",
    note: "(快照功能完成后启用)",
    disabled: true,
  },
];

export function GenerateConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: GenerateConfirmDialogProps) {
  const [selectedMode, setSelectedMode] =
    useState<GenerationApplyMode>("replace");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>生成方式</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {OPTIONS.map((opt) => {
            const isSelected = selectedMode === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors ${
                  opt.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                }`}
                onClick={() => {
                  if (opt.disabled) return;
                  setSelectedMode(opt.value);
                }}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isSelected
                      ? "border-primary"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && (
                    <span className="block h-2 w-2 rounded-full bg-primary" />
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm leading-tight">{opt.label}</span>
                  {opt.note && (
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {opt.note}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => onConfirm(selectedMode)}>开始生成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
