import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { openVibeful } from '../components/shared/VibefulCTA';

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    logo: '/logos/anthropic.svg',
    recommended: true,
    signupUrl: 'https://console.anthropic.com',
    keyPrefix: 'sk-ant-',
    tagline: 'apiKeySetup.providers.anthropic.tagline',
    features: 'apiKeySetup.providers.anthropic.features',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    logo: '/logos/openai.svg',
    recommended: false,
    signupUrl: 'https://platform.openai.com',
    keyPrefix: 'sk-',
    tagline: 'apiKeySetup.providers.openai.tagline',
    features: 'apiKeySetup.providers.openai.features',
  },
  {
    id: 'google',
    name: 'Google',
    logo: '/logos/gemini.svg',
    recommended: false,
    signupUrl: 'https://aistudio.google.com/apikey',
    keyPrefix: 'AI',
    tagline: 'apiKeySetup.providers.google.tagline',
    features: 'apiKeySetup.providers.google.features',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: '/logos/deepseek.svg',
    recommended: false,
    signupUrl: 'https://platform.deepseek.com',
    keyPrefix: 'sk-',
    tagline: 'apiKeySetup.providers.deepseek.tagline',
    features: 'apiKeySetup.providers.deepseek.features',
  },
];

type TestPhase = 'idle' | 'testing' | 'success' | 'error';

interface ApiKeySetupProps {
  onComplete: () => void;
}

