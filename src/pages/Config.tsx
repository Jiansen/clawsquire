import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import AgentChat from '../components/AgentChat';
import { useActiveTarget } from '../context/ActiveTargetContext';

const MASK_KEYS = ['apiKey', 'token', 'secret', 'password', 'botToken'];

function maskSecrets(obj: unknown, parentKey = ''): unknown {
  if (typeof obj === 'string') {
    const lk = parentKey.toLowerCase();
    if (MASK_KEYS.some((k) => lk.includes(k.toLowerCase())) && obj.length > 8) {
      return obj.slice(0, 4) + '•'.repeat(Math.min(obj.length - 8, 20)) + obj.slice(-4);
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((v, i) => maskSecrets(v, String(i)));
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = maskSecrets(v, k);
    }
    return out;
  }
  return obj;
}

export default function Config() {
  const { target } = useActiveTarget();
  const { t, i18n } = useTranslation();
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await invoke<string>('get_full_config');
      setRawJson(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig, target.mode, target.instanceId]);

  const parsed = rawJson ? (() => { try { return JSON.parse(rawJson); } catch { return null; } })() : null;
  const masked = parsed ? maskSecrets(parsed) : null;

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('config.title')}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              showRaw ? 'bg-claw-100 text-claw-700' : 'bg-gray-100 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            {showRaw ? t('config.treeView') : t('config.jsonView')}
          </button>
          <button
            onClick={loadConfig}
            disabled={loading}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400
                       hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 transition-all"
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!parsed && !loading && !error && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 dark:bg-gray-800/50 p-12 text-center">
          <div className="text-4xl mb-4">📄</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('config.notFound')}</p>
        </div>
      )}

      {parsed && showRaw && (
        <div className="bg-gray-900 rounded-xl p-4 overflow-auto max-h-[70vh]">
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
            {JSON.stringify(masked, null, 2)}
          </pre>
        </div>
      )}

      {parsed && !showRaw && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <ConfigTree
            data={masked as Record<string, unknown>}
            path=""
            expandedPaths={expandedPaths}
            onToggle={togglePath}
            depth={0}
          />
        </div>
      )}

      <p className="text-xs text-gray-400">
        {t('config.secretsMasked')}
      </p>

      <AgentChat
        systemContext={[
          'You are ClawSquire Config Assistant — helps users understand and modify OpenClaw configuration.',
          '',
          'REFERENCE (link users to specific pages when relevant):',
          '- Configuration guide: https://docs.openclaw.ai/gateway/configuration',
          '- Configuration reference: https://docs.openclaw.ai/gateway/configuration-reference',
          '- Configuration examples: https://docs.openclaw.ai/gateway/configuration-examples',
          '- Config CLI: https://docs.openclaw.ai/cli/config',
          '- Model providers: https://docs.openclaw.ai/concepts/model-providers',
          '- Security: https://docs.openclaw.ai/gateway/security',
          '- Secrets management: https://docs.openclaw.ai/gateway/secrets',
          '- Channels: https://docs.openclaw.ai/channels',
          '- Sandboxing: https://docs.openclaw.ai/gateway/sandboxing',
          '',
          'CORE BEHAVIOR:',
          `- Reply in the user's language (current: ${i18n.language || 'en'}).`,
          '- Show exact config commands. Use `openclaw config set <path> <value>` for changes, `openclaw config get <path>` to read.',
          '- Explain what each config option does and its impact before suggesting changes.',
          '- If unsure about a config path, say so and link to the config reference. Never guess config keys.',
          '',
          'WHAT YOU HELP WITH:',
          '- LLM provider API keys and model selection',
          '- Channel setup: Telegram, Discord, WhatsApp, WeChat',
          '- Safety presets (conservative / standard / full)',
          '- Gateway options: port, host, SSL, CORS',
          '- Plugin and skill configuration',
          '',
          'BOUNDARIES:',
          '- You suggest commands, but cannot execute them.',
          '- Warn users before changes that affect security (API keys, safety level).',
        ].join('\n')}
        title={t('agentChat.configTitle')}
        placeholder={t('agentChat.configPlaceholder')}
      />
    </div>
  );
}

function ConfigTree({
  data,
  path,
  expandedPaths,
  onToggle,
  depth,
}: {
  data: Record<string, unknown>;
  path: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  depth: number;
}) {
  return (
    <div className={depth > 0 ? 'border-l border-gray-100 dark:border-gray-800 ml-4' : ''}>
      {Object.entries(data).map(([key, value]) => {
        const fullPath = path ? `${path}.${key}` : key;
        const isObject = value && typeof value === 'object' && !Array.isArray(value);
        const isArray = Array.isArray(value);
        const isExpanded = expandedPaths.has(fullPath);

        if (isObject) {
          const childCount = Object.keys(value as object).length;
          return (
            <div key={key}>
              <button
                onClick={() => onToggle(fullPath)}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800/50 transition-colors"
              >
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-claw-700">{key}</span>
                <span className="text-xs text-gray-400">({childCount})</span>
              </button>
              {isExpanded && (
                <ConfigTree
                  data={value as Record<string, unknown>}
                  path={fullPath}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        return (
          <div key={key} className="flex items-start gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800/50">
            <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[120px] flex-shrink-0 font-mono">{key}</span>
            <span className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
              {isArray
                ? `[${(value as unknown[]).map((v) => JSON.stringify(v)).join(', ')}]`
                : typeof value === 'boolean'
                  ? (
                    <span className={value ? 'text-green-600' : 'text-red-600'}>
                      {String(value)}
                    </span>
                  )
                  : String(value ?? '—')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
