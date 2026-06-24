import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelPreset } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Step = 1 | 2 | 3;

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [apiBase, setApiBase] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("gpt-4o");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const preset = await invoke<ModelPreset>("create_model_preset", {
        name: "默认预设",
        apiBase,
        apiKey,
        modelName,
      });
      await invoke("set_setting", {
        key: "current_preset_id",
        value: String((preset as ModelPreset).id),
      });
      await invoke("set_setting", {
        key: "setup_complete",
        value: "true",
      });
      setSuccess(true);
      setTimeout(onComplete, 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <Card className="w-[470px] rounded-3xl border border-border shadow-lg">
        <CardHeader className="px-10 pt-6 pb-4">
          <CardTitle className="text-xl font-medium text-foreground">
            OpenCodeWriter 配置向导
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            配置 AI 模型以开始创作
          </p>
        </CardHeader>
        <CardContent className="px-10 py-5 space-y-3">
          <p className="text-sm font-medium text-primary">
            步骤 {step}/3{step === 1 ? "：API 地址" : step === 2 ? "：API Key" : "：模型名称"}
          </p>

          {step === 1 && (
            <>
              <label className="text-sm text-muted-foreground">API 地址</label>
              <Input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                支持所有 OpenAI 兼容 API（如 DeepSeek、Ollama 等）
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <label className="text-sm text-muted-foreground">API Key</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="rounded-xl"
              />
            </>
          )}
          {step === 3 && (
            <>
              <label className="text-sm text-muted-foreground">模型名称</label>
              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gpt-4o"
                className="rounded-xl"
              />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert>
                  <AlertDescription className="text-success-foreground">
                    连接成功！即将进入项目列表...
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>

        <div className="px-10 py-5 flex gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((step - 1) as Step)} className="rounded-full flex-1">
              上一步
            </Button>
          )}
          {step < 3 && (
            <Button onClick={() => setStep((step + 1) as Step)} className="rounded-full flex-1">
              下一步
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleTest} disabled={testing} className="rounded-full flex-1">
              {testing ? "测试中..." : "连接测试"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
