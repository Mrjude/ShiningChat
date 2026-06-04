import express from "express";
import { query, unstable_v2_createSession, unstable_v2_authenticate, PermissionResult, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import * as db from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 待处理的权限请求
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

const pendingPermissions = new Map<string, PendingPermission>();
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// 缓存可用模型列表
let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];
const defaultModel = "claude-sonnet-4";

// 意图关键词映射
const INTENT_KEYWORDS: Record<string, string[]> = {
  '退款': ['退款', '退钱', '退货', '退单', '退回', '取消订单', '不想要', '退费', '部分退款'],
  '查询订单': ['订单', '物流', '快递', '发货', '到货', '配送', '收货', '查询', '在哪', '什么时候到', '运单'],
  '技术支持': ['登录', '支付', '付款', '无法', '失败', '错误', 'bug', '闪退', '卡顿', '打不开', '页面', '加载'],
  '转人工': ['人工', '真人', '客服人员', '转人工', '人工客服', '不想和机器人', '找人工'],
};

// 识别用户意图
function detectIntent(message: string): string | null {
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        return intent;
      }
    }
  }
  return null;
}

// 构建客服系统提示词（包含FAQ知识库上下文）
function buildCustomerServicePrompt(userMessage: string): string {
  // 搜索相关FAQ
  const relatedFaq = db.searchFaq(userMessage);
  const faqContext = relatedFaq.length > 0
    ? relatedFaq.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
    : '暂无匹配的FAQ';

  return `你是"ShiningChat"智能客服助手，负责为用户提供专业、友好的客户服务。

## 你的核心能力
1. **FAQ知识库检索**：根据用户问题匹配FAQ答案
2. **意图识别**：判断用户意图（退款/查询订单/技术支持/转人工）
3. **自动转人工**：当无法解决用户问题时，主动引导转接人工客服

## 当前匹配的FAQ知识库
${faqContext}

## 回答规则
1. 优先从FAQ知识库中查找答案，如果匹配到相关FAQ，请基于FAQ内容回答
2. 回答时要自然、友好，不要直接复制FAQ原文，而是用亲切的语气重新组织
3. 如果FAQ中没有匹配的答案，运用你的知识尽量帮助用户
4. 当遇到以下情况时，主动建议转接人工客服：
   - 用户明确要求转人工
   - 涉及具体金额退款处理
   - 涉及账户安全问题
   - 你无法确定答案的问题
5. 建议转人工时，请说："这个问题我帮您转接人工客服，请稍等..."
6. 在回答末尾，如适用，添加意图标签：[意图:退款] [意图:查询订单] [意图:技术支持] [意图:转人工]
7. 保持回答简洁，通常不超过3-4句话
8. 使用中文回答`;
}

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============= 登录与配置 API =============

type LoginMethod = 'env' | 'cli' | 'none';

interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string;
  envVars?: {
    apiKey?: string;
    authToken?: string;
    internetEnv?: string;
    baseUrl?: string;
  };
}

app.get("/api/check-login", async (req, res) => {
  const response: LoginStatusResponse = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {},
  };

  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;

  if (apiKey || authToken) {
    response.envConfigured = true;
    if (apiKey) {
      response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
      response.apiKey = response.envVars!.apiKey;
    }
    if (authToken) {
      response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    }
    if (internetEnv) response.envVars!.internetEnv = internetEnv;
    if (baseUrl) response.envVars!.baseUrl = baseUrl;
  }

  try {
    let needsLogin = false;
    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async () => {
        needsLogin = true;
        response.error = '未登录，请先登录 CodeBuddy CLI';
      }
    });

    if (!needsLogin && result?.userinfo) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    } else if (!needsLogin) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    }
  } catch (error: any) {
    if (response.envConfigured) {
      response.isLoggedIn = true;
      response.method = 'env';
    } else {
      response.error = error?.message || String(error);
      response.method = 'none';
    }
  }

  res.json(response);
});

app.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;
  if (!apiKey && !authToken) {
    return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  }

  const configuredVars: string[] = [];
  if (apiKey) { process.env.CODEBUDDY_API_KEY = apiKey; configuredVars.push('CODEBUDDY_API_KEY'); }
  if (authToken) { process.env.CODEBUDDY_AUTH_TOKEN = authToken; configuredVars.push('CODEBUDDY_AUTH_TOKEN'); }
  if (internetEnv) { process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv; configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT'); }
  if (baseUrl) { process.env.CODEBUDDY_BASE_URL = baseUrl; configuredVars.push('CODEBUDDY_BASE_URL'); }

  cachedModels = [];
  res.json({ success: true, message: `已设置: ${configuredVars.join(', ')}` });
});

