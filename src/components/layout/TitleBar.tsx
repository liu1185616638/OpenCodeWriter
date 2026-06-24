import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export interface TitleBarActions {
  onNewProject: () => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}

export function TitleBar({ actions }: { actions: TitleBarActions }) {
  const [maximized, setMaximized] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  const handleAction = (action: string) => {
    switch (action) {
      case "new-project":
        actions.onNewProject();
        break;
      case "quit":
        appWindow.close();
        break;
      case "undo":
        document.execCommand("undo");
        break;
      case "redo":
        document.execCommand("redo");
        break;
      case "cut":
        document.execCommand("cut");
        break;
      case "copy":
        document.execCommand("copy");
        break;
      case "paste":
        document.execCommand("paste");
        break;
      case "toggle-theme":
        actions.onToggleTheme();
        break;
      case "toggle-sidebar":
        actions.onToggleSidebar();
        break;
      case "shortcuts":
        setShortcutsOpen(true);
        break;
      case "about":
        setAboutOpen(true);
        break;
    }
  };

  return (
    <>
      <div
        data-tauri-drag-region
        className="h-9 flex items-center bg-background select-none shrink-0"
      >
        {/* 菜单栏 */}
        <div className="flex items-center gap-0 px-1">
          <MenuDropdown label="文件" onAction={handleAction} items={[
            { label: "新建项目", action: "new-project", shortcut: "Ctrl+N" },
            { separator: true },
            { label: "退出", action: "quit" },
          ]} />
          <MenuDropdown label="编辑" onAction={handleAction} items={[
            { label: "撤销", action: "undo", shortcut: "Ctrl+Z" },
            { label: "重做", action: "redo", shortcut: "Ctrl+Y" },
            { separator: true },
            { label: "剪切", action: "cut", shortcut: "Ctrl+X" },
            { label: "复制", action: "copy", shortcut: "Ctrl+C" },
            { label: "粘贴", action: "paste", shortcut: "Ctrl+V" },
          ]} />
          <MenuDropdown label="视图" onAction={handleAction} items={[
            { label: "切换主题", action: "toggle-theme", shortcut: "Ctrl+T" },
            { label: "切换侧边栏", action: "toggle-sidebar" },
          ]} />
          <MenuDropdown label="帮助" onAction={handleAction} items={[
            { label: "快捷键", action: "shortcuts" },
            { separator: true },
            { label: "关于", action: "about" },
          ]} />
        </div>

        {/* 中间拖拽区域 */}
        <div data-tauri-drag-region className="flex-1 h-full" />

        {/* 窗口控制按钮 */}
        <div className="flex items-center h-full">
          <button
            onClick={handleMinimize}
            className="h-full w-11 flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="最小化"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" className="fill-current">
              <rect width="10" height="1" />
            </svg>
          </button>
          <button
            onClick={handleToggleMaximize}
            className="h-full w-11 flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="最大化"
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current">
                <path d="M0 2h2v-2h8v8h-2v2h-8v-8h2zm6 0v4h-4v2h6v-6h-2zm-4-2v4h4v-4h-4z" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current">
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button
            onClick={handleClose}
            className="h-full w-11 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
            aria-label="关闭"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current">
              <path d="M0.5 0.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      {/* 快捷键对话框 */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>快捷键</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {SHORTCUTS.map(({ keys, desc }) => (
              <div key={keys} className="flex justify-between py-1 border-b border-border last:border-0">
                <span>{desc}</span>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{keys}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 关于对话框 */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>关于 OpenCodeWriter</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="font-bold text-lg text-primary">OpenCodeWriter</p>
            <p className="text-muted-foreground">版本 0.1.0</p>
            <p>AI 驱动的小说创作工具</p>
            <p className="text-muted-foreground text-xs mt-4">基于 Tauri + React 构建</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface MenuItem {
  label?: string;
  action?: string;
  shortcut?: string;
  separator?: boolean;
}

function MenuDropdown({ label, items, onAction }: { label: string; items: MenuItem[]; onAction: (action: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="px-3 py-1 text-sm hover:bg-accent rounded-sm transition-colors">
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {items.map((item, i) =>
          item.separator ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DropdownMenuItem key={item.action} onClick={() => onAction(item.action!)}>
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="ml-4 text-xs text-muted-foreground">{item.shortcut}</span>
              )}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SHORTCUTS = [
  { keys: "Ctrl+N", desc: "新建项目" },
  { keys: "Ctrl+P", desc: "切换项目列表" },
  { keys: "Ctrl+,", desc: "打开设置" },
  { keys: "Ctrl+T", desc: "切换主题" },
  { keys: "Ctrl+1-4", desc: "切换创作阶段" },
  { keys: "Ctrl+G", desc: "AI 生成" },
  { keys: "Ctrl+M", desc: "切换模型预设" },
  { keys: "Ctrl+S", desc: "保存当前内容" },
  { keys: "Ctrl+Z", desc: "撤销" },
  { keys: "Ctrl+Y", desc: "重做" },
];
