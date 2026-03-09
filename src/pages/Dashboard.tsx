import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { invoke } from '@tauri-apps/api/core';
import InfoTooltip from '../components/shared/InfoTooltip';

interface Environment {
  openclaw_installed: boolean;
  openclaw_version: string | null;
  openclaw_path: string | null;
  npm_installed: boolean;
  npm_version: string | null;
  node_version: string | null;
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

interface LlmConfigStatus {
  has_provider: boolean;
  provider_name: string | null;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [env, setEnv] = useState<Environment | null>(null);
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [backupCount, setBackupCount] = useState<number>(0);
  const [llmStatus, setLlmStatus] = useState<LlmConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [daemonAction, setDaemonAction] = useState<'idle' | 'starting' | 'stopping'>('idle');
  const [updateInfo, setUpdateInfo] = useState<{
    update_available: boolean;
    latest_version?: string | null;
    download_url?: string | null;
  } | null>(null);

  useEffect(() => {
    invoke<{ update_available: boolean; latest_version: string | null; download_url: string | null }>(
      'check_for_updates'
    ).then(setUpdateInfo).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [envResult, daemonResult, backups] = await Promise.allSettled([
        invoke<Environment>('get_environment'),
        invoke<DaemonStatus>('daemon_status'),
        invoke<BackupEntry[]>('list_backups'),
      ]);

      if (envResult.status === 'fulfilled') {
        setEnv(envResult.value);
        if (envResult.value.openclaw_installed) {
          invoke<LlmConfigStatus>('check_llm_config')
            .then(setLlmStatus)
            .catch(() => setLlmStatus(null));
        }
      }
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
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const [daemonError, setDaemonError] = useState<string | null>(null);
  const handleDaemonToggle = async () => {
    if (daemonAction !== 'idle') return;
    const action = running ? 'stopping' : 'starting';
    setDaemonAction(action);
    setDaemonError(null);
    try {
      await invoke(running ? 'daemon_stop' : 'daemon_start');
      await refresh();
    } catch (e) {
      setDaemonError(String(e));
      await refresh();
    } finally {
      setDaemonAction('idle');
    }
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await invoke('create_backup', { label: null });
      setBackupCount((c) => c + 1);
    } catch {
      // user can see error on Backup page
    } finally {
      setBackingUp(false);
    }
  };

  const installed = env?.openclaw_installed ?? false;
  const version = env?.openclaw_version;
  const running = daemon?.running ?? false;
  const llmConfigured = llmStatus?.has_provider ?? false;

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

      {updateInfo?.update_available && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🆕</span>
            <div>
              <p className="text-sm font-medium text-blue-800">
                {t('dashboard.updateAvailable', { version: updateInfo.latest_version })}
              </p>
              <p className="text-xs text-blue-600">
                {t('dashboard.currentVersion', { version: env?.openclaw_version || '0.1.0' })}
              </p>
            </div>
          </div>
          {updateInfo.download_url && (
            <a
              href={updateInfo.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-all whitespace-nowrap"
            >
              {t('dashboard.downloadUpdate')}
            </a>
          )}
        </div>
      )}

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500">{t('dashboard.openclawStatus')}</h3>
          <InfoTooltip conceptKey="gateway" />
        </div>

        <div className="flex items-center justify-between">
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
          {installed && (
            <button
              onClick={handleDaemonToggle}
              disabled={daemonAction !== 'idle'}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                running
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {daemonAction === 'starting'
                ? t('dashboard.daemon.starting')
                : daemonAction === 'stopping'
                  ? t('dashboard.daemon.stopping')
                  : running
                    ? t('dashboard.daemon.stop')
                    : t('dashboard.daemon.start')}
            </button>
          )}
        </div>

        {daemonError && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
            {daemonError}
          </div>
        )}