app.get("/api/models", async (req, res) => {
  try {
    if (cachedModels.length === 0) {
      const session = await unstable_v2_createSession({ cwd: process.cwd() });
      const models = await session.getAvailableModels();
      if (models && Array.isArray(models)) cachedModels = models;
    }
    res.json({
      models: cachedModels.length > 0 ? cachedModels : [{ modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }],
      defaultModel
    });
  } catch (error: any) {
    res.json({
      models: [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { modelId: "claude-opus-4", name: "Claude Opus 4" }
      ],
      defaultModel,
      error: error?.message || String(error)
    });
  }
});

// ============= FAQ 知识库 API =============

// 获取所有FAQ（支持分类筛选）
app.get("/api/faq", (req, res) => {
  try {
    const { category } = req.query;
    const items = category
      ? db.getFaqByCategory(category as string)
      : db.getAllFaqItems();
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取FAQ失败" });
  }
});

// 搜索FAQ
app.get("/api/faq/search", (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ items: [] });
    const items = db.searchFaq(q as string);
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "搜索FAQ失败" });
  }
});

// 创建FAQ
app.post("/api/faq", (req, res) => {
  try {
    const { category, question, answer, keywords, priority } = req.body;
    const now = new Date().toISOString();
    const item = db.createFaqItem({
      id: uuidv4(), category, question, answer,
      keywords: keywords || null, priority: priority || 0,
      enabled: 1, created_at: now, updated_at: now
    });
    res.json({ item });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "创建FAQ失败" });
  }
});

// 更新FAQ
app.patch("/api/faq/:id", (req, res) => {
  try {
    const { id } = req.params;
    const success = db.updateFaqItem(id, req.body);
    if (!success) return res.status(404).json({ error: "FAQ不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新FAQ失败" });
  }
});

// 删除FAQ
app.delete("/api/faq/:id", (req, res) => {
  try {
    const { id } = req.params;
    const success = db.deleteFaqItem(id);
    if (!success) return res.status(404).json({ error: "FAQ不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除FAQ失败" });
  }
});

// ============= 会话 API =============

app.get("/api/sessions", (req, res) => {
  try {
    const sessions = db.getAllSessions();
    const sessionsWithMessages = sessions.map(session => {
      const messages = db.getMessagesBySession(session.id);
      return { ...session, messageCount: messages.length };
    });
    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

app.get("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "会话不存在" });

    const messages = db.getMessagesBySession(sessionId);
    const parsedMessages = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));
    res.json({ session, messages: parsedMessages });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

app.post("/api/sessions", (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();
    const session = db.createSession({
      id: uuidv4(), title, model,
      sdk_session_id: null, intent: null,
      escalated: 0, escalated_at: null,
      status: 'active', user_rating: null, user_feedback: null,
      created_at: now, updated_at: now
    });
    res.json({ session });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "创建会话失败" });
  }
});

app.patch("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.updateSession(sessionId, req.body);
    if (!success) return res.status(404).json({ error: "会话不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新会话失败" });
  }
});

app.delete("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.deleteSession(sessionId);
    if (!success) return res.status(404).json({ error: "会话不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除会话失败" });
  }
});

// ============= 满意度评价 API =============

app.post("/api/ratings", (req, res) => {
  try {
    const { sessionId, rating, feedback } = req.body;
    if (!sessionId || !rating) return res.status(400).json({ error: "缺少必要参数" });

    const ratingRecord = db.createRating({
      id: uuidv4(), session_id: sessionId,
      rating, feedback: feedback || null,
      created_at: new Date().toISOString()
    });
    res.json({ rating: ratingRecord });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "提交评价失败" });
  }
});

app.get("/api/ratings/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const ratings = db.getRatingsBySession(sessionId);
    res.json({ ratings });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取评价失败" });
  }
});

// ============= 管理后台统计 API =============

app.get("/api/admin/stats", (req, res) => {
  try {
    const stats = db.getDashboardStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取统计失败" });
  }
});

// ============= 聊天 API =============

app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  const pending = pendingPermissions.get(requestId);
  if (!pending) return res.status(404).json({ error: "权限请求不存在或已超时" });

  pendingPermissions.delete(requestId);
  if (behavior === 'allow') {
    pending.resolve({ behavior: 'allow', updatedInput: pending.input });
  } else {
    pending.resolve({ behavior: 'deny', message: message || '用户拒绝了此操作' });
  }
  res.json({ success: true });
});

