import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { invoke } from '@tauri-apps/api/core';
import InfoTooltip from '../components/shared/InfoTooltip';

interface Environment {
  openclaw_installed: boolean;
  openclaw_version: string | null;
  openclaw_path: string | null;
  config_dir: string;
  platform: string;
}

interface DaemonStatus {
  running: boolean;
  pid: number | null;
}

interface BackupEntry {
  id: string;
  label: string;
  timestamp: string;
  size_bytes: number;
  path: string;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [env, setEnv] = useState<Environment | null>(null);
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [backupCount, setBackupCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [envResult, daemonResult, backups] = await Promise.allSettled([
        invoke<Environment>('get_environment'),
        invoke<DaemonStatus>('daemon_status'),
        invoke<BackupEntry[]>('list_backups'),
      ]);

      if (envResult.status === 'fulfilled') setEnv(envResult.value);
      if (daemonResult.status === 'fulfilled') setDaemon(daemonResult.value);
      if (backups.status === 'fulfilled') setBackupCount(backups.value.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await invoke('create_backup', { label: null });
      setBackupCount((c) => c + 1);
    } catch {
      // silently handled — user can see error on Backup page
    } finally {
      setBackingUp(false);
    }
  };

  const installed = env?.openclaw_installed ?? false;
  const version = env?.openclaw_version;
  const running = daemon?.running ?? false;

  const statusColor = !installed ? 'bg-gray-400' : running ? 'bg-green-500' : 'bg-red-500';
  const statusText = !installed
    ? t('dashboard.notInstalled')
    : running
      ? t('dashboard.running')
      : t('dashboard.stopped');

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600
                     hover:bg-gray-200 disabled:opacity-50 transition-all"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500">{t('dashboard.openclawStatus')}</h3>
          <InfoTooltip conceptKey="gateway" />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className={`inline-block w-3 h-3 rounded-full ${statusColor} ${running ? 'animate-pulse' : ''}`} />
            <span className="text-lg font-semibold text-gray-900">{statusText}</span>
          </div>
          {version && (
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {version}
            </span>
          )}
        </div>

