import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface ImapPreset {
  host: string;
  port: number;
  tls: boolean;
}

type Step = 'email' | 'server' | 'password' | 'done';

export default function ImapWizard() {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('993');
  const [tls, setTls] = useState(true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailNext = async () => {
    if (!email.includes('@')) return;
    setError(null);
    try {
      const preset = await invoke<ImapPreset | null>('detect_imap_preset', { email });
      if (preset) {
        setHost(preset.host);
        setPort(String(preset.port));
        setTls(preset.tls);
      }
    } catch {
      // fallback: leave fields for manual entry
    }
    setStep('server');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await invoke('save_imap_config', {
        email,
        host,
        port: parseInt(port, 10) || 993,
        tls,
        password,
      });
      try {
        await invoke('store_secret', { key: `imap_password:${email}`, value: password });
      } catch {
        // Keyring storage is best-effort; config file already has the password
      }
      setStep('done');
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none transition-all font-mono bg-white dark:bg-gray-800";

  const stepIndex = { email: 1, server: 2, password: 3, done: 4 }[step];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('imap.title')}</h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">{t('imap.subtitle')}</p>
      </div>

      {/* Progress */}
      {step !== 'done' && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                i <= stepIndex
                  ? 'bg-claw-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-400'
              }`}>
                {i}
              </div>
              {i < 3 && <div className={`w-8 h-0.5 ${i < stepIndex ? 'bg-claw-600' : 'bg-gray-200 dark:bg-gray-800'}`} />}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Email */}
      {step === 'email' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="font-semibold">{t('imap.step1Title')}</h3>
          <p className="text-sm text-gray-500">{t('imap.step1Desc')}</p>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('imap.emailPlaceholder')}
            className={inputClass}
            onKeyDown={e => e.key === 'Enter' && handleEmailNext()}
          />
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
            {t('imap.providerHint')}
          </div>
          <button
            onClick={handleEmailNext}
            disabled={!email.includes('@')}
            className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 disabled:opacity-50 transition-all"
          >
            {t('onboard.next')}
          </button>
        </div>
      )}

      {/* Step 2: Server config */}
      {step === 'server' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="font-semibold">{t('imap.step2Title')}</h3>
          <p className="text-sm text-gray-500">{t('imap.step2Desc')}</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('imap.host')}</label>
              <input type="text" value={host} onChange={e => setHost(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('imap.port')}</label>
              <input type="text" value={port} onChange={e => setPort(e.target.value)} className={inputClass} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tls} onChange={e => setTls(e.target.checked)} className="rounded" />
            {t('imap.useTls')}
          </label>

          <div className="flex gap-3">
            <button onClick={() => setStep('email')} className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">{t('onboard.back')}</button>
            <button
              onClick={() => setStep('password')}
              disabled={!host.trim()}
              className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 disabled:opacity-50 transition-all"
            >
              {t('onboard.next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Password */}
      {step === 'password' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="font-semibold">{t('imap.step3Title')}</h3>
          <p className="text-sm text-gray-500">{t('imap.step3Desc')}</p>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
            {t('imap.appPasswordHint')}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('imap.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
          </div>

          <div className="text-sm text-gray-500 space-y-1">
            <p className="font-medium">{t('imap.summary')}</p>
            <p className="font-mono text-xs">{email} → {host}:{port} ({tls ? 'TLS' : 'Plain'})</p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('server')} className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">{t('onboard.back')}</button>
            <button
              onClick={handleSave}
              disabled={!password || saving}
              className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 disabled:opacity-50 transition-all"
            >
              {saving ? t('onboard.wizard.saving') : t('imap.saveAndTest')}
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center space-y-3">
          <div className="text-3xl">✅</div>
          <h3 className="font-semibold text-green-700 dark:text-green-400">{t('imap.doneTitle')}</h3>
          <p className="text-sm text-green-600 dark:text-green-500">{t('imap.doneDesc')}</p>
          <p className="font-mono text-xs text-gray-500">{email} → {host}:{port}</p>
        </div>
      )}
    </div>
  );
}
