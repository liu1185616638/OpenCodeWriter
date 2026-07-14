/**
 * StatusBar — 底部状态栏
 *
 * 高度 24px。显示连接状态、字数统计和版本信息。
 * 匹配 Pencil 设计中的 Application Status Bar。
 */

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

interface StatusBarProps {
  wordCount?: number;
  chapterCount?: number;
  modelPresetName?: string;
  connected: boolean;
}

export function StatusBar({
  wordCount,
  chapterCount,
  modelPresetName,
  connected,
}: StatusBarProps) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
  }, []);

  return (
    <div
      className="flex items-center justify-between shrink-0 select-none"
      style={{
        height: 24,
        backgroundColor: "var(--nav)",
        padding: "0 12px",
        fontSize: 11,
        color: "var(--text-muted)",
      }}
    >
      {/* Left: connection status */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%",
              backgroundColor: connected ? "var(--success)" : "var(--danger)",
            }}
          />
          {connected ? "已配置" : "未配置"}
        </span>
        {modelPresetName && (
          <span style={{ color: "var(--text-muted)" }}>
            {modelPresetName}
          </span>
        )}
      </div>

      {/* Right: word count and chapter count */}
      <div className="flex items-center gap-3">
        {wordCount != null && (
          <span>
            {wordCount.toLocaleString()} 字
          </span>
        )}
        {chapterCount != null && (
          <span>
            {chapterCount} 章
          </span>
        )}
        {version && (
          <span style={{ color: "var(--text-muted)" }}>
            OpenCodeWriter v{version}
          </span>
        )}
      </div>
    </div>
  );
}
