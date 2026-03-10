import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface RemoteInstallCommand {
  command: string;
  post_install_steps: string[];
}

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'groq', label: 'Groq' },
  { id: 'zai', label: 'Zhipu GLM' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'xai', label: 'xAI Grok' },
];

const CHANNELS = [
  { id: 'telegram', label: 'Telegram Bot' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'discord', label: 'Discord' },
  { id: 'slack', label: 'Slack' },
];

const SAFETY_LEVELS = [
  { id: 'conservative', labelKey: 'remote.safetyConservative' },
  { id: 'standard', labelKey: 'remote.safetyStandard' },
  { id: 'full', labelKey: 'remote.safetyFull' },
];

export default function RemoteInstall() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState('');
  const [channel, setChannel] = useState('');
  const [safety, setSafety] = useState('standard');
  const [noStart, setNoStart] = useState(false);
  const [result, setResult] = useState<RemoteInstallCommand | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    try {
      const cmd = await invoke<RemoteInstallCommand>('generate_install_command', {
        provider: provider || null,
        channel: channel || null,
        safety: safety || null,
        noStart,
      });
      setResult(cmd);
      setCopied(false);
    } catch (e) {
      console.error('Failed to generate command:', e);
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = result.command;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('remote.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('remote.subtitle')}</p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-5a1 1 0 10-2 0v3a1 1 0 102 0V9z" clipRule="evenodd" />
            </svg>
          </span>
          <p className="text-sm text-amber-800 dark:text-amber-200">{t('remote.securityNote')}</p>
        </div>
      </div>

      {/* Provider */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">{t('remote.provider')}</label>
        <div className="grid grid-cols-4 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(provider === p.id ? '' : p.id)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                provider === p.id
                  ? 'border-claw-500 bg-claw-50 dark:bg-claw-900/30 text-claw-700 dark:text-claw-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">{t('remote.providerHint')}</p>
      </div>

      {/* Channel */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">{t('remote.channel')}</label>
        <div className="grid grid-cols-4 gap-2">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setChannel(channel === ch.id ? '' : ch.id)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                channel === ch.id
                  ? 'border-claw-500 bg-claw-50 dark:bg-claw-900/30 text-claw-700 dark:text-claw-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">{t('remote.channelHint')}</p>
      </div>

      {/* Safety level */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">{t('remote.safety')}</label>
        <div className="flex gap-2">
          {SAFETY_LEVELS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSafety(s.id)}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                safety === s.id
                  ? 'border-claw-500 bg-claw-50 dark:bg-claw-900/30 text-claw-700 dark:text-claw-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={noStart}
          onChange={(e) => setNoStart(e.target.checked)}
          className="rounded"
        />
        {t('remote.noStart')}
      </label>

      {/* Generate button */}
      <button
        onClick={generate}
        className="w-full py-3 bg-claw-600 hover:bg-claw-700 text-white rounded-lg font-medium transition-colors"
      >
        {t('remote.generate')}
      </button>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="relative">
            <div className="bg-gray-900 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
              {result.command}
            </div>
            <button
              onClick={copyToClipboard}
              className={`absolute top-2 right-2 px-3 py-1 text-xs rounded transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {copied ? t('remote.copied') : t('remote.copy')}
            </button>
          </div>

          {result.post_install_steps.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                {t('remote.postInstall')}
              </h3>
              <ol className="list-decimal list-inside space-y-1">
                {result.post_install_steps.map((step, i) => (
                  <li key={i} className="text-sm text-blue-700 dark:text-blue-300">{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
