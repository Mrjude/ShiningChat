import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'data', 'chat.db');

// 确保 data 目录存在
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(dbPath);

// 启用 WAL 模式以提高性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
db.exec(`
  -- 会话表
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    intent TEXT,
    escalated INTEGER DEFAULT 0,
    escalated_at TEXT,
    status TEXT DEFAULT 'active',
    user_rating INTEGER,
    user_feedback TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 消息表
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT,
    intent TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- FAQ 知识库表
  CREATE TABLE IF NOT EXISTS faq_items (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT,
    priority INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 满意度评价表
  CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- 为会话 ID 创建索引
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_intent ON sessions(intent);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_faq_category ON faq_items(category);
  CREATE INDEX IF NOT EXISTS idx_ratings_session_id ON ratings(session_id);
`);

// 数据库迁移
try {
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const columns = tableInfo.map(col => col.name);

  if (!columns.includes('sdk_session_id')) {
    db.exec("ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT");
  }
  if (!columns.includes('intent')) {
    db.exec("ALTER TABLE sessions ADD COLUMN intent TEXT");
  }
  if (!columns.includes('escalated')) {
    db.exec("ALTER TABLE sessions ADD COLUMN escalated INTEGER DEFAULT 0");
  }
  if (!columns.includes('escalated_at')) {
    db.exec("ALTER TABLE sessions ADD COLUMN escalated_at TEXT");
  }
  if (!columns.includes('status')) {
    db.exec("ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!columns.includes('user_rating')) {
    db.exec("ALTER TABLE sessions ADD COLUMN user_rating INTEGER");
  }
  if (!columns.includes('user_feedback')) {
    db.exec("ALTER TABLE sessions ADD COLUMN user_feedback TEXT");
  }
} catch (e) {
  // 忽略错误
}

// 类型定义
export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  intent: string | null;
  escalated: number;
  escalated_at: string | null;
  status: string;
  user_rating: number | null;
  user_feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  intent: string | null;
  created_at: string;
  tool_calls: string | null;
}

export interface DbFaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string | null;
  priority: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface DbRating {
  id: string;
  session_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
}

// ============= 会话操作 =============

export function getAllSessions(): DbSession[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
  return stmt.all() as DbSession[];
}

export function getSession(id: string): DbSession | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as DbSession | undefined;
}

export function createSession(session: DbSession): DbSession {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, intent, escalated, escalated_at, status, user_rating, user_feedback, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.title, session.model, session.sdk_session_id, session.intent, session.escalated ?? 0, session.escalated_at, session.status ?? 'active', session.user_rating, session.user_feedback, session.created_at, session.updated_at);
  return session;
}

