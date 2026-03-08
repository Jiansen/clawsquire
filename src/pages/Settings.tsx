import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SUPPORTED_LOCALES, changeLocale } from '../i18n';
import SafetyPresets, { type SafetyLevel } from '../components/shared/SafetyPresets';
import InfoTooltip from '../components/shared/InfoTooltip';

const SAFETY_KEY = 'clawsquire.safetyLevel';

type Theme = 'light' | 'dark' | 'system';

interface UninstallResult {
  daemon_stopped: boolean;
  npm_uninstalled: boolean;
  config_removed: boolean;
  errors: string[];
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>('system');
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>(() => {
    return (localStorage.getItem(SAFETY_KEY) as SafetyLevel) || 'conservative';
  });

  const [uninstallStep, setUninstallStep] = useState<'idle' | 'confirm' | 'options' | 'running' | 'done'>('idle');
  const [removeConfig, setRemoveConfig] = useState(false);
  const [uninstallResult, setUninstallResult] = useState<UninstallResult | null>(null);

  const [env, setEnv] = useState<{ openclaw_installed: boolean; openclaw_version: string | null } | null>(null);

  useEffect(() => {
    invoke<{ openclaw_installed: boolean; openclaw_version: string | null }>('get_environment').then(setEnv);
  }, []);

  const handleSafetyChange = (level: SafetyLevel) => {
    setSafetyLevel(level);
    localStorage.setItem(SAFETY_KEY, level);
  };

  const [uninstallCurrentStep, setUninstallCurrentStep] = useState(0);
  const [uninstallElapsed, setUninstallElapsed] = useState(0);

  const UNINSTALL_STEP_KEYS = [
    'backup', 'daemon', 'npm',
    ...(removeConfig ? ['config'] : []),
    'verify', 'done',
  ];

  const handleUninstall = async () => {
    setUninstallStep('running');
    setUninstallCurrentStep(0);
    setUninstallElapsed(0);

    const startTime = Date.now();
    const timer = setInterval(() => setUninstallElapsed(Date.now() - startTime), 1000);

    try {
      setUninstallCurrentStep(0);
      await invoke('create_backup', { label: 'pre-uninstall' }).catch(() => {});

      setUninstallCurrentStep(1);
      await new Promise(r => setTimeout(r, 500));

      setUninstallCurrentStep(2);
      const result = await invoke<UninstallResult>('uninstall_openclaw', { removeConfig });

      if (removeConfig) {
        setUninstallCurrentStep(3);
        await new Promise(r => setTimeout(r, 300));
        setUninstallCurrentStep(4);
      } else {
        setUninstallCurrentStep(3);
      }
      await new Promise(r => setTimeout(r, 300));
      setUninstallCurrentStep(UNINSTALL_STEP_KEYS.length - 1);

      clearInterval(timer);
      setUninstallResult(result);
      setUninstallStep('done');
    } catch (e) {
      clearInterval(timer);
      setUninstallResult({
        daemon_stopped: false,
        npm_uninstalled: false,
        config_removed: false,
        errors: [String(e)],
      });
      setUninstallStep('done');
    }
  };

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h2>

      {/* Safety Level */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500">{t('settings.safety')}</h3>
          <InfoTooltip conceptKey="sandbox" />
        </div>
        <SafetyPresets value={safetyLevel} onChange={handleSafetyChange} showDetails />
      </div>

      {/* Language */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('settings.language')}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale.code}
              onClick={() => changeLocale(locale.code)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                i18n.language === locale.code
                  ? 'bg-claw-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-base">{locale.flag}</span>
              <span>{locale.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('settings.theme')}</h3>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setTheme(opt)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                theme === opt
                  ? 'bg-claw-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`settings.${opt}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <h3 className="text-sm font-medium text-red-500 mb-4">{t('settings.dangerZone')}</h3>

        {uninstallStep === 'idle' && (
          <>
            <p className="text-sm text-gray-500 mb-3">{t('settings.uninstallDescription')}</p>
            <button
              onClick={() => setUninstallStep('confirm')}
              disabled={!env?.openclaw_installed}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600
                         hover:bg-red-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('settings.uninstallOpenClaw')}
            </button>
            {!env?.openclaw_installed && (
              <p className="text-xs text-gray-400 mt-2">{t('dashboard.notInstalled')}</p>
            )}
          </>
        )}

        {uninstallStep === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-medium text-red-800 mb-3">{t('settings.uninstall.confirmTitle')}</p>
              <p className="text-sm text-red-700 mb-4">{t('settings.uninstall.confirmDesc')}</p>

              <label className="flex items-center gap-2 text-sm text-red-700 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeConfig}
                  onChange={(e) => setRemoveConfig(e.target.checked)}
                  className="rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                {t('settings.uninstall.alsoDeleteConfig')}
              </label>

              <p className="text-xs text-red-600 mb-4">
                {t('settings.uninstall.autoBackupNote')}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handleUninstall}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-all"
                >
                  {t('settings.uninstallOpenClaw')}
                </button>
                <button
                  onClick={() => setUninstallStep('idle')}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {uninstallStep === 'running' && (
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs">
              <div className="text-gray-500 mb-2">$ npm uninstall -g openclaw</div>
              {UNINSTALL_STEP_KEYS.slice(0, uninstallCurrentStep + 1).map((key, idx) => (
                <div key={key} className="flex items-center gap-2 text-gray-300">
                  {idx < uninstallCurrentStep ? (
                    <span className="text-green-400">✓</span>
                  ) : (
                    <span className="text-yellow-400 animate-pulse">●</span>
                  )}
                  <span className={idx === uninstallCurrentStep ? 'text-white' : 'text-gray-500'}>
                    {t(`settings.uninstall.steps.${key}`)}
                  </span>
                </div>
              ))}
              <div className="mt-2 text-gray-600 border-t border-gray-700 pt-2">
              {t('dashboard.install.elapsed')}: {formatElapsed(uninstallElapsed)}
            </div>
          </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(((uninstallCurrentStep + 1) / UNINSTALL_STEP_KEYS.length) * 100, 95)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center">
              {t('settings.uninstall.appResponsive')}
            </p>
          </div>
        )}

        {uninstallStep === 'done' && uninstallResult && (
          <div className="space-y-3">
            <div className="space-y-2">
              <StatusLine ok={uninstallResult.daemon_stopped} label="Stop daemon" />
              <StatusLine ok={uninstallResult.npm_uninstalled} label="Uninstall package (npm)" />
              {removeConfig && <StatusLine ok={uninstallResult.config_removed} label="Remove config files" />}
            </div>
            {uninstallResult.errors.length > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-xs font-medium text-yellow-800 mb-1">{t('settings.uninstall.notes')}</p>
                {uninstallResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-yellow-700">{err}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => { setUninstallStep('idle'); setUninstallResult(null); }}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
            >
              {t('common.close')}
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('settings.about')}</h3>
        <div className="space-y-2 text-sm">
          <AboutRow label={t('settings.version')} value="0.1.0" />
          <AboutRow label="OpenClaw" value={env?.openclaw_version ?? '—'} />
          <AboutRow label="Tauri" value="2.x" />
          <AboutRow label="React" value="19.x" />
        </div>
      </div>
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-green-600' : 'text-red-600'}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? 'text-gray-700' : 'text-red-700'}>{label}</span>
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-900">{value}</span>
    </div>
  );
}
