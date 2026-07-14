/**
 * SetupWizard — Carbon Frost 首次配置向导
 *
 * 三步向导：API 地址 → API Key → 模型确认
 * "测试连接"只测试，不立即完成向导
 * 用户确认后才调用 complete_setup 事务化完成
 * 成功页明确进入"创建第一本书"
 */

import { useState } from "react";
import {
  testModelConnection,
  completeSetup,
} from "@/lib/tauri";
import {
  Loader2, Check, ArrowRight, ArrowLeft, Eye, EyeOff,
  AlertCircle, Sparkles,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4; // 4 = success

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [apiBase, setApiBase] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("gpt-4o");
  const [showKey, setShowKey] = useState(false);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Complete setup state
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const returnedModel = await testModelConnection(apiBase, apiKey, modelName);
      setTestResult(returnedModel);
    } catch (e) {
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      await completeSetup("默认预设", apiBase, apiKey, modelName);
      setStep(4);
    } catch (e) {
      setCompleteError(String(e));
    } finally {
      setCompleting(false);
    }
  };

  const canTest = apiBase.trim() && apiKey.trim() && modelName.trim() && !testing;
  const canComplete = testResult != null && !completing;

  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      <div
        className="flex flex-col rounded-lg border"
        style={{
          width: 560,
          padding: 0,
          backgroundColor: "var(--surface)",
          borderColor: "var(--border-strong)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-col gap-1 border-b"
          style={{
            padding: "24px 32px 16px",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 28, height: 28,
                backgroundColor: "var(--accent)",
              }}
            >
              <Sparkles style={{ width: 14, height: 14, color: "#FFFFFF" }} />
            </div>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              OpenCodeWriter 配置
            </h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            配置 AI 模型以开始创作。所有数据保存在本地。
          </p>
        </div>

        {/* Step indicator */}
        <div
          className="flex items-center gap-2"
          style={{ padding: "16px 32px" }}
        >
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 22, height: 22,
                  fontSize: 11, fontWeight: 600,
                  backgroundColor:
                    step >= s ? "var(--accent)" : "var(--surface-raised)",
                  color: step >= s ? "#FFFFFF" : "var(--text-muted)",
                  border: step >= s ? "none" : "1px solid var(--border)",
                }}
              >
                {step > s ? <Check style={{ width: 12, height: 12 }} /> : s}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: step >= s ? "var(--text-secondary)" : "var(--text-muted)",
                  fontWeight: step === s ? 500 : 400,
                }}
              >
                {s === 1 ? "API 地址" : s === 2 ? "API Key" : "模型确认"}
              </span>
              {s < 3 && (
                <div
                  style={{
                    width: 32, height: 1,
                    backgroundColor: step > s ? "var(--accent)" : "var(--border)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: "0 32px 8px" }}>
          {/* Step 1: API Address */}
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  API 地址
                </label>
                <input
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                }}
              >
                支持所有 OpenAI 兼容 API，包括：
                <br />
                · OpenAI: https://api.openai.com/v1
                <br />
                · DeepSeek: https://api.deepseek.com/v1
                <br />
                · 本地 Ollama: http://localhost:11434/v1
              </div>
            </div>
          )}

          {/* Step 2: API Key */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  API Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="flex items-center justify-center rounded-md transition-colors"
                    style={{
                      width: 32, height: 32,
                      border: "1px solid var(--border)",
                      background: "var(--canvas)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                    }}
                    title={showKey ? "隐藏" : "显示"}
                  >
                    {showKey ? (
                      <EyeOff style={{ width: 14, height: 14 }} />
                    ) : (
                      <Eye style={{ width: 14, height: 14 }} />
                    )}
                  </button>
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                }}
              >
                Key 仅保存在本地数据库，不会上传。
                <br />
                本地 Ollama 可留空。
              </div>
            </div>
          )}

          {/* Step 3: Model Confirmation */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  模型名称
                </label>
                <input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="gpt-4o"
                  style={inputStyle}
                  autoFocus
                />
              </div>

              {/* Test connection section */}
              <div
                className="flex flex-col gap-2 rounded-md border"
                style={{
                  padding: 12,
                  borderColor: "var(--border)",
                  backgroundColor: "var(--canvas)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    连接测试
                  </span>
                  <button
                    onClick={handleTest}
                    disabled={!canTest}
                    className="flex items-center gap-2 rounded-md transition-colors disabled:opacity-40"
                    style={{
                      height: 30,
                      padding: "0 12px",
                      backgroundColor: "var(--surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-strong)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: canTest ? "pointer" : "not-allowed",
                    }}
                  >
                    {testing ? (
                      <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
                    ) : (
                      <Check style={{ width: 12, height: 12 }} />
                    )}
                    {testing ? "测试中…" : "测试连接"}
                  </button>
                </div>

                {/* Test result */}
                {testError && (
                  <div
                    className="flex items-start gap-2"
                    style={{
                      fontSize: 12,
                      color: "var(--danger)",
                      padding: "8px 10px",
                      borderRadius: 4,
                      backgroundColor: "var(--danger-soft)",
                    }}
                  >
                    <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                    <span style={{ wordBreak: "break-word" }}>{testError}</span>
                  </div>
                )}
                {testResult && !testError && (
                  <div
                    className="flex items-center gap-2"
                    style={{
                      fontSize: 12,
                      color: "var(--success)",
                      padding: "8px 10px",
                      borderRadius: 4,
                      backgroundColor: "var(--success-soft)",
                    }}
                  >
                    <Check style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span>
                      连接成功！模型：{testResult}
                    </span>
                  </div>
                )}
              </div>

              {/* Complete error */}
              {completeError && (
                <div
                  className="flex items-start gap-2"
                  style={{
                    fontSize: 12,
                    color: "var(--danger)",
                    padding: "8px 10px",
                    borderRadius: 4,
                    backgroundColor: "var(--danger-soft)",
                  }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                  <span style={{ wordBreak: "break-word" }}>{completeError}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div
              className="flex flex-col items-center gap-4 text-center"
              style={{ padding: "32px 0" }}
            >
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 48, height: 48,
                  backgroundColor: "var(--success-soft)",
                }}
              >
                <Check style={{ width: 24, height: 24, color: "var(--success)" }} />
              </div>
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  配置完成
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  模型 {modelName} 已就绪
                </p>
              </div>
              <button
                onClick={onComplete}
                className="flex items-center gap-2 rounded-md transition-colors"
                style={{
                  height: 36,
                  padding: "0 20px",
                  backgroundColor: "var(--accent)",
                  color: "#FFFFFF",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                创建第一本书
                <ArrowRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </div>

        {/* Footer: navigation buttons */}
        {step < 4 && (
          <div
            className="flex items-center justify-between border-t"
            style={{
              padding: "16px 32px",
              borderColor: "var(--border)",
            }}
          >
            <button
              onClick={() => step > 1 && setStep((step - 1) as Step)}
              disabled={step === 1}
              className="flex items-center gap-1 rounded-md transition-colors disabled:opacity-30"
              style={{
                height: 32,
                padding: "0 12px",
                background: "transparent",
                border: "1px solid transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: step === 1 ? "default" : "pointer",
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              上一步
            </button>

            {step < 3 && (
              <button
                onClick={() => setStep((step + 1) as Step)}
                disabled={step === 1 ? !apiBase.trim() : step === 2 ? !apiKey.trim() : !modelName.trim()}
                className="flex items-center gap-1 rounded-md transition-colors disabled:opacity-40"
                style={{
                  height: 32,
                  padding: "0 14px",
                  backgroundColor: "var(--accent)",
                  color: "#FFFFFF",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                下一步
                <ArrowRight style={{ width: 14, height: 14 }} />
              </button>
            )}

            {step === 3 && (
              <button
                onClick={handleComplete}
                disabled={!canComplete}
                className="flex items-center gap-1 rounded-md transition-colors disabled:opacity-40"
                style={{
                  height: 32,
                  padding: "0 14px",
                  backgroundColor: "var(--accent)",
                  color: "#FFFFFF",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: canComplete ? "pointer" : "not-allowed",
                }}
              >
                {completing ? (
                  <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                ) : null}
                {completing ? "保存中…" : "确认并完成"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--canvas)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--font-ui)",
};
