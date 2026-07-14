/**
 * API: MCP — 模型上下文协议服务器、工具、审批
 */

import { invoke } from "@tauri-apps/api/core";
import type { McpServerConfig, McpToolInfo, McpApprovalRequest, McpCallLog } from "@/types";

export async function listMcpServers(): Promise<McpServerConfig[]> {
  return invoke("list_mcp_servers");
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  return invoke("save_mcp_servers", { servers });
}

export async function listMcpTools(): Promise<McpToolInfo[]> {
  return invoke("list_mcp_tools");
}

export async function approveMcpCall(request: McpApprovalRequest): Promise<void> {
  return invoke("approve_mcp_call", { request });
}

export async function denyMcpCall(request: McpApprovalRequest, reason: string): Promise<void> {
  return invoke("deny_mcp_call", { request, reason });
}

export async function listMcpCallLogs(limit?: number): Promise<McpCallLog[]> {
  return invoke("list_mcp_call_logs", { limit });
}
