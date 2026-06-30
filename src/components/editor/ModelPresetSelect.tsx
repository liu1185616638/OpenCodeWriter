import { Cpu } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModelPreset } from "@/types";

interface ModelPresetSelectProps {
  value: number | null | undefined;
  presets: ModelPreset[];
  onChange: (id: number) => void;
  placeholder?: string;
}

export function ModelPresetSelect({
  value,
  presets,
  onChange,
  placeholder = "选择模型",
}: ModelPresetSelectProps) {
  return (
    <div className="inline-flex h-10 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm text-secondary-foreground">
      <Cpu className="h-4 w-4 shrink-0" />
      <Select value={String(value ?? "")} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-auto w-[min(240px,55vw)] border-0 bg-transparent p-0 text-secondary-foreground focus:ring-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name} ({p.model_name})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