export function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id' | 'intent' | 'escalated' | 'escalated_at' | 'status' | 'user_rating' | 'user_feedback'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.model !== undefined) { fields.push('model = ?'); values.push(updates.model); }
  if (updates.sdk_session_id !== undefined) { fields.push('sdk_session_id = ?'); values.push(updates.sdk_session_id); }
  if (updates.intent !== undefined) { fields.push('intent = ?'); values.push(updates.intent); }
  if (updates.escalated !== undefined) { fields.push('escalated = ?'); values.push(updates.escalated); }
  if (updates.escalated_at !== undefined) { fields.push('escalated_at = ?'); values.push(updates.escalated_at); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.user_rating !== undefined) { fields.push('user_rating = ?'); values.push(updates.user_rating); }
  if (updates.user_feedback !== undefined) { fields.push('user_feedback = ?'); values.push(updates.user_feedback); }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteSession(id: string): boolean {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= 消息操作 =============

export function getMessagesBySession(sessionId: string): DbMessage[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
  return stmt.all(sessionId) as DbMessage[];
}

export function createMessage(message: DbMessage): DbMessage {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, intent, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(message.id, message.session_id, message.role, message.content, message.model, message.intent, message.created_at, message.tool_calls);

  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(new Date().toISOString(), message.session_id);

  return message;
}

export function deleteMessage(id: string): boolean {
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= FAQ 操作 =============

export function getAllFaqItems(): DbFaqItem[] {
  const stmt = db.prepare('SELECT * FROM faq_items ORDER BY priority DESC, updated_at DESC');
  return stmt.all() as DbFaqItem[];
}

export function getFaqItem(id: string): DbFaqItem | undefined {
  const stmt = db.prepare('SELECT * FROM faq_items WHERE id = ?');
  return stmt.get(id) as DbFaqItem | undefined;
}

export function getFaqByCategory(category: string): DbFaqItem[] {
  const stmt = db.prepare('SELECT * FROM faq_items WHERE category = ? AND enabled = 1 ORDER BY priority DESC');
  return stmt.all(category) as DbFaqItem[];
}

export function getEnabledFaqItems(): DbFaqItem[] {
  const stmt = db.prepare('SELECT * FROM faq_items WHERE enabled = 1 ORDER BY priority DESC, updated_at DESC');
  return stmt.all() as DbFaqItem[];
}

export function searchFaq(query: string): DbFaqItem[] {
  const stmt = db.prepare(`
    SELECT * FROM faq_items
    WHERE enabled = 1 AND (question LIKE ? OR keywords LIKE ? OR answer LIKE ?)
    ORDER BY priority DESC
    LIMIT 10
  `);
  const pattern = `%${query}%`;
  return stmt.all(pattern, pattern, pattern) as DbFaqItem[];
}

export function createFaqItem(item: DbFaqItem): DbFaqItem {
  const stmt = db.prepare(`
    INSERT INTO faq_items (id, category, question, answer, keywords, priority, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(item.id, item.category, item.question, item.answer, item.keywords, item.priority, item.enabled, item.created_at, item.updated_at);
  return item;
}

export function updateFaqItem(id: string, updates: Partial<Pick<DbFaqItem, 'category' | 'question' | 'answer' | 'keywords' | 'priority' | 'enabled'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (updates.question !== undefined) { fields.push('question = ?'); values.push(updates.question); }
  if (updates.answer !== undefined) { fields.push('answer = ?'); values.push(updates.answer); }
  if (updates.keywords !== undefined) { fields.push('keywords = ?'); values.push(updates.keywords); }
  if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = db.prepare(`UPDATE faq_items SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteFaqItem(id: string): boolean {
  const stmt = db.prepare('DELETE FROM faq_items WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= 评价操作 =============

export function createRating(rating: DbRating): DbRating {
  const stmt = db.prepare(`
    INSERT INTO ratings (id, session_id, rating, feedback, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(rating.id, rating.session_id, rating.rating, rating.feedback, rating.created_at);

  // 更新会话的评分
  db.prepare('UPDATE sessions SET user_rating = ?, user_feedback = ?, updated_at = ? WHERE id = ?')
    .run(rating.rating, rating.feedback, new Date().toISOString(), rating.session_id);

  return rating;
}

export function getRatingsBySession(sessionId: string): DbRating[] {
  const stmt = db.prepare('SELECT * FROM ratings WHERE session_id = ? ORDER BY created_at DESC');
  return stmt.all(sessionId) as DbRating[];
}

// ============= 统计操作 =============

export function getDashboardStats(): {
  totalSessions: number;
  activeSessions: number;
  escalatedSessions: number;
  avgRating: number | null;
  intentDistribution: Array<{ intent: string; count: number }>;
  dailyStats: Array<{ date: string; sessions: number; avg_rating: number | null }>;
  recentSessions: DbSession[];
} {
  const totalSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
  const activeSessions = (db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'").get() as any).count;
  const escalatedSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions WHERE escalated = 1').get() as any).count;

  const ratingResult = db.prepare('SELECT AVG(user_rating) as avg FROM sessions WHERE user_rating IS NOT NULL').get() as any;
  const avgRating = ratingResult?.avg ? Math.round(ratingResult.avg * 10) / 10 : null;

  const intentDistribution = db.prepare(`
    SELECT COALESCE(intent, '未识别') as intent, COUNT(*) as count
    FROM sessions
    GROUP BY intent
    ORDER BY count DESC
  `).all() as Array<{ intent: string; count: number }>;

  const dailyStats = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as sessions,
           ROUND(AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating END), 1) as avg_rating
    FROM sessions
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `).all() as Array<{ date: string; sessions: number; avg_rating: number | null }>;

  const recentSessions = db.prepare(`
    SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 20
  `).all() as DbSession[];

  return { totalSessions, activeSessions, escalatedSessions, avgRating, intentDistribution, dailyStats, recentSessions };
}

// ============= 初始化默认 FAQ 数据 =============

export function initDefaultFaqData(): void {
  const count = (db.prepare('SELECT COUNT(*) as count FROM faq_items').get() as any).count;
  if (count > 0) return;

  const now = new Date().toISOString();
  const defaults: DbFaqItem[] = [
    {
      id: 'faq-001', category: '退款', question: '如何申请退款？',
      answer: '您可以在订单详情页面点击"申请退款"按钮，填写退款原因后提交。退款将在3-5个工作日内原路返回。如需帮助，请联系人工客服。',
      keywords: '退款,退钱,退货,退单,申请退款', priority: 10, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-002', category: '退款', question: '退款多久到账？',
      answer: '退款审核通过后，款项将在3-5个工作日内原路退回到您的支付账户。信用卡退款可能需要5-10个工作日。节假日期间可能略有延迟。',
      keywords: '退款到账,退款时间,退款多久,退款进度', priority: 9, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-003', category: '订单查询', question: '如何查询我的订单？',
      answer: '您可以登录账户后，在"我的订单"页面查看所有订单状态。也可以通过订单号在首页搜索框直接查询。',
      keywords: '订单,查询订单,订单状态,物流,快递', priority: 10, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-004', category: '订单查询', question: '如何修改收货地址？',
      answer: '订单未发货前，您可以在订单详情页修改收货地址。如果订单已发货，请联系人工客服协助处理。',
      keywords: '修改地址,收货地址,更换地址,地址错误', priority: 8, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-005', category: '技术支持', question: 'APP无法登录怎么办？',
      answer: '请尝试以下步骤：1. 检查网络连接是否正常；2. 清除APP缓存后重试；3. 确认账号密码是否正确；4. 如使用第三方登录，检查授权状态。如果问题仍然存在，请联系人工客服。',
      keywords: '登录,无法登录,登录失败,闪退,打不开', priority: 10, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-006', category: '技术支持', question: '支付失败怎么办？',
      answer: '支付失败可能的原因：1. 余额不足；2. 银行卡限额；3. 网络超时。建议您检查支付账户余额，更换支付方式或稍后重试。如多次失败，请联系银行或人工客服。',
      keywords: '支付,付款,支付失败,付款失败,无法支付', priority: 9, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-007', category: '退款', question: '部分退款如何处理？',
      answer: '如果是多件商品的订单，您可以对单件商品申请退款。在订单详情中选择需要退款的商品，点击"申请退款"即可。部分退款不影响其他商品的发货。',
      keywords: '部分退款,单品退款,只退一件', priority: 7, enabled: 1, created_at: now, updated_at: now
    },
    {
      id: 'faq-008', category: '技术支持', question: '如何联系人工客服？',
      answer: '您可以在对话中直接说"转人工"或"人工客服"，系统会为您转接人工客服。人工客服工作时间：周一至周日 9:00-21:00。',
      keywords: '人工,人工客服,转人工,真人客服,客服人员', priority: 10, enabled: 1, created_at: now, updated_at: now
    },
  ];

  const insertStmt = db.prepare(`
    INSERT INTO faq_items (id, category, question, answer, keywords, priority, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: DbFaqItem[]) => {
    for (const item of items) {
      insertStmt.run(item.id, item.category, item.question, item.answer, item.keywords, item.priority, item.enabled, item.created_at, item.updated_at);
    }
  });

  insertMany(defaults);
  console.log('[DB] 默认FAQ数据已初始化');
}

// 清空所有数据
export function clearAllData(): void {
  db.exec('DELETE FROM ratings');
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
}

export default db;