        {env && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>
              <span className="font-medium text-gray-700">{t('dashboard.platform')}</span>
              <p className="mt-0.5">{env.platform}</p>
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('dashboard.configDir')}</span>
              <p className="mt-0.5 truncate" title={env.config_dir}>{env.config_dir}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info Cards Row */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard
          label={t('dashboard.safetyLevel')}
          value={t('dashboard.safetyConservative')}
          icon="🛡️"
          color="bg-green-50 border-green-200"
          onClick={() => navigate('/settings')}
        />
        <InfoCard
          label={t('backup.title')}
          value={String(backupCount)}
          icon="💾"
          color="bg-blue-50 border-blue-200"
          onClick={() => navigate('/backup')}
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
            onClick={() => navigate('/config')}
          />
        </div>
      </div>

      {/* Not Installed → Install Card */}
      {!installed && !loading && (
        <InstallCard onInstalled={refresh} npmInstalled={env?.npm_installed ?? false} />
      )}

      {/* Installed but no LLM → Setup Guidance */}
      {installed && !llmConfigured && !loading && (
        <LlmGuidanceCard onNavigate={() => navigate('/onboard/llm-provider')} />
      )}

      {/* Installed + LLM configured → Ready to Use! */}
      {installed && llmConfigured && !loading && (
        <ReadyToUseCard
          providerName={llmStatus?.provider_name || ''}
          gatewayRunning={running}
          onStartDaemon={handleDaemonToggle}
          onSetupBots={() => navigate('/onboard')}
        />
      )}
    </div>
  );
}

function LlmGuidanceCard({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50 p-6">
      <div className="text-center mb-4">
        <div className="text-4xl mb-3">🧠</div>
        <h3 className="text-base font-semibold text-purple-800 mb-1">
          {t('dashboard.llmGuide.title')}
        </h3>
        <p className="text-sm text-purple-700">
          {t('dashboard.llmGuide.desc')}
        </p>
      </div>
      <div className="bg-purple-100 rounded-lg p-3 mb-4 text-left">
        <p className="text-xs font-medium text-purple-800 mb-2">{t('dashboard.llmGuide.whyNeeded')}</p>
        <ul className="text-xs text-purple-700 space-y-1">
          <li>• {t('dashboard.llmGuide.reason1')}</li>
          <li>• {t('dashboard.llmGuide.reason2')}</li>
          <li>• {t('dashboard.llmGuide.reason3')}</li>
        </ul>
      </div>
      <div className="text-center">
        <button
          onClick={onNavigate}
          className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white
                     hover:bg-purple-700 transition-all shadow-sm"
        >
          {t('dashboard.llmGuide.button')}
        </button>
      </div>
    </div>
  );
}

