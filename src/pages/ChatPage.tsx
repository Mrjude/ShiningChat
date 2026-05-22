import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Model, Session, PermissionMode, CustomAgent, PermissionRequest, QuickReply, IntentType } from '../types';
import { ChatMessages } from '../components/ChatMessages';
import { ChatInput } from '../components/ChatInput';
import { SatisfactionRating } from '../components/SatisfactionRating';

interface ChatPageProps {
  currentSession: Session | undefined;
  models: Model[];
  selectedModel: string;
  agents: CustomAgent[];
  isLoading: boolean;
  inputValue: string;
  permissionRequest: PermissionRequest | null;
  permissionMode: PermissionMode;
  onSendMessage: (message: string, newChatOptions?: NewChatOptions, onNavigate?: (path: string) => void) => void;
  onStop: () => void;
  onInputChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionAllow: () => void;
  onPermissionDeny: () => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
}

interface NewChatOptions {
  agentId: string;
  cwd: string;
  permissionMode: PermissionMode;
}

// 快捷回复选项
const QUICK_REPLIES: QuickReply[] = [
  { id: 'qr-1', text: '申请退款', intent: '退款' },
  { id: 'qr-2', text: '查询订单', intent: '查询订单' },
  { id: 'qr-3', text: '技术支持', intent: '技术支持' },
  { id: 'qr-4', text: '转人工客服', intent: '转人工' },
];

// 意图标签颜色
const INTENT_COLORS: Record<string, { bg: string; text: string }> = {
  '退款': { bg: '#FEF3CD', text: '#856404' },
  '查询订单': { bg: '#D1ECF1', text: '#0C5460' },
  '技术支持': { bg: '#D4EDDA', text: '#155724' },
  '转人工': { bg: '#F8D7DA', text: '#721C24' },
};

export function ChatPage({
  currentSession, models, selectedModel, agents,
  isLoading, inputValue, permissionRequest, permissionMode,
  onSendMessage, onStop, onInputChange, onModelChange,
  onPermissionAllow, onPermissionDeny, onPermissionModeChange,
}: ChatPageProps) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // 对话结束后显示评价
  useEffect(() => {
    if (currentSession && currentSession.messages.length > 0) {
      const lastMsg = currentSession.messages[currentSession.messages.length - 1];
      if (lastMsg?.role === 'assistant' && !lastMsg.isStreaming && !currentSession.userRating) {
        setShowRating(true);
      }
    }
  }, [currentSession?.messages, currentSession?.userRating]);

  const handleSend = useCallback((message: string) => {
    if (!currentSession) {
      onSendMessage(message, {
        agentId: 'default',
        cwd: '',
        permissionMode: permissionMode,
      }, (path) => navigate(path));
    } else {
      onSendMessage(message);
    }
  }, [currentSession, permissionMode, onSendMessage, navigate]);

  const handleQuickReply = useCallback((reply: QuickReply) => {
    handleSend(reply.text);
  }, [handleSend]);

  const showNewChatView = !currentSession || currentSession.messages.length === 0;

  // 检测最新意图
  const lastIntent: IntentType = currentSession?.messages
    ?.filter(m => m.intent)
    ?.pop()?.intent || null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {showNewChatView ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
            {/* 欢迎卡片 */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                S
              </div>
              <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
                Shining 智能客服
              </h2>
              <p style={{ color: 'var(--td-text-color-secondary)' }}>
                您好，我是Shining智能客服，有任何问题都可以问我
              </p>
            </div>

            {/* 快捷回复 */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {QUICK_REPLIES.map(reply => (
                <button
                  key={reply.id}
                  onClick={() => handleQuickReply(reply)}
                  className="flex items-center gap-2 p-4 rounded-xl border transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    borderColor: 'var(--td-border-level-2-color)',
                    backgroundColor: 'var(--td-bg-color-container)',
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium"
                    style={{
                      backgroundColor: INTENT_COLORS[reply.intent || '']?.bg || 'var(--td-bg-color-secondarycontainer)',
                      color: INTENT_COLORS[reply.intent || '']?.text || 'var(--td-text-color-secondary)',
                    }}
                  >
                    {reply.intent === '退款' ? '退' : reply.intent === '查询订单' ? '单' : reply.intent === '技术支持' ? '技' : '人'}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
                    {reply.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 意图标签 */}
            {lastIntent && (
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: INTENT_COLORS[lastIntent]?.bg || 'var(--td-bg-color-secondarycontainer)',
                    color: INTENT_COLORS[lastIntent]?.text || 'var(--td-text-color-secondary)',
                  }}
                >
                  意图: {lastIntent}
                </span>
                {currentSession?.escalated && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                    已转人工
                  </span>
                )}
              </div>
            )}

            <ChatMessages
              messages={currentSession!.messages}
              models={models}
              messagesEndRef={messagesEndRef}
              permissionRequest={permissionRequest}
              onPermissionAllow={onPermissionAllow}
              onPermissionDeny={onPermissionDeny}
            />

            {/* 快捷回复（对话中） */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {QUICK_REPLIES.filter(r => r.intent !== lastIntent).map(reply => (
                <button
                  key={reply.id}
                  onClick={() => handleQuickReply(reply)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all hover:shadow-sm"
                  style={{
                    borderColor: 'var(--td-border-level-2-color)',
                    backgroundColor: 'var(--td-bg-color-container)',
                    color: 'var(--td-text-color-secondary)',
                  }}
                >
                  {reply.text}
                </button>
              ))}
            </div>

            {/* 满意度评价 */}
            {showRating && currentSession && (
              <SatisfactionRating
                sessionId={currentSession.id}
                onSubmit={() => setShowRating(false)}
              />
            )}
          </>
        )}
      </div>

      {/* 输入区域 */}
      <ChatInput
        inputValue={inputValue}
        selectedModel={selectedModel}
        models={models}
        isLoading={isLoading}
        permissionMode={permissionMode}
        onSend={handleSend}
        onStop={onStop}
        onChange={onInputChange}
        onModelChange={onModelChange}
        onPermissionModeChange={onPermissionModeChange}
      />
    </div>
  );
}