        {env && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>
              <span className="font-medium text-gray-700">Platform</span>
              <p className="mt-0.5">{env.platform}</p>
            </div>
            <div>
              <span className="font-medium text-gray-700">Config</span>
              <p className="mt-0.5 truncate" title={env.config_dir}>{env.config_dir}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info Cards Row */}
      <div className="grid grid-cols-3 gap-3">
        <InfoCard
          label={t('dashboard.safetyLevel')}
          value={t('dashboard.safetyConservative')}
          icon="🛡️"
          color="bg-green-50 border-green-200"
        />
        <InfoCard
          label={t('backup.title')}
          value={String(backupCount)}
          icon="💾"
          color="bg-blue-50 border-blue-200"
          onClick={() => navigate('/backup')}
        />
        <InfoCard
          label="Daemon"
          value={running ? 'Active' : installed ? 'Stopped' : '—'}
          icon={running ? '🟢' : '⚪'}
          color={running ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard.quickActions')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionCard
            label={t('dashboard.newSetup')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
            onClick={() => navigate('/onboard')}
          />
          <ActionCard
            label={t('dashboard.runDoctor')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
            onClick={() => navigate('/doctor')}
          />
          <ActionCard
            label={t('dashboard.backupNow')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            }
            onClick={handleBackupNow}
            loading={backingUp}
          />
          <ActionCard
            label={t('dashboard.viewConfig')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            }
            onClick={() => navigate('/settings')}
          />
        </div>
      </div>

      {/* Not Installed Guidance */}
      {!installed && !loading && (
        <InstallCard onInstalled={refresh} />
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`rounded-xl border p-4 ${color} ${onClick ? 'cursor-pointer hover:shadow-sm transition-all' : ''}`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-800 mt-0.5">{value}</div>
    </Tag>
  );
}

const INSTALL_STEP_KEYS = ['connect', 'download', 'deps', 'extract', 'verify', 'done'] as const;
const INSTALL_STEP_DELAYS = [0, 3000, 8000, 30000, 0, 0];

function InstallCard({ onInstalled }: { onInstalled: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'idle' | 'installing' | 'done' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<{ success: boolean; version?: string | null; error?: string | null } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handleInstall = async () => {
    setPhase('installing');
    setCurrentStep(0);
    setResult(null);
    setElapsed(0);

    const startTime = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startTime), 1000);

    const stepTimers: ReturnType<typeof setTimeout>[] = [];
    INSTALL_STEP_DELAYS.forEach((delay, idx) => {
      if (delay > 0) {
        stepTimers.push(setTimeout(() => setCurrentStep(idx), delay));
      }
    });

    try {
      const res = await invoke<{ success: boolean; version: string | null; error: string | null }>('install_openclaw');
      clearInterval(timer);
      stepTimers.forEach(clearTimeout);

      if (res.success) {
        setCurrentStep(INSTALL_STEP_KEYS.length - 1);
        setResult(res);
        setPhase('done');
        setTimeout(onInstalled, 2000);
      } else {
        setResult(res);
        setPhase('error');
      }
    } catch (e) {
      clearInterval(timer);
      stepTimers.forEach(clearTimeout);
      setResult({ success: false, error: String(e) });
      setPhase('error');
    }
  };

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-yellow-300 bg-yellow-50 p-6">
      <div className="text-center mb-4">
        <div className="text-4xl mb-3">🦞</div>
        <h3 className="text-base font-semibold text-yellow-800 mb-1">{t('dashboard.notInstalled')}</h3>
        <p className="text-sm text-yellow-700">
          {t('dashboard.install.desc')}
        </p>
      </div>

      {phase === 'idle' && (
        <div className="text-center">
          <div className="bg-yellow-100 rounded-lg p-3 mb-4 text-left">
            <p className="text-xs font-medium text-yellow-800 mb-2">{t('dashboard.install.whatWillHappen')}</p>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• {t('dashboard.install.downloadFromNpm')}</li>
              <li>• {t('dashboard.install.installPackages')}</li>
              <li>• {t('dashboard.install.takeMinutes')}</li>
              <li>• {t('dashboard.install.requireInternet')}</li>
            </ul>
          </div>
          <button
            onClick={handleInstall}
            className="rounded-lg bg-claw-600 px-6 py-2.5 text-sm font-medium text-white
                       hover:bg-claw-700 transition-all shadow-sm"
          >
            {t('dashboard.install.button')}
          </button>
        </div>
      )}

      {phase === 'installing' && (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs">
            <div className="text-gray-500 mb-2">$ npm install -g openclaw@latest</div>
            {INSTALL_STEP_KEYS.slice(0, currentStep + 1).map((key, idx) => (
              <div key={key} className="flex items-center gap-2 text-gray-300">
                {idx < currentStep ? (
                  <span className="text-green-400">✓</span>
                ) : (
                  <span className="text-yellow-400 animate-pulse">●</span>
                )}
                <span className={idx === currentStep ? 'text-white' : 'text-gray-500'}>
                  {t(`dashboard.install.steps.${key}`)}
                </span>
              </div>
            ))}
            <div className="mt-2 text-gray-600 border-t border-gray-700 pt-2">
              {t('dashboard.install.elapsed')}: {formatElapsed(elapsed)}
            </div>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-claw-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(((currentStep + 1) / INSTALL_STEP_KEYS.length) * 100, 95)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-center">
            {t('dashboard.install.appResponsive')}
          </p>
        </div>
      )}

      {phase === 'done' && result?.success && (
        <div className="text-center">
          <div className="rounded-lg bg-green-100 border border-green-200 p-4 text-sm text-green-800">
            <div className="text-2xl mb-2">✅</div>
            <p className="font-semibold">{t('dashboard.install.success', { version: result.version })}</p>
            <p className="text-xs text-green-600 mt-1">{t('dashboard.install.refreshing')}</p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="text-center">
          <div className="rounded-lg bg-red-100 border border-red-200 p-4 text-sm text-red-800">
            <p className="font-semibold mb-2">{t('dashboard.install.failed')}</p>
            <pre className="text-xs text-red-600 bg-red-50 rounded p-2 mt-2 overflow-auto max-h-32 text-left">
              {result?.error}
            </pre>
          </div>
          <button
            onClick={() => { setPhase('idle'); setResult(null); }}
            className="mt-3 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
          >
            {t('dashboard.install.tryAgain')}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  label,
  icon,
  onClick,
  loading,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4
                 hover:border-claw-300 hover:shadow-md transition-all group disabled:opacity-50"
    >
      <span className="text-claw-600 group-hover:text-claw-700">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{loading ? '...' : label}</span>
    </button>
  );
}
