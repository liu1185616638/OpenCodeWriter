/**
 * McpPermissionsPage — 工具与权限设置页（MCP 实验性）
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listMcpServers, saveMcpServers, listMcpTools, listMcpCallLogs,
} from "@/lib/tauri";
import type { McpServerConfig, McpToolInfo, McpCallLog } from "@/types";
import {
  Plus, Trash2, Save, Loader2,
  AlertCircle, ShieldCheck, Beaker,
} from "lucide-react";

export function McpPermissionsPage() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [logs, setLogs] = useState<McpCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [serverList, toolList, logList] = await Promise.all([
        listMcpServers(),
        listMcpTools(),
        listMcpCallLogs(20),
      ]);
      setServers(serverList);
      setTools(toolList);
      setLogs(logList);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addServer = () => {
    setServers(prev => [
      ...prev,
      {
        name: "",
        command: "",
        args: "",
        enabled: false,
        allowed_tools: [],
        require_approval: true,
      },
    ]);
  };

  const updateServer = (index: number, patch: Partial<McpServerConfig>) => {
    setServers(prev => prev.map((server, i) => i === index ? { ...server, ...patch } : server));
  };

  const removeServer = (index: number) => {
    setServers(prev => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await saveMcpServers(servers);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">工具与权限</h2>
        <Badge variant="secondary" className="gap-1">
          <Beaker className="h-3 w-3" />实验性
        </Badge>
      </div>

      {/* Experimental notice */}
      <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-500">
            <p className="font-medium">MCP 当前为实验性功能</p>
            <p className="text-xs mt-1">
              由于 SDK 尚未提供稳定的 MCP 接入接口，当前版本仅支持配置和白名单管理，
              真实外部 MCP 工具调用链不完整。配置的 MCP 服务器在 SDK 支持前不会执行。
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">MCP Server</CardTitle>
              <Button onClick={addServer} size="sm" className="rounded-full gap-1.5">
                <Plus className="h-4 w-4" />新增
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {servers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  MCP 未启用
                </div>
              ) : (
                servers.map((server, index) => (
                  <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        value={server.name}
                        onChange={(e) => updateServer(index, { name: e.target.value })}
                        placeholder="名称"
                        className="rounded-xl"
                      />
                      <Input
                        value={server.command}
                        onChange={(e) => updateServer(index, { command: e.target.value })}
                        placeholder="命令"
                        className="rounded-xl"
                      />
                    </div>
                    <Input
                      value={server.args}
                      onChange={(e) => updateServer(index, { args: e.target.value })}
                      placeholder="参数"
                      className="rounded-xl"
                    />
                    <Input
                      value={server.allowed_tools.join(", ")}
                      onChange={(e) => updateServer(index, {
                        allowed_tools: e.target.value
                          .split(/[\n,]/)
                          .map(item => item.trim())
                          .filter(Boolean),
                      })}
                      placeholder="工具白名单，逗号分隔"
                      className="rounded-xl"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={server.enabled}
                            onChange={(e) => updateServer(index, { enabled: e.target.checked })}
                          />
                          启用
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={server.require_approval}
                            onChange={(e) => updateServer(index, { require_approval: e.target.checked })}
                          />
                          需要审批
                        </label>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={() => removeServer(index)} title="删除服务器">
                        <Trash2 className="h-4 w-4" />删除
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <Button onClick={save} disabled={saving} className="w-full rounded-full gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存 MCP 配置
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">已配置工具</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无可用 MCP 工具</p>
              ) : (
                tools.map((tool) => (
                  <div key={`${tool.server_name}:${tool.tool_name}`} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{tool.tool_name}</p>
                      <p className="text-xs text-muted-foreground">{tool.server_name}</p>
                    </div>
                    <Badge variant={tool.enabled ? "default" : "secondary"}>
                      {tool.requires_approval ? "审批" : "允许"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">MCP 审计</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无记录</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{log.tool_name}</p>
                      <Badge variant={log.success ? "default" : "destructive"}>{log.call_type}</Badge>
                    </div>
                    {log.error && <p className="mt-1 text-xs text-destructive">{log.error}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{log.created_at}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
