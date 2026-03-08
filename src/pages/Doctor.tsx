import { useTranslation } from 'react-i18next';
import { useState } from 'react';

type Status = 'pass' | 'warn' | 'fail';

interface Check {
  name: string;
  status: Status;
  detail: string;
}

interface Category {
  key: string;
  checks: Check[];
}

const placeholderResults: Category[] = [
  {
    key: 'installation',
    checks: [
      { name: 'OpenClaw binary', status: 'pass', detail: 'v0.4.2 found at /usr/local/bin/openclaw' },
      { name: 'Node.js', status: 'pass', detail: 'v20.11.0' },
    ],
  },
  {
    key: 'config',
    checks: [
      { name: 'config.yaml exists', status: 'pass', detail: '~/.openclaw/config.yaml' },
      { name: 'config.yaml valid', status: 'warn', detail: 'Deprecated key "legacy_mode" found' },
    ],
  },
  {
    key: 'gateway',
    checks: [
      { name: 'LLM provider reachable', status: 'pass', detail: 'DeepSeek API responded in 120ms' },
      { name: 'Telegram webhook', status: 'fail', detail: 'Webhook URL not configured' },
    ],
  },
  {
    key: 'security',
    checks: [
      { name: 'API key permissions', status: 'pass', detail: 'Scoped to chat.completions' },
    ],
  },
  {
    key: 'backup',
    checks: [
      { name: 'Last backup age', status: 'warn', detail: 'Last backup was 14 days ago' },
    ],
  },
];

const statusStyles: Record<Status, string> = {
  pass: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  fail: 'bg-red-100 text-red-700',
};

export default function Doctor() {
  const { t } = useTranslation();
  const [results, setResults] = useState<Category[] | null>(null);
  const [running, setRunning] = useState(false);

  function runCheck() {
    setRunning(true);
    setTimeout(() => {
      setResults(placeholderResults);
      setRunning(false);
    }, 800);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('doctor.title')}</h2>
        <button
          onClick={runCheck}
          disabled={running}
          className="bg-claw-600 hover:bg-claw-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {running ? t('common.loading') : results ? t('doctor.rerun') : t('doctor.runCheck')}
        </button>
      </div>

      {!results && !running && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto text-gray-300 mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p className="text-gray-400">{t('doctor.runCheck')}</p>
        </div>
      )}

      {running && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-3 border-claw-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      )}

      {results && !running && (
        <div className="space-y-4">
          {results.map((cat) => (
            <div key={cat.key} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  {t(`doctor.categories.${cat.key}`)}
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {cat.checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[check.status]}`}
                    >
                      {t(`doctor.${check.status}`)}
                    </span>
                    <span className="font-medium text-sm text-gray-900">{check.name}</span>
                    <span className="text-sm text-gray-400 ml-auto">{check.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
