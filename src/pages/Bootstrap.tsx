import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useActiveTarget } from '../context/ActiveTargetContext';

interface BootstrapStep {
  id: string;
  label: string;
  status: 'done' | 'pending' | 'running' | 'failed';
  action: string | null;
}

interface BootstrapStatus {
  node_ready: boolean;
  openclaw_ready: boolean;
  serve_reachable: boolean;
  missing: string[];
  steps: BootstrapStep[];
}

interface BootstrapEvent {
  step: string;
  status: string;
  message: string;
  detail: string | null;
}

interface BootstrapResult {
  success: boolean;
  port: number | null;
  token: string | null;
  platform: string | null;
  arch: string | null;
  error: string | null;
}

interface RemoteEnvironment {
  platform: string;
  arch: string;
  node_version: string | null;
  openclaw_version: string | null;
  openclaw_installed: boolean;
  npm_installed: boolean;
}

interface NodeInstallResult {
  success: boolean;
  version: string | null;
  error: string | null;
}

interface InstallResult {
  success: boolean;
  version: string | null;
  error: string | null;
}

interface VpsInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: string;
  key_path: string | null;
}

function osLabel(platform: string): string {
  switch (platform) {
    case 'linux': return 'Linux';
    case 'macos': case 'darwin': return 'macOS';
    case 'windows': return 'Windows';
    default: return platform;
  }
}

function stepStatusIcon(status: string) {
  switch (status) {
    case 'ok':
      return <span className="text-green-500">&#10003;</span>;
    case 'fail':
      return <span className="text-red-500">&#10007;</span>;
    case 'running':
      return (
        <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      );
    default:
      return <span className="text-gray-400">&#9679;</span>;
  }
}