// 发送消息并获取流式响应
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;

  console.log(`\n[Chat] ========== 新请求 ==========`);
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}`);

  if (!message) return res.status(400).json({ error: "消息不能为空" });

  // 意图识别
  const detectedIntent = detectIntent(message);
  console.log(`[Chat] 检测到意图: ${detectedIntent || '未识别'}`);

  // 获取或创建会话
  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();

  if (!session) {
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,
      intent: detectedIntent,
      escalated: detectedIntent === '转人工' ? 1 : 0,
      escalated_at: detectedIntent === '转人工' ? now : null,
      status: 'active',
      user_rating: null,
      user_feedback: null,
      created_at: now,
      updated_at: now
    });
  } else {
    // 更新意图
    if (detectedIntent && detectedIntent !== session.intent) {
      db.updateSession(session.id, { intent: detectedIntent });
    }
    // 处理转人工
    if (detectedIntent === '转人工' && !session.escalated) {
      db.updateSession(session.id, { escalated: 1, escalated_at: now });
    }
  }

  const selectedModel = model || session.model;
  const sdkSessionId = session.sdk_session_id;
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息
  try {
    db.createMessage({
      id: userMessageId, session_id: session.id,
      role: 'user', content: message,
      model: null, intent: detectedIntent,
      created_at: now, tool_calls: null
    });
  } catch (dbError: any) {
    return res.status(500).json({ error: "保存消息失败", detail: dbError?.message });
  }

  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 构建客服系统提示词（自动注入FAQ上下文）
  const csSystemPrompt = systemPrompt || buildCustomerServicePrompt(message);
  const workingDir = cwd || process.cwd();

  // 发送意图信息
  res.write(`data: ${JSON.stringify({
    type: "intent",
    intent: detectedIntent,
    escalated: detectedIntent === '转人工'
  })}\n\n`);

  try {
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      if (permissionMode === 'bypassPermissions') {
        return { behavior: 'allow', updatedInput: input };
      }

      const requestId = uuidv4();
      res.write(`data: ${JSON.stringify({
        type: "permission_request",
        requestId, toolUseId: options.toolUseID,
        toolName, input, sessionId: session.id, timestamp: Date.now()
      })}\n\n`);

      return new Promise<PermissionResult>((resolve) => {
        const pending: PendingPermission = {
          resolve, reject: () => {}, toolName, input,
          sessionId: session.id, timestamp: Date.now()
        };
        pendingPermissions.set(requestId, pending);
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            resolve({ behavior: 'deny', message: '权限请求超时' });
          }
        }, PERMISSION_TIMEOUT);
      });
    };

    const stream = query({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: csSystemPrompt,
        permissionMode: permissionMode || 'default',
        canUseTool,
        ...(sdkSessionId ? { resume: sdkSessionId } : {})
      }
    });

    let fullResponse = "";
    let toolCalls: Array<{
      id: string; name: string; input?: Record<string, unknown>;
      status: string; result?: string; isError?: boolean;
    }> = [];
    let newSdkSessionId: string | null = null;

    res.write(`data: ${JSON.stringify({
      type: "init", sessionId: session.id,
      userMessageId, assistantMessageId, model: selectedModel
    })}\n\n`);

    let currentToolId: string | null = null;

    for await (const msg of stream) {
      if (msg.type === "system" && (msg as any).subtype === "init") {
        newSdkSessionId = (msg as any).session_id;
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;
        if (typeof content === "string") {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullResponse += block.text;
              res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
            } else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const toolInput = (block as any).input || {};
              const toolCall = { id: currentToolId, name: block.name, input: toolInput, status: "running" };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ type: "tool", id: toolCall.id, name: toolCall.name, input: toolInput, status: toolCall.status })}\n\n`);
            }
          }
        }
      } else if (msg.type === "tool_result") {
        const msgAny = msg as any;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const content = msgAny.content;
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof content === 'string' ? content : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result, isError })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        toolCalls.forEach(tool => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" })}\n\n`);
          }
        });
        res.write(`data: ${JSON.stringify({ type: "done", duration: msg.duration, cost: msg.cost })}\n\n`);
      }
    }

    // 保存助手消息
    db.createMessage({
      id: assistantMessageId, session_id: session.id,
      role: 'assistant', content: fullResponse,
      model: selectedModel, intent: detectedIntent,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });

    // 更新会话标题
    const messages = db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      db.updateSession(session.id, {
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    res.end();
  } catch (error: any) {
    console.error(`[Chat] Error:`, error?.message);
    res.write(`data: ${JSON.stringify({ type: "error", message: error?.message || "处理请求时发生错误" })}\n\n`);
    res.end();
  }
});

// 启动服务器 - 初始化默认数据
db.initDefaultFaqData();

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║     ShiningChat 服务器已启动                  ║
║                                                ║
║     地址: http://localhost:${PORT}                ║
║     数据库: SQLite (data/chat.db)              ║
║     FAQ知识库: 已就绪                           ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});
