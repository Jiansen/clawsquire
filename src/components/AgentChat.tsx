import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { openVibeful } from './shared/VibefulCTA';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  commands?: AgentCommand[];
}

interface AgentCommand {
  command: string;
  reason: string;
  risk: 'safe' | 'moderate' | 'dangerous';
  status: 'pending' | 'running' | 'done' | 'failed';
  output?: string;
}

interface AgentChatProps {
  systemContext: string;
  placeholder?: string;
  title?: string;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  canExecute?: boolean;
  backupBeforeExecute?: boolean;
}

function parseCommandsFromResponse(reply: string): { text: string; commands: AgentCommand[] } {
  const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/) || reply.match(/(\{[\s\S]*"commands"[\s\S]*\})/);
  if (!jsonMatch) return { text: reply, commands: [] };

  try {
    const raw = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(raw);
    if (parsed.commands && Array.isArray(parsed.commands)) {
      const commands: AgentCommand[] = parsed.commands.map((c: { command: string; reason: string; risk?: string }) => ({
        command: c.command,
        reason: c.reason,
        risk: c.risk || 'moderate',
        status: 'pending' as const,
      }));
      const textPart = parsed.explanation || parsed.diagnosis || reply.replace(jsonMatch[0], '').trim();
      return { text: textPart || (parsed.diagnosis ?? ''), commands };
    }
  } catch { /* not valid JSON */ }
  return { text: reply, commands: [] };
}

export default function AgentChat({
  systemContext,
  placeholder,
  title,
  className = '',
  collapsible = true,
  defaultExpanded = false,
  canExecute = false,
  backupBeforeExecute = false,
}: AgentChatProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const execSuffix = canExecute ? [
    '',
    'COMMAND EXECUTION:',
    '- You CAN execute commands through this interface. When you suggest actionable commands, format them as JSON:',
    '  {"explanation": "what this will do", "commands": [{"command": "...", "reason": "why", "risk": "safe|moderate|dangerous"}]}',
    '- The user will see execute buttons for each command.',
    '- After execution, results will be shared with you for follow-up.',
    '- Always confirm intent before suggesting destructive commands.',
    backupBeforeExecute ? '- IMPORTANT: Before any configuration change, a backup will be created automatically.' : '',
  ].filter(Boolean).join('\n') : '';

  const fullSystemContext = execSuffix ? `${systemContext}\n${execSuffix}` : systemContext;

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
          { provider, apiKey, systemPrompt: fullSystemContext, userMessage: fullUserMessage },
        );
      } else {
        const fullPrompt = [fullSystemContext, '', fullUserMessage].join('\n');
        res = await invoke<{ success: boolean; reply: string | null; error: string | null }>(
          'agent_chat_local',
          { message: fullPrompt },
        );
      }

      const reply = res.success && res.reply ? res.reply : (res.error || t('agentChat.noResponse'));

      if (canExecute) {
        const { text, commands } = parseCommandsFromResponse(reply);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: text || reply,
          timestamp: Date.now(),
          commands: commands.length > 0 ? commands : undefined,
        }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${t('agentChat.error')}: ${e}`, timestamp: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const executeCommand = async (msgIdx: number, cmdIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg?.commands?.[cmdIdx]) return;

    const cmd = msg.commands[cmdIdx];

    if (backupBeforeExecute) {
      try {
        await invoke('create_backup', { label: 'pre-ai-change' });
      } catch { /* backup is best-effort */ }
    }

    setMessages(prev => prev.map((m, mi) =>
      mi === msgIdx ? {
        ...m,
        commands: m.commands?.map((c, ci) => ci === cmdIdx ? { ...c, status: 'running' as const } : c),
      } : m
    ));

    try {
      const res = await invoke<{ success: boolean; stdout: string; stderr: string }>(
        'run_shell_command',
        { command: cmd.command },
      );

      const output = res.stdout || res.stderr || '(no output)';
      const status = res.success ? 'done' as const : 'failed' as const;

      setMessages(prev => prev.map((m, mi) =>
        mi === msgIdx ? {
          ...m,
          commands: m.commands?.map((c, ci) => ci === cmdIdx ? { ...c, status, output } : c),
        } : m
      ));

      setMessages(prev => [...prev, {
        role: 'user',
        content: `[Command result] \`${cmd.command}\`: ${status === 'done' ? 'SUCCESS' : 'FAILED'}\n${output}`,
        timestamp: Date.now(),
      }]);

    } catch (e) {
      const errStr = String(e);
      setMessages(prev => prev.map((m, mi) =>
        mi === msgIdx ? {
          ...m,
          commands: m.commands?.map((c, ci) => ci === cmdIdx ? { ...c, status: 'failed' as const, output: errStr } : c),
        } : m
      ));
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
            {canExecute && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">can execute</span>}
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
          canExecute={canExecute}
          onExecuteCommand={executeCommand}
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
          {canExecute && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">can execute</span>}
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
        canExecute={canExecute}
        onExecuteCommand={executeCommand}
      />
    </div>
  );
}

function riskBadge(risk: string) {
  switch (risk) {
    case 'safe':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">safe</span>;
    case 'moderate':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400">moderate</span>;
    case 'dangerous':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">danger</span>;
    default:
      return null;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'done': return <span className="text-green-500">✓</span>;
    case 'running': return <span className="animate-spin text-blue-500">⏳</span>;
    case 'failed': return <span className="text-red-500">✗</span>;
    default: return <span className="text-gray-400">○</span>;
  }
}

function ChatBody({
  messages,
  input,
  sending,
  chatPlaceholder,
  messagesRef,
  onInputChange,
  onSend,
  canExecute,
  onExecuteCommand,
}: {
  messages: ChatMessage[];
  input: string;
  sending: boolean;
  chatPlaceholder: string;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (v: string) => void;
  onSend: () => void;
  canExecute: boolean;
  onExecuteCommand: (msgIdx: number, cmdIdx: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-t border-violet-200 dark:border-violet-800">
      <div
        ref={messagesRef}
        className="max-h-80 overflow-y-auto p-3 space-y-2"
      >
        {messages.length === 0 && (
          <p className="text-xs text-violet-400 dark:text-violet-500 text-center py-4">
            {t('agentChat.empty')}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
            {canExecute && msg.commands && msg.commands.length > 0 && (
              <div className="mt-2 ml-2 space-y-1.5">
                {msg.commands.map((cmd, ci) => (
                  <div
                    key={ci}
                    className={`rounded-lg border p-2.5 text-xs ${
                      cmd.status === 'running' ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30'
                      : cmd.status === 'done' ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                      : cmd.status === 'failed' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(cmd.status)}
                      <code className="font-mono text-gray-800 dark:text-gray-200 break-all">{cmd.command}</code>
                      {riskBadge(cmd.risk)}
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 ml-5">{cmd.reason}</p>
                    {cmd.output && (
                      <pre className="text-gray-500 dark:text-gray-400 mt-1 ml-5 max-h-16 overflow-auto bg-gray-50 dark:bg-gray-800 rounded p-1.5">
                        {cmd.output}
                      </pre>
                    )}
                    {cmd.status === 'pending' && (
                      <div className="mt-1.5 ml-5">
                        <button
                          onClick={() => onExecuteCommand(i, ci)}
                          className="px-2.5 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 transition-all"
                        >
                          ▶ Execute
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
          <button onClick={() => openVibeful('agent-chat')} className="text-blue-500 hover:text-blue-600 cursor-pointer">
            Vibeful
          </button>
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
