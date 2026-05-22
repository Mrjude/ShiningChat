import { useState, useEffect, useCallback } from 'react';
import { DashboardStats, FaqItem } from '../types';

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'conversations' | 'faq'>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 新建/编辑FAQ
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [showFaqForm, setShowFaqForm] = useState(false);
  const [faqForm, setFaqForm] = useState({ category: '', question: '', answer: '', keywords: '', priority: 0 });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);

  const fetchFaq = useCallback(async () => {
    try {
      const res = await fetch('/api/faq');
      const data = await res.json();
      setFaqItems(data.items || []);
    } catch (e) {
      console.error('Failed to fetch FAQ:', e);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchFaq()]).finally(() => setLoading(false));
  }, [fetchStats, fetchFaq]);

  const handleSaveFaq = async () => {
    try {
      if (editingFaq) {
        await fetch(`/api/faq/${editingFaq.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(faqForm),
        });
      } else {
        await fetch('/api/faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(faqForm),
        });
      }
      setShowFaqForm(false);
      setEditingFaq(null);
      setFaqForm({ category: '', question: '', answer: '', keywords: '', priority: 0 });
      fetchFaq();
    } catch (e) {
      console.error('Failed to save FAQ:', e);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!confirm('确定要删除此FAQ吗？')) return;
    try {
      await fetch(`/api/faq/${id}`, { method: 'DELETE' });
      fetchFaq();
    } catch (e) {
      console.error('Failed to delete FAQ:', e);
    }
  };

  const handleEditFaq = (item: FaqItem) => {
    setEditingFaq(item);
    setFaqForm({
      category: item.category,
      question: item.question,
      answer: item.answer,
      keywords: item.keywords || '',
      priority: item.priority,
    });
    setShowFaqForm(true);
  };

  const handleToggleFaq = async (item: FaqItem) => {
    try {
      await fetch(`/api/faq/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: item.enabled ? 0 : 1 }),
      });
      fetchFaq();
    } catch (e) {
      console.error('Failed to toggle FAQ:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p style={{ color: 'var(--td-text-color-secondary)' }}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--td-text-color-primary)' }}>
            管理后台
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
            查看对话记录、满意度统计和FAQ知识库管理
          </p>
        </div>

        {/* 标签页 */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ backgroundColor: 'var(--td-bg-color-secondarycontainer)' }}>
          {[
            { key: 'overview' as const, label: '数据概览' },
            { key: 'conversations' as const, label: '对话记录' },
            { key: 'faq' as const, label: 'FAQ管理' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === tab.key ? 'var(--td-bg-color-container)' : 'transparent',
                color: activeTab === tab.key ? 'var(--td-text-color-primary)' : 'var(--td-text-color-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 数据概览 */}
        {activeTab === 'overview' && stats && (
          <div>
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard title="总会话数" value={stats.totalSessions} icon="📊" color="#3B82F6" />
              <StatCard title="活跃会话" value={stats.activeSessions} icon="💬" color="#10B981" />
              <StatCard title="转人工数" value={stats.escalatedSessions} icon="👤" color="#F59E0B" />
              <StatCard title="平均评分" value={stats.avgRating ?? '-'} icon="⭐" color="#8B5CF6" />
            </div>

            {/* 意图分布 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border p-5" style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>意图分布</h3>
                {stats.intentDistribution.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>暂无数据</p>
                ) : (
                  <div className="space-y-3">
                    {stats.intentDistribution.map(item => (
                      <div key={item.intent} className="flex items-center gap-3">
                        <span className="text-sm w-20 truncate" style={{ color: 'var(--td-text-color-primary)' }}>{item.intent}</span>
                        <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--td-bg-color-secondarycontainer)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min((item.count / stats.totalSessions) * 100, 100)}%`,
                              backgroundColor: item.intent === '退款' ? '#F59E0B' : item.intent === '查询订单' ? '#3B82F6' : item.intent === '技术支持' ? '#10B981' : '#8B5CF6',
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8 text-right" style={{ color: 'var(--td-text-color-primary)' }}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 每日统计 */}
              <div className="rounded-xl border p-5" style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>近7日会话趋势</h3>
                <div className="space-y-2">
                  {stats.dailyStats.slice(0, 7).map(day => (
                    <div key={day.date} className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--td-text-color-secondary)' }}>{day.date}</span>
                      <div className="flex items-center gap-3">
                        <span style={{ color: 'var(--td-text-color-primary)' }}>{day.sessions} 会话</span>
                        {day.avg_rating && <span style={{ color: '#F59E0B' }}>⭐ {day.avg_rating}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 对话记录 */}
        {activeTab === 'conversations' && stats && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--td-bg-color-secondarycontainer)' }}>
                    <th className="text-left p-3 font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>会话标题</th>
                    <th className="text-left p-3 font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>意图</th>
                    <th className="text-left p-3 font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>状态</th>
                    <th className="text-left p-3 font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>评分</th>
                    <th className="text-left p-3 font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSessions.map(session => (
                    <tr key={session.id} className="border-t" style={{ borderColor: 'var(--td-border-level-1-color)' }}>
                      <td className="p-3 max-w-xs truncate" style={{ color: 'var(--td-text-color-primary)' }}>{session.title}</td>
                      <td className="p-3">
                        {session.intent ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            {session.intent}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>未识别</span>
                        )}
                      </td>
                      <td className="p-3">
                        {session.escalated ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">已转人工</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">AI处理</span>
                        )}
                      </td>
                      <td className="p-3">
                        {session.user_rating ? (
                          <span className="text-yellow-500">{'⭐'.repeat(session.user_rating)}</span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>未评价</span>
                        )}
                      </td>
                      <td className="p-3 text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                        {new Date(session.created_at).toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FAQ管理 */}
        {activeTab === 'faq' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                共 {faqItems.length} 条FAQ
              </span>
              <button
                onClick={() => {
                  setEditingFaq(null);
                  setFaqForm({ category: '', question: '', answer: '', keywords: '', priority: 0 });
                  setShowFaqForm(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors"
              >
                + 新增FAQ
              </button>
            </div>

            {/* FAQ表单 */}
            {showFaqForm && (
              <div className="rounded-xl border p-5 mb-4" style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--td-text-color-primary)' }}>
                  {editingFaq ? '编辑FAQ' : '新增FAQ'}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分类</label>
                    <select
                      value={faqForm.category}
                      onChange={e => setFaqForm({ ...faqForm, category: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)', color: 'var(--td-text-color-primary)' }}
                    >
                      <option value="退款">退款</option>
                      <option value="查询订单">查询订单</option>
                      <option value="技术支持">技术支持</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>优先级</label>
                    <input
                      type="number" value={faqForm.priority}
                      onChange={e => setFaqForm({ ...faqForm, priority: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)', color: 'var(--td-text-color-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>问题</label>
                    <input
                      value={faqForm.question}
                      onChange={e => setFaqForm({ ...faqForm, question: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      placeholder="用户可能会问的问题"
                      style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)', color: 'var(--td-text-color-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>答案</label>
                    <textarea
                      value={faqForm.answer}
                      onChange={e => setFaqForm({ ...faqForm, answer: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      placeholder="标准回答内容"
                      style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)', color: 'var(--td-text-color-primary)' }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>关键词（逗号分隔）</label>
                    <input
                      value={faqForm.keywords}
                      onChange={e => setFaqForm({ ...faqForm, keywords: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      placeholder="退款,退钱,退货"
                      style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)', color: 'var(--td-text-color-primary)' }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleSaveFaq}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => { setShowFaqForm(false); setEditingFaq(null); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: 'var(--td-border-level-2-color)', color: 'var(--td-text-color-secondary)' }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* FAQ列表 */}
            <div className="space-y-2">
              {faqItems.map(item => (
                <div
                  key={item.id}
                  className="rounded-xl border p-4 flex items-start gap-3"
                  style={{
                    borderColor: 'var(--td-border-level-2-color)',
                    backgroundColor: 'var(--td-bg-color-container)',
                    opacity: item.enabled ? 1 : 0.5,
                  }}
                >
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 mt-0.5 shrink-0">
                    {item.category}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>{item.question}</p>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--td-text-color-secondary)' }}>{item.answer}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleFaq(item)}
                      className="px-2 py-1 rounded text-xs"
                      style={{ color: item.enabled ? '#F59E0B' : 'var(--td-text-color-secondary)' }}
                    >
                      {item.enabled ? '启用' : '禁用'}
                    </button>
                    <button
                      onClick={() => handleEditFaq(item)}
                      className="px-2 py-1 rounded text-xs text-blue-500 hover:text-blue-600"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteFaq(item.id)}
                      className="px-2 py-1 rounded text-xs text-red-500 hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 统计卡片组件
function StatCard({ title, value, icon, color }: { title: string; value: number | string; icon: string; color: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--td-border-level-2-color)', backgroundColor: 'var(--td-bg-color-container)' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: `${color}15` }}>
          {icon}
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>{title}</p>
          <p className="text-xl font-bold" style={{ color: 'var(--td-text-color-primary)' }}>{value}</p>
        </div>
      </div>
    </div>
  );
}
