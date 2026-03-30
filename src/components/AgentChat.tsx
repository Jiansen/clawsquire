import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AgentChatProps {
  systemContext: string;
  placeholder?: string;
  title?: string;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export default function AgentChat({
  systemContext,
  placeholder,
  title,
  className = '',
  collapsible = true,
  defaultExpanded = false,
}: AgentChatProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    const historyContext = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    const fullUserMessage = historyContext ? `${historyContext}\nUser: ${msg}` : msg;

    try {
      const provider = localStorage.getItem('clawsquire.llmProvider') || 'anthropic';
      const keyData = localStorage.getItem('clawsquire.apiKey');
      const apiKey = keyData ? (JSON.parse(keyData) as { key: string }).key || '' : '';

      let res: { success: boolean; reply: string | null; error: string | null };

      if (apiKey) {
        res = await invoke<{ success: boolean; reply: string | null; error: string | null }>(
          'llm_chat_direct',
          { provider, apiKey, systemPrompt: systemContext, userMessage: fullUserMessage },
        );
      } else {
        const fullPrompt = [systemContext, '', fullUserMessage].join('\n');
        res = await invoke<{ success: boolean; reply: string | null; error: string | null }>(
          'agent_chat_local',
          { message: fullPrompt },
        );
      }

      const reply = res.success && res.reply ? res.reply : (res.error || t('agentChat.noResponse'));
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${t('agentChat.error')}: ${e}`, timestamp: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const chatTitle = title || t('agentChat.title');
  const chatPlaceholder = placeholder || t('agentChat.placeholder');

  if (collapsible) {
    return (
      <div className={`rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 overflow-hidden ${className}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <span className="text-sm font-medium text-violet-800 dark:text-violet-300">{chatTitle}</span>
            {messages.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300">
                {messages.length}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-violet-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && <ChatBody
          messages={messages}
          input={input}
          sending={sending}
          chatPlaceholder={chatPlaceholder}
          messagesRef={messagesRef}
          onInputChange={setInput}
          onSend={handleSend}
        />}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-violet-200 dark:border-violet-800">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-sm font-medium text-violet-800 dark:text-violet-300">{chatTitle}</span>
        </div>
      </div>
      <ChatBody
        messages={messages}
        input={input}
        sending={sending}
        chatPlaceholder={chatPlaceholder}
        messagesRef={messagesRef}
        onInputChange={setInput}
        onSend={handleSend}
      />
    </div>
  );
}

function ChatBody({
  messages,
  input,
  sending,
  chatPlaceholder,
  messagesRef,
  onInputChange,
  onSend,
}: {
  messages: ChatMessage[];
  input: string;
  sending: boolean;
  chatPlaceholder: string;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (v: string) => void;
  onSend: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-t border-violet-200 dark:border-violet-800">
      <div
        ref={messagesRef}
        className="max-h-64 overflow-y-auto p-3 space-y-2"
      >
        {messages.length === 0 && (
          <p className="text-xs text-violet-400 dark:text-violet-500 text-center py-4">
            {t('agentChat.empty')}
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-claw-600 text-white'
                  : 'bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 text-gray-800 dark:text-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 rounded-lg px-3 py-2">
              <span className="animate-pulse text-violet-500 text-sm">...</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-violet-200 dark:border-violet-800 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={chatPlaceholder}
          disabled={sending}
          className="flex-1 rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm
                     focus:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none transition-all
                     disabled:opacity-50"
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || sending}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700
                     disabled:opacity-50 transition-all flex-shrink-0"
        >
          {t('agentChat.send')}
        </button>
      </div>

      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          Powered by{' '}
          <a href="https://vibeful.io" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">
            Vibeful
          </a>
        </span>
        <a
          href="https://github.com/Jiansen/clawsquire/issues/new?labels=bug,agent"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
        >
          ⚠️ {t('feedback.reportIssue')}
        </a>
      </div>
    </div>
  );
}