export default function Bootstrap() {
  const { t } = useTranslation();
  const { target, setTarget } = useActiveTarget();
  const isRemote = target.mode === 'protocol';

  // Tabs
  const [tab, setTab] = useState<'auto' | 'manual' | 'verify'>('auto');

  // Auto SSH form
  const [instances, setInstances] = useState<VpsInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('root');
  const [sshAuthMethod, setSshAuthMethod] = useState<'key' | 'password'>('key');
  const [sshKeyPath, setSshKeyPath] = useState('~/.ssh/id_rsa');
  const [sshPassword, setSshPassword] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);
  const [events, setEvents] = useState<BootstrapEvent[]>([]);
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Manual install
  const [installScript, setInstallScript] = useState('');
  const [scriptPlatform, setScriptPlatform] = useState<'linux' | 'macos' | 'windows'>('linux');
  const [copied, setCopied] = useState(false);

  // Verify
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remoteEnv, setRemoteEnv] = useState<RemoteEnvironment | null>(null);

  // Load VPS instances
  useEffect(() => {
    invoke<VpsInstance[]>('list_instances').then((list) => {
      setInstances(list);
      if (list.length > 0) {
        const first = list[0];
        setSelectedInstance(first.id);
        fillFromInstance(first);
      }
    });
  }, []);

  const fillFromInstance = (inst: VpsInstance) => {
    setSshHost(inst.host);
    setSshPort(String(inst.port));
    setSshUser(inst.username);
    setSshAuthMethod(inst.auth_method === 'password' ? 'password' : 'key');
    if (inst.key_path) setSshKeyPath(inst.key_path);
  };

  const handleInstanceChange = (id: string) => {
    setSelectedInstance(id);
    const inst = instances.find((i) => i.id === id);
    if (inst) fillFromInstance(inst);
  };

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  // Install script for manual tab
  useEffect(() => {
    invoke<string>('bootstrap_get_script', {
      platform: scriptPlatform,
      arch: 'x86_64',
    }).then(setInstallScript);
  }, [scriptPlatform]);

  // Listen for bootstrap events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<BootstrapEvent>('bootstrap-event', (e) => {
      setEvents((prev) => [...prev, e.payload]);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  const startBootstrap = async () => {
    setBootstrapping(true);
    setEvents([]);
    setBootstrapResult(null);
    setError(null);

    try {
      const result = await invoke<BootstrapResult>('bootstrap_ssh_start', {
        host: sshHost,
        port: parseInt(sshPort) || 22,
        username: sshUser,
        authMethod: sshAuthMethod,
        password: sshAuthMethod === 'password' ? sshPassword : null,
        keyPath: sshAuthMethod === 'key' ? sshKeyPath : null,
      });

      setBootstrapResult(result);

      if (result.success && result.token && result.port) {
        // Persist serve token+port so VpsManager can reconnect without re-bootstrapping
        const instanceId = selectedInstance || 'ssh-bootstrap';
        try {
          await invoke('set_instance_serve', {
            id: instanceId,
            servePort: result.port,
            serveToken: result.token,
          });
        } catch (_) {
          // Non-fatal: auto-connect still works even if persist fails
        }
        // Auto-connect
        try {
          await setTarget('protocol', {
            url: `ws://${sshHost}:${result.port}`,
            token: result.token,
            instanceId,
            host: sshHost,
          });
          setTab('verify');
        } catch (connectErr) {
          setError(`Connected but auto-connect failed: ${connectErr}`);
        }
      } else if (result.error) {
        setError(result.error);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBootstrapping(false);
    }
  };

  const detect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await invoke<RemoteEnvironment>('get_environment');
      setRemoteEnv(env);
      const result = await invoke<BootstrapStatus>('bootstrap_detect');
      setStatus(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isRemote && tab === 'verify') {
      detect();
    }
  }, [isRemote, tab, detect]);

  const handleInstall = async (component: string) => {
    setInstalling(component);
    setError(null);
    try {
      if (component === 'node') {
        const result = await invoke<NodeInstallResult>('bootstrap_install_node');
        if (!result.success) setError(result.error || t('bootstrap.installFailed'));
      } else if (component === 'openclaw') {
        const result = await invoke<InstallResult>('bootstrap_install_openclaw');
        if (!result.success) setError(result.error || t('bootstrap.installFailed'));
      }
      await detect();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
    }
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(installScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = installScript;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const envStatusIcon = (s: BootstrapStep['status']) => {
    switch (s) {
      case 'done':
        return (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 animate-pulse">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        );
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('bootstrap.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('bootstrap.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {(['auto', 'manual', 'verify'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {id === 'auto' ? t('bootstrap.tabAuto') : id === 'manual' ? t('bootstrap.tabManual') : t('bootstrap.tabVerify')}
          </button>
        ))}
      </div>

      {/* Tab: Auto Setup */}
      {tab === 'auto' && (
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h2 className="text-lg font-semibold">{t('bootstrap.autoTitle')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('bootstrap.autoDesc')}</p>

          {/* Instance selector */}
          {instances.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('bootstrap.selectInstance')}</label>
              <select
                value={selectedInstance}
                onChange={(e) => handleInstanceChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <option value="">{t('bootstrap.customSsh')}</option>
                {instances.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name} ({inst.host})</option>
                ))}
              </select>
            </div>
          )}

          {/* SSH form */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Host</label>
              <input
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Port</label>
              <input
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                placeholder="22"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Username</label>
              <input
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="root"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Auth</label>
              <select
                value={sshAuthMethod}
                onChange={(e) => setSshAuthMethod(e.target.value as 'key' | 'password')}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <option value="key">SSH Key</option>
                <option value="password">Password</option>
              </select>
            </div>
          </div>

          {sshAuthMethod === 'key' ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Key Path</label>
              <input
                value={sshKeyPath}
                onChange={(e) => setSshKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              />
            </div>
          )}

          <button
            onClick={startBootstrap}
            disabled={bootstrapping || !sshHost}
            className="w-full py-2.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
          >
            {bootstrapping ? t('bootstrap.bootstrapping') : t('bootstrap.startSetup')}
          </button>

          {/* Progress log */}
          {events.length > 0 && (
            <div
              ref={logRef}
              className="max-h-64 overflow-y-auto bg-gray-950 rounded-lg p-4 space-y-1.5 font-mono text-xs"
            >
              {events.map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">{stepStatusIcon(ev.status)}</span>
                  <div>
                    <span className={ev.status === 'fail' ? 'text-red-400' : ev.status === 'ok' ? 'text-green-400' : 'text-gray-300'}>
                      {ev.message}
                    </span>
                    {ev.detail && (
                      <div className="text-gray-500 mt-0.5 text-[11px]">{ev.detail}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {bootstrapResult?.success && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3 text-center font-medium">
              {t('bootstrap.autoSuccess')}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2">
              {error}
            </div>
          )}
        </section>
      )}

      {/* Tab: Manual */}
      {tab === 'manual' && (
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold">{t('bootstrap.step1Title')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('bootstrap.step1Desc')}</p>

          <div className="flex gap-2">
            {(['linux', 'macos', 'windows'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setScriptPlatform(p)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  scriptPlatform === p
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {p === 'linux' ? 'Linux' : p === 'macos' ? 'macOS' : 'Windows'}
              </button>
            ))}
          </div>

          <div className="relative">
            <pre className="bg-gray-950 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
              {installScript}
            </pre>
            <button
              onClick={copyScript}
              className="absolute top-2 right-2 px-2.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              {copied ? t('bootstrap.copied') : t('bootstrap.copy')}
            </button>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              {t('bootstrap.cargoFallback')}
            </summary>
            <pre className="mt-2 bg-gray-950 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
              {`# Requires Rust toolchain (https://rustup.rs)\ncargo install --git https://github.com/Jiansen/clawsquire.git clawsquire-serve\nclawsquire-serve --init`}
            </pre>
          </details>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold mb-2">{t('bootstrap.step2Title')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('bootstrap.step2Desc')}</p>
            {isRemote ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {t('bootstrap.connected', { host: target.host || 'remote' })}
              </div>
            ) : (
              <div className="mt-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 py-2">
                {t('bootstrap.notConnected')}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tab: Verify & Install Dependencies */}
      {tab === 'verify' && (
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('bootstrap.step3Title')}</h2>
            {isRemote && (
              <button
                onClick={detect}
                disabled={loading}
                className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
              >
                {loading ? t('bootstrap.detecting') : t('bootstrap.refresh')}
              </button>
            )}
          </div>

          {!isRemote && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('bootstrap.connectFirst')}</p>
          )}

          {isRemote && remoteEnv && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-1.5">
                <span className="text-gray-500 dark:text-gray-400">{t('bootstrap.remoteOS')}: </span>
                <span className="font-medium">{osLabel(remoteEnv.platform)} {remoteEnv.arch}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-1.5">
                <span className="text-gray-500 dark:text-gray-400">Node: </span>
                <span className="font-medium">{remoteEnv.node_version || '—'}</span>
              </div>
            </div>
          )}

          {isRemote && status && (
            <div className="space-y-3">
              {status.steps.map((step) => (
                <div key={step.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    {envStatusIcon(installing === step.id ? 'running' : step.status)}
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                  {step.action && step.status === 'pending' && (
                    <button
                      onClick={() => handleInstall(step.id)}
                      disabled={installing !== null}
                      className="px-3 py-1 text-xs rounded-md bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
                    >
                      {installing === step.id ? t('bootstrap.installing') : t('bootstrap.install')}
                    </button>
                  )}
                </div>
              ))}

              {status.missing.length === 0 && (
                <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3 text-center font-medium">
                  {t('bootstrap.allReady')}
                </div>
              )}
            </div>
          )}

          {isRemote && loading && !status && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('bootstrap.detecting')}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2">
              {error}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
