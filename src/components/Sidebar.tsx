import { Button, Tooltip } from 'tdesign-react';
import { AddIcon, DeleteIcon, SettingIcon, DashboardIcon } from 'tdesign-icons-react';
import { Bot } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Session, Agent } from '../types';
import { ICON_MAP } from '../utils/iconMap';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  isSettingsPage: boolean;
  sidebarOpen: boolean;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
}

// 意图标签颜色
const INTENT_BADGE: Record<string, { bg: string; label: string }> = {
  '退款': { bg: '#FEF3CD', label: '退' },
  '查询订单': { bg: '#D1ECF1', label: '单' },
  '技术支持': { bg: '#D4EDDA', label: '技' },
  '转人工': { bg: '#F8D7DA', label: '人' },
};

export function Sidebar({
  sessions, currentSessionId, isSettingsPage, sidebarOpen,
  agents, getAgent, onNewChat, onSelectSession, onDeleteSession,
  onOpenSettings, onOpenAdmin,
}: SidebarProps) {
  return (
    <aside
      className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden"
      style={{ width: sidebarOpen ? 260 : 0, backgroundColor: 'var(--td-bg-color-container)' }}
    >
      {/* Logo */}
      <div className="h-14 px-4 flex items-center flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600"
          >
            <span className="text-white text-sm font-bold">{APP_CONFIG.nameInitial}</span>
          </div>
          <span className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            {APP_CONFIG.name}
          </span>
        </div>
      </div>

      {/* 新对话按钮 */}
      <div className="p-3">
        <Button icon={<AddIcon />} onClick={onNewChat} block variant="outline">
          新对话
        </Button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(session => {
          const sessionAgent = session.agentId ? getAgent(session.agentId) : getAgent('default');
          const AgentIcon = ICON_MAP[sessionAgent?.icon || 'Bot'] || Bot;
          const intentBadge = session.intent ? INTENT_BADGE[session.intent] : null;

          return (
            <div
              key={session.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 group"
              style={{
                backgroundColor: session.id === currentSessionId && !isSettingsPage
                  ? 'var(--td-brand-color-light)' : 'transparent',
                color: session.id === currentSessionId && !isSettingsPage
                  ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)'
              }}
              onClick={() => onSelectSession(session.id)}
              onMouseEnter={e => {
                if (session.id !== currentSessionId || isSettingsPage)
                  e.currentTarget.style.backgroundColor = 'var(--td-bg-color-component-hover)';
              }}
              onMouseLeave={e => {
                if (session.id !== currentSessionId || isSettingsPage)
                  e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: sessionAgent?.color || 'var(--td-brand-color)' }}
              >
                <AgentIcon size={12} color="white" />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="truncate text-sm">{session.title}</span>
                {intentBadge && (
                  <span
                    className="shrink-0 w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: intentBadge.bg, color: 'var(--td-text-color-primary)' }}
                  >
                    {intentBadge.label}
                  </span>
                )}
                {session.escalated && (
                  <span className="shrink-0 w-4 h-4 rounded flex items-center justify-center text-[10px] bg-orange-200 text-orange-700">!</span>
                )}
              </div>
              <Tooltip content="删除会话">
                <Button
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  variant="text" shape="circle" size="medium"
                  icon={<DeleteIcon />}
                  onClick={e => { e.stopPropagation(); onDeleteSession(session.id); }}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>

      {/* 底部按钮 */}
      <div className="p-3 border-t flex-shrink-0 space-y-1" style={{ borderColor: 'var(--td-component-border)' }}>
        <Button
          icon={<DashboardIcon />}
          onClick={onOpenAdmin}
          block variant="text"
        >
          管理后台
        </Button>
        <Button
          icon={<SettingIcon />}
          onClick={onOpenSettings}
          block variant={isSettingsPage ? 'outline' : 'text'}
          theme={isSettingsPage ? 'primary' : 'default'}
        >
          设置
        </Button>
      </div>
    </aside>
  );
}
