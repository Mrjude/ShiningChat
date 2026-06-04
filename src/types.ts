/**
 * 类型定义 - ShiningChat
 */

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export type IntentType = '退款' | '查询订单' | '技术支持' | '转人工' | null;

export interface Model {
  modelId: string;
  name: string;
  description?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  contentBlocks?: ContentBlock[];
  intent?: IntentType;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  intent?: IntentType;
  escalated?: boolean;
  status?: string;
  userRating?: number | null;
  userFeedback?: string | null;
  createdAt: Date;
  messages: Message[];
}

export interface CustomAgent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  icon?: string;
  color?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  updatedAt: Date;
}

export type Agent = CustomAgent;
export type Theme = 'light' | 'dark';

export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

export interface PermissionResponse {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string;
}

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords?: string | null;
  priority: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  escalatedSessions: number;
  avgRating: number | null;
  intentDistribution: Array<{ intent: string; count: number }>;
  dailyStats: Array<{ date: string; sessions: number; avg_rating: number | null }>;
  recentSessions: Array<{
    id: string;
    title: string;
    intent: string | null;
    escalated: number;
    status: string;
    user_rating: number | null;
    created_at: string;
    updated_at: string;
  }>;
}

// 快捷回复项
export interface QuickReply {
  id: string;
  text: string;
  intent?: IntentType;
  icon?: string;
}