function ReadyToUseCard({
  providerName,
  gatewayRunning,
  onStartDaemon,
  onSetupBots,
}: {
  providerName: string;
  gatewayRunning: boolean;
  onStartDaemon: () => void;
  onSetupBots: () => void;
}) {
  const { t } = useTranslation();
  const STORAGE_KEY = 'clawsquire-last-task';

  const stored = (() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) as { phase: string; reply: string; error: string; message: string } : null;
    } catch { return null; }
  })();

  const [message, setMessage] = useState(stored?.message || '');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done' | 'error'>(
    (stored?.phase === 'done' || stored?.phase === 'error') ? stored.phase as 'done' | 'error' : 'idle'
  );
  const [reply, setReply] = useState(stored?.reply || '');
  const [chatError, setChatError] = useState(stored?.error || '');

  const persist = (p: string, r: string, e: string, m: string) => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ phase: p, reply: r, error: e, message: m })); } catch {}
  };

  const handleSend = async () => {
    const msg = message.trim() || 'Hello! What can you do?';
    setPhase('sending');
    setReply('');
    setChatError('');
    try {
      const res = await invoke<{ success: boolean; reply?: string | null; error?: string | null }>('agent_chat', { message: msg });
      if (res.success && res.reply) {
        setReply(res.reply);
        setPhase('done');
        persist('done', res.reply, '', msg);
      } else {
        const err = res.error || 'No response';
        setChatError(err);
        setPhase('error');
        persist('error', '', err, msg);
      }
    } catch (e) {
      const err = String(e);
      setChatError(err);
      setPhase('error');
      persist('error', '', err, msg);
    }
  };

  return (
    <div className="rounded-xl border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 p-6">
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">🎉</div>
        <h3 className="text-base font-semibold text-green-800">
          {t('dashboard.ready.title')}
        </h3>
        <p className="text-sm text-green-700 mt-1">
          {t('dashboard.ready.desc', { provider: providerName })}
        </p>
      </div>

      {!gatewayRunning ? (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-4">
          <p className="text-sm text-yellow-800 font-medium mb-2">{t('dashboard.ready.startDaemonHint')}</p>
          <button
            onClick={onStartDaemon}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-all"
          >
            {t('dashboard.daemon.start')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-green-200 p-4 mb-4">
          <h4 className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
            💬 {t('dashboard.ready.tryChatTitle')}
          </h4>

          {phase === 'idle' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('dashboard.ready.tryChatPlaceholder')}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:ring-1 focus:ring-green-300 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button
                onClick={handleSend}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-all whitespace-nowrap"
              >
                {t('dashboard.ready.send')}
              </button>
            </div>
          )}

          {phase === 'sending' && (
            <div className="flex items-center gap-2 text-sm text-green-600 py-2">
              <span className="animate-spin">⏳</span> {t('dashboard.ready.thinking')}
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-100 p-3 mt-2">
                <p className="text-xs text-green-500 font-medium mb-1">🦞 OpenClaw:</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{reply}</p>
              </div>
              <button
                onClick={() => { setPhase('idle'); setMessage(''); sessionStorage.removeItem(STORAGE_KEY); }}
                className="text-xs text-green-600 underline"
              >
                {t('dashboard.ready.chatAgain')}
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-2 mt-2">
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-xs text-yellow-700">{chatError}</p>
              </div>
              <button
                onClick={() => setPhase('idle')}
                className="text-xs text-yellow-600 underline"
              >
                {t('dashboard.install.tryAgain')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="text-center">
        <button
          onClick={onSetupBots}
          className="text-sm text-green-700 hover:text-green-900 underline transition-colors"
        >
          {t('dashboard.ready.setupBotsHint')}
        </button>
      </div>
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

function InstallCard({ onInstalled, npmInstalled }: { onInstalled: () => void; npmInstalled: boolean }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'idle' | 'installing-node' | 'installing' | 'done' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<{ success: boolean; version?: string | null; error?: string | null } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [nodeInstalled, setNodeInstalled] = useState(npmInstalled);

  const handleInstallNode = async () => {
    setPhase('installing-node');
    setResult(null);
    setElapsed(0);

    const startTime = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startTime), 1000);

    try {
      const res = await invoke<{
        success: boolean;
        version: string | null;
        node_path: string | null;
        error: string | null;
      }>('install_node');
      clearInterval(timer);

      if (res.success) {
        setNodeInstalled(true);
        setPhase('idle');
        onInstalled();
      } else {
        setResult({ success: false, error: res.error });
        setPhase('error');
      }
    } catch (e) {
      clearInterval(timer);
      setResult({ success: false, error: String(e) });
      setPhase('error');
    }
  };

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
        onInstalled();
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

      {phase === 'idle' && !nodeInstalled && (
        <div className="text-center">
          <div className="bg-red-100 rounded-lg p-4 text-left">
            <p className="text-sm font-medium text-red-800 mb-2">{t('dashboard.install.npmRequired')}</p>
            <p className="text-xs text-red-700 mb-3">{t('dashboard.install.npmRequiredDesc')}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleInstallNode}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 transition-all"
              >
                {t('dashboard.install.autoInstallNode')}
              </button>
              <a
                href="https://nodejs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-xs text-red-600 hover:text-red-800 transition-all underline"
              >
                {t('dashboard.install.orDownloadManually')}
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" />
                  <path d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {phase === 'installing-node' && (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs">
            <div className="text-gray-500 mb-2">{t('dashboard.install.nodeInstalling')}</div>
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-yellow-400 animate-pulse">●</span>
              <span className="text-white">{t('dashboard.install.nodeDownloading')}</span>
            </div>
            <div className="mt-2 text-gray-600 border-t border-gray-700 pt-2">
              {t('dashboard.install.elapsed')}: {formatElapsed(elapsed)}
            </div>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-xs text-gray-500 text-center">
            {t('dashboard.install.nodeInstallHint')}
          </p>
        </div>
      )}

      {phase === 'idle' && nodeInstalled && (
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
