/**
 * WindowControls — 自定义窗口控制按钮
 *
 * decorations:false 下提供最小化、最大化/恢复和关闭。
 * 按钮自身不能在 drag region 内，否则点击会被拖动拦截。
 */

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});

    const unlistenPromise = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    });

    return () => {
      unlistenPromise.then(fn => fn()).catch(() => {});
    };
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize().catch(() => {});
  };

  const handleToggleMaximize = () => {
    getCurrentWindow().toggleMaximize().catch(() => {});
  };

  const handleClose = () => {
    getCurrentWindow().close().catch(() => {});
  };

  const btnStyle: React.CSSProperties = {
    width: 36,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "var(--text-muted)",
    transition: "background-color 0.15s",
  };

  return (
    <div className="flex items-center shrink-0" style={{ marginLeft: 4 }}>
      <button
        onClick={handleMinimize}
        style={btnStyle}
        title="最小化"
        aria-label="最小化"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <Minus style={{ width: 14, height: 14 }} />
      </button>
      <button
        onClick={handleToggleMaximize}
        style={btnStyle}
        title={maximized ? "恢复" : "最大化"}
        aria-label={maximized ? "恢复" : "最大化"}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        {maximized ? (
          <Copy style={{ width: 12, height: 12, transform: "scaleX(-1)" }} />
        ) : (
          <Square style={{ width: 12, height: 12 }} />
        )}
      </button>
      <button
        onClick={handleClose}
        style={{ ...btnStyle, borderRadius: 0 }}
        title="关闭"
        aria-label="关闭"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#e81123";
          e.currentTarget.style.color = "#FFFFFF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
