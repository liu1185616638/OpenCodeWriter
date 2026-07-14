/**
 * AboutPage — 关于页（版本、数据目录、SDK Adapter 状态）
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { getSetting } from "@/lib/tauri";
import type { Project } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { Sun, Moon, Info } from "lucide-react";

export function AboutPage({ currentProject: _currentProject }: { currentProject: Project | null }) {
  const { theme, set } = useTheme();
  const [dataDir, setDataDir] = useState<string>("");
  const [sdkAdapterStatus, setSdkAdapterStatus] = useState<string>("检测中...");
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    // Get app version from Tauri
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"));

    // Try to get app data directory
    invoke<string>("get_app_data_dir").then(setDataDir).catch(() => setDataDir("无法获取"));

    // Check SDK adapter status by trying to get runtime settings
    getSetting("ai_runtime_default")
      .then(v => {
        if (v === "sdk-backed") {
          setSdkAdapterStatus("SDK-backed (默认)");
        } else if (v === "openai-compatible") {
          setSdkAdapterStatus("OpenAI-compatible (fallback)");
        } else {
          setSdkAdapterStatus("SDK-backed (默认)");
        }
      })
      .catch(() => setSdkAdapterStatus("无法检测"));
  }, []);

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">关于</h2>

      <Card className="rounded-3xl border border-border shadow-sm mb-5">
        <CardContent className="py-6 space-y-3">
          <div>
            <p className="font-bold text-lg text-primary">OpenCodeWriter</p>
            <p className="text-sm text-muted-foreground">版本 {version || "..."}</p>
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <InfoRow label="描述" value="AI 辅助长篇小说创作桌面工作台" />
            <InfoRow label="技术栈" value="Tauri 2 + React 19 + TypeScript + Rust + SQLite" />
            <InfoRow label="AI 底座" value={sdkAdapterStatus} />
            <InfoRow label="数据目录" value={dataDir} mono />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border shadow-sm mb-5">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4" />SDK Adapter 状态</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            AI 底座默认使用 SDK-backed Runtime，通过本地 Node SDK Adapter 调用 @opencode-ai/sdk。
            当 SDK-backed 启动失败或首帧错误时，自动降级为 OpenAI-compatible fallback。
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            普通用户无需关心 Runtime 选择，此信息仅供排障参考。
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border shadow-sm">
        <CardHeader><CardTitle className="text-base">主题切换</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => set("light")} className="rounded-full gap-1.5">
              <Sun className="h-4 w-4" />亮色
            </Button>
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => set("dark")} className="rounded-full gap-1.5">
              <Moon className="h-4 w-4" />暗色
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground shrink-0" style={{ width: 72 }}>{label}</span>
      <span className={`text-sm text-foreground break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
