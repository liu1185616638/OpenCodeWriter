/**
 * AppearancePage — 外观设置页（主题、密度、编辑器字号）
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/hooks/useTheme";
import { useAppearance, type Density } from "@/contexts/AppearanceContext";
import { Sun, Moon } from "lucide-react";

export function AppearancePage() {
  const { theme, set } = useTheme();
  const { density, editorFontSize, setDensity, setEditorFontSize } = useAppearance();

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">外观</h2>

      <Card className="rounded-xl border border-border mb-5">
        <CardHeader><CardTitle className="text-base">主题</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <button
              onClick={() => set("light")}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                theme === "light" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Sun className="h-5 w-5" />
              <span className="text-sm font-medium">亮色</span>
            </button>
            <button
              onClick={() => set("dark")}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                theme === "dark" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Moon className="h-5 w-5" />
              <span className="text-sm font-medium">暗色</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border mb-5">
        <CardHeader><CardTitle className="text-base">界面密度</CardTitle></CardHeader>
        <CardContent>
          <Select
            value={density}
            onValueChange={(value) => void setDensity(value as Density)}
          >
            <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">紧凑</SelectItem>
              <SelectItem value="comfortable">舒适</SelectItem>
              <SelectItem value="spacious">宽松</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">控制界面元素的间距和大小</p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border">
        <CardHeader><CardTitle className="text-base">编辑器字号</CardTitle></CardHeader>
        <CardContent>
          <Select
            value={editorFontSize}
            onValueChange={(value) => void setEditorFontSize(value)}
          >
            <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="14">14px — 小</SelectItem>
              <SelectItem value="16">16px — 默认</SelectItem>
              <SelectItem value="18">18px — 大</SelectItem>
              <SelectItem value="20">20px — 特大</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">正文编辑器的显示字号</p>
        </CardContent>
      </Card>
    </div>
  );
}