export default function ApiKeySetup({ onComplete }: ApiKeySetupProps) {
  const { t } = useTranslation();

  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [alsoForOpenclaw, setAlsoForOpenclaw] = useState(true);
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [testResult, setTestResult] = useState<{ response?: string; error?: string; model?: string }>({});
  const [saving, setSaving] = useState(false);

  const provider = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  const handleTest = async () => {
    setTestPhase('testing');
    setTestResult({});
    try {
      const res = await invoke<{
        success: boolean;
        response: string | null;
        error: string | null;
        model: string | null;
      }>('test_llm', { provider: selectedProvider, apiKey: apiKey.trim() });

      if (res.success) {
        setTestPhase('success');
        setTestResult({ response: res.response || '', model: res.model || '' });
      } else {
        setTestPhase('error');
        setTestResult({ error: res.error || 'Unknown error' });
      }
    } catch (e) {
      setTestPhase('error');
      setTestResult({ error: String(e) });
    }
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      // Always save to localStorage first — this is what ClawSquire's AI features use
      localStorage.setItem('clawsquire.apiKeyConfigured', 'true');
      localStorage.setItem('clawsquire.llmProvider', selectedProvider);
      localStorage.setItem('clawsquire.apiKey', JSON.stringify({ key: apiKey.trim() }));

      // Optionally configure OpenClaw if it's installed (best-effort)
      try {
        await invoke('setup_provider', { provider: selectedProvider, apiKey: apiKey.trim() });
      } catch {
        // OpenClaw not installed yet — that's OK, key is saved for AI features
      }

      if (alsoForOpenclaw) {
        try {
          await invoke('config_set', {
            path: `llm.${selectedProvider}.api_key`,
            value: apiKey.trim(),
          });
        } catch {
          // OpenClaw might not be installed yet — that's OK
        }
      }

      onComplete();
    } catch (e) {
      setTestPhase('error');
      setTestResult({ error: String(e) });
    }
    setSaving(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mb-2 text-4xl">🔑</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('apiKeySetup.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('apiKeySetup.subtitle')}
          </p>
        </div>

        {/* Recommendation banner */}
        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-4">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
            💡 {t('apiKeySetup.recommendation')}
          </p>
          <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">
            {t('apiKeySetup.recommendationDetail')}
          </p>
        </div>

        {/* Provider grid */}
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map((p) => {
            const selected = selectedProvider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedProvider(p.id);
                  setTestPhase('idle');
                  setTestResult({});
                }}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                  selected
                    ? 'border-claw-500 bg-claw-50 dark:bg-claw-950/30 shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                {p.recommended && (
                  <span className="absolute -top-2 right-2 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {t('apiKeySetup.bestForInstall')}
                  </span>
                )}
                <img src={p.logo} alt={p.name} className="w-8 h-8 rounded" />
                <div className="mt-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t(p.tagline)}</div>
              </button>
            );
          })}
        </div>

        {/* Key input */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('apiKeySetup.enterKey', { provider: provider.name })}
            </h3>
            <a
              href={provider.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-claw-600 hover:text-claw-700 flex items-center gap-1"
            >
              {t('apiKeySetup.getKey')} ↗
            </a>
          </div>

          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestPhase('idle');
                setTestResult({});
              }}
              placeholder={provider.keyPrefix + '...'}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2.5 text-sm font-mono
                         focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none transition-all
                         dark:bg-gray-800 dark:text-gray-100 pr-20"
              autoFocus
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              {showKey ? t('apiKeySetup.hide') : t('apiKeySetup.show')}
            </button>
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V7H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1.5V4.5A3.5 3.5 0 008 1zm2 6V4.5a2 2 0 10-4 0V7h4z" clipRule="evenodd" />
            </svg>
            {t('apiKeySetup.keyLocalOnly')}
          </p>

          {/* Also use for OpenClaw */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoForOpenclaw}
              onChange={(e) => setAlsoForOpenclaw(e.target.checked)}
              className="rounded border-gray-300 text-claw-600 focus:ring-claw-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t('apiKeySetup.alsoForOpenclaw')}
            </span>
          </label>

          {/* Test button */}
          {apiKey.trim().length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
              {testPhase === 'idle' && (
                <button
                  onClick={handleTest}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  {t('apiKeySetup.testKey')}
                </button>
              )}

              {testPhase === 'testing' && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="animate-spin">⏳</span>
                  {t('apiKeySetup.testing')}
                </div>
              )}

              {testPhase === 'success' && (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-1.5">
                    ✅ {t('apiKeySetup.testSuccess')}
                  </p>
                  {testResult.model && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      {t('apiKeySetup.testModel', { model: testResult.model })}
                    </p>
                  )}
                  {testResult.response && (
                    <div className="mt-2 rounded bg-green-100 dark:bg-green-900/40 p-2 text-xs text-green-700 dark:text-green-400">
                      <p className="italic">&ldquo;{testResult.response}&rdquo;</p>
                    </div>
                  )}
                </div>
              )}

              {testPhase === 'error' && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 flex items-center gap-1.5">
                    ❌ {t('apiKeySetup.testFailed')}
                  </p>
                  {testResult.error && (
                    <pre className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded p-2 overflow-auto max-h-24">
                      {testResult.error}
                    </pre>
                  )}
                  <button
                    onClick={() => setTestPhase('idle')}
                    className="mt-2 text-xs text-red-600 dark:text-red-400 underline"
                  >
                    {t('apiKeySetup.tryAgain')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleContinue}
            disabled={apiKey.trim().length === 0 || saving}
            className="rounded-lg bg-claw-600 px-6 py-2.5 text-sm font-medium text-white
                       hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
          >
            {saving ? t('apiKeySetup.saving') : t('apiKeySetup.continue')}
          </button>
        </div>

        {/* Vibeful CTA */}
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 text-center">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {t('apiKeySetup.noKey')}
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            {t('apiKeySetup.vibefulDesc')}
          </p>
          <button
            onClick={() => openVibeful('apikey-setup')}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-all cursor-pointer"
          >
            {t('apiKeySetup.tryVibeful')} ↗
          </button>
        </div>

        {/* Powered by */}
        <p className="text-center text-xs text-gray-400">
          Powered by{' '}
          <button
            onClick={() => openVibeful('powered-by')}
            className="text-blue-500 hover:text-blue-600 cursor-pointer"
          >
            Vibeful Core Engine
          </button>
        </p>
      </div>
    </div>
  );
}
