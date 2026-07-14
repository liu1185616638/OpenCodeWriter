/**
 * ShortcutsPage — 快捷键设置页
 */

import { Card, CardContent } from "@/components/ui/card";

const shortcuts = [
  { key: "Ctrl+N", desc: "新建项目" },
  { key: "Ctrl+,", desc: "打开设置" },
  { key: "Ctrl+T", desc: "切换主题" },
  { key: "Ctrl+S", desc: "保存当前内容" },
  { key: "Ctrl+G", desc: "AI 生成" },
  { key: "Ctrl+M", desc: "切换模型" },
  { key: "Ctrl+P", desc: "切换项目" },
  { key: "Ctrl+1", desc: "跳转到大纲" },
  { key: "Ctrl+2", desc: "跳转到人物" },
  { key: "Ctrl+3", desc: "跳转到章节" },
  { key: "Ctrl+4", desc: "跳转到正文" },
];

export function ShortcutsPage() {
  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">快捷键</h2>
      <Card className="rounded-3xl border border-border shadow-sm">
        <CardContent className="divide-y divide-border">
          {shortcuts.map(s => (
            <div key={s.key} className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground">{s.desc}</span>
              <kbd className="inline-flex items-center rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">{s.key}</kbd>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
