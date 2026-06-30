import type { CreationStage } from "@/types";
import { getNextStep } from "@/lib/stageProgress";
import type { StageProgressInput } from "@/lib/stageProgress";
import { Lightbulb } from "lucide-react";

interface FlowGuideProps {
  stage: CreationStage;
  input: StageProgressInput;
}

export function FlowGuide({ stage, input }: FlowGuideProps) {
  const hint = getNextStep(stage, input);

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-info/30 px-4 py-2.5 text-sm text-info-foreground sm:mx-6">
      <Lightbulb className="h-4 w-4 shrink-0" />
      <span>{hint}</span>
    </div>
  );
}
