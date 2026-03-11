import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

interface VpsInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: string;
  password?: string | null;
  key_path?: string | null;
  openclaw_installed?: boolean | null;
  openclaw_version?: string | null;
  last_connected?: string | null;
  created_at: string;
  serve_port?: number | null;
  serve_token?: string | null;
}

/** Must stay in sync with PROTOCOL_VERSION in crates/clawsquire-core/src/protocol.rs */
const DESKTOP_PROTOCOL_VERSION = '0.3.0';

function majorOf(v: string): number {
  return parseInt(v.split('.')[0] ?? '0', 10);
}

interface ActiveTargetInfo {
  mode: string;
  instance_id?: string;
  host?: string;
  serve_version?: string | null;
}

type AuthMethod = 'password' | 'key';
type Tab = 'overview' | 'setup';

function generateId() {
  return `vps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function VpsManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [instances, setInstances] = useState<VpsInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('22');
  const [formUsername, setFormUsername] = useState('root');
  const [formAuth, setFormAuth] = useState<AuthMethod>('password');
  const [formPassword, setFormPassword] = useState('');
  const [formKeyPath, setFormKeyPath] = useState('~/.ssh/id_ed25519');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const [activeTarget, setActiveTarget] = useState<ActiveTargetInfo | null>(null);
  const [connecting, setConnecting] = useState(false);

  const loadInstances = useCallback(async () => {
    try {
      const list = await invoke<VpsInstance[]>('list_instances');
      setInstances(list);
      if (list.length > 0 && !selectedId) {
        // Prefer ?focus=<id> (navigated from Bootstrap success), then first instance
        const focusId = searchParams.get('focus');
        const preferred = (focusId && list.find(i => i.id === focusId)) || list[0];
        setSelectedId(preferred.id);
      }
    } catch {
      // ignore
    }
  }, [selectedId, searchParams]);

  const loadActiveTarget = useCallback(async () => {
    try {
      const info = await invoke<ActiveTargetInfo>('get_active_target');
      setActiveTarget(info);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadInstances();
    loadActiveTarget();
  }, [loadInstances, loadActiveTarget]);

  const selected = instances.find(i => i.id === selectedId) ?? null;

  const isConnectedTo = (inst: VpsInstance) =>
    activeTarget?.mode === 'protocol' && activeTarget.instance_id === inst.id;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await invoke<string>('ssh_test_connection', {
        host: formHost,
        port: parseInt(formPort, 10) || 22,
        username: formUsername,
        authMethod: formAuth,
        password: formAuth === 'password' ? formPassword : null,
        keyPath: formAuth === 'key' ? formKeyPath : null,
      });
      setTestResult({ success: true });
    } catch (e) {
      setTestResult({ success: false, error: String(e) });
    }
    setTesting(false);
  };

  const handleSaveInstance = async () => {
    if (!formHost.trim() || !formUsername.trim()) return;
    const inst: VpsInstance = {
      id: generateId(),
      name: formName.trim() || `${formHost}:${formPort}`,
      host: formHost.trim(),
      port: parseInt(formPort, 10) || 22,
      username: formUsername.trim(),
      auth_method: formAuth,
      key_path: formAuth === 'key' ? formKeyPath : null,
      created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    };
    try {
      const saved = await invoke<VpsInstance>('add_instance', { instance: inst });
      await loadInstances();
      setSelectedId(saved.id);
      setShowAddForm(false);
      resetForm();
    } catch (e) {
      console.error('Failed to save instance:', e);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteInstance = async (id: string) => {
    try {
      await invoke('delete_instance', { id });
      const remaining = instances.filter(i => i.id !== id);
      if (selectedId === id) {
        setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      }
      await loadInstances();
      setConfirmDeleteId(null);
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke('set_active_target', { mode: 'local' });
      await loadActiveTarget();
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  };

  const handleConnect = async (inst: VpsInstance) => {
    if (!inst.serve_port || !inst.serve_token) {
      // No stored serve info — guide user to Bootstrap with this instance pre-selected
      navigate(`/bootstrap?instanceId=${inst.id}`);
      return;
    }
    setConnecting(true);
    try {
      const url = `ws://${inst.host}:${inst.serve_port}`;
      await invoke('set_active_target', {
        mode: 'protocol',
        url,
        token: inst.serve_token,
        instanceId: inst.id,
        host: inst.host,
      });
      await loadActiveTarget();
    } catch (e) {
      console.error('Failed to connect:', e);
    }
    setConnecting(false);
  };

  const handleGoToBootstrap = (instId?: string) => {
    const id = instId || selectedId;
    navigate(id ? `/bootstrap?instanceId=${id}` : '/bootstrap');
  };

  const resetForm = () => {
    setFormName('');
    setFormHost('');
    setFormPort('22');
    setFormUsername('root');
    setFormAuth('password');
    setFormPassword('');
    setFormKeyPath('~/.ssh/id_ed25519');
    setTestResult(null);
  };

  const canSave = formHost.trim().length > 0 && formUsername.trim().length > 0 && testResult?.success;
  const canTestConnection = formHost.trim().length > 0 && formUsername.trim().length > 0 &&
    (formAuth === 'password' ? formPassword.length > 0 : formKeyPath.trim().length > 0);

  const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none transition-all font-mono bg-white dark:bg-gray-800";

  return (
    <div className="flex gap-6 max-w-5xl">
      {/* Instance sidebar */}
      <div className="w-56 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {t('vps.instances')}
          </h2>
          <button
            onClick={() => { setShowAddForm(true); setSelectedId(null); resetForm(); }}
            className="text-claw-600 hover:text-claw-700 text-lg font-bold leading-none"
            title={t('vps.addInstance')}
          >
            +
          </button>
        </div>

        {instances.length === 0 && !showAddForm && (
          <div className="text-sm text-gray-400 text-center py-8">
            {t('vps.noInstances')}
            <button
              onClick={() => setShowAddForm(true)}
              className="block mx-auto mt-2 text-claw-600 hover:text-claw-700 font-medium"
            >
              {t('vps.addFirst')}
            </button>
          </div>
        )}

        {instances.map(inst => (
          <button
            key={inst.id}
            onClick={() => { setSelectedId(inst.id); setShowAddForm(false); setActiveTab('overview'); }}
            className={`w-full text-left rounded-lg p-3 text-sm transition-colors ${
              selectedId === inst.id && !showAddForm
                ? 'bg-claw-50 dark:bg-claw-900/30 border-claw-500 border'
                : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300'
            }`}
          >
            <div className="font-medium truncate flex items-center gap-2">
              {inst.name}
              {isConnectedTo(inst) && (
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" title="Connected" />
              )}
            </div>
            <div className="text-xs text-gray-400 font-mono truncate">{inst.username}@{inst.host}:{inst.port}</div>
            {inst.openclaw_installed && (
              <span className="inline-block mt-1 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5">
                OpenClaw
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Add instance form */}
        {showAddForm && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">{t('vps.addInstance')}</h2>
              <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">{t('vps.addDesc')}</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('vps.instanceName')}</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder={t('vps.namePlaceholder')} className={inputClass} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ssh.host')}</label>
                  <input type="text" value={formHost} onChange={e => setFormHost(e.target.value)} placeholder="192.168.1.100" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ssh.port')}</label>
                  <input type="text" value={formPort} onChange={e => setFormPort(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ssh.username')}</label>
                <input type="text" value={formUsername} onChange={e => setFormUsername(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('ssh.authMethod')}</label>
                <div className="flex gap-2">
                  <button onClick={() => setFormAuth('password')} className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${formAuth === 'password' ? 'border-claw-500 bg-claw-50 text-claw-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                    {t('ssh.password')}
                  </button>
                  <button onClick={() => setFormAuth('key')} className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${formAuth === 'key' ? 'border-claw-500 bg-claw-50 text-claw-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                    {t('ssh.keyFile')}
                  </button>
                </div>
              </div>

              {formAuth === 'password' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ssh.password')}</label>
                  <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} className={inputClass} />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ssh.keyPath')}</label>
                  <input type="text" value={formKeyPath} onChange={e => setFormKeyPath(e.target.value)} className={inputClass} />
                  <p className="mt-1 text-xs text-gray-400">{t('ssh.keyPathHint')}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={!canTestConnection || testing}
                  className="rounded-lg bg-gray-100 dark:bg-gray-800 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-all"
                >
                  {testing ? t('ssh.testing') : t('ssh.testConnection')}
                </button>
                <button
                  onClick={handleSaveInstance}
                  disabled={!canSave}
                  className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  {t('vps.save')}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); resetForm(); if (instances.length > 0) setSelectedId(instances[0].id); }}
                  className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>

              {testResult && (
                <div className={`rounded-lg border p-3 text-sm ${testResult.success ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
                  {testResult.success ? t('ssh.connectionOk') : (testResult.error || t('ssh.connectionFailed'))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected instance view */}
        {!showAddForm && selected && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  {selected.name}
                  {isConnectedTo(selected) && (
                    <span className="text-xs font-normal bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5">
                      {t('vps.connected')}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-gray-400 font-mono">{selected.username}@{selected.host}:{selected.port}</p>
              </div>
              <div className="flex items-center gap-2">
                {isConnectedTo(selected) ? (
                  <button
                    onClick={handleDisconnect}
                    className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                  >
                    {t('vps.disconnect')}
                  </button>
                ) : (selected.serve_port && selected.serve_token) ? (
                  <button
                    onClick={() => handleConnect(selected)}
                    disabled={connecting}
                    className="rounded-lg bg-claw-600 px-4 py-2 text-sm font-medium text-white hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {connecting ? t('vps.connecting') : t('vps.connect')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleGoToBootstrap(selected.id)}
                    className="rounded-lg border border-amber-300 dark:border-amber-700 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all"
                  >
                    {t('vps.setupFirst', { defaultValue: 'Set Up Remote' })}
                  </button>
                )}
                {confirmDeleteId === selected.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-500">{t('common.confirm')}?</span>
                    <button onClick={() => handleDeleteInstance(selected.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">{t('common.confirm')}</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-gray-400 hover:text-gray-600 text-sm">{t('common.cancel')}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(selected.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    {t('vps.delete')}
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 gap-1">
              {(['overview', 'setup'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-claw-600 text-claw-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t(`vps.tab.${tab}`)}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === 'overview' && (() => {
              const sv = isConnectedTo(selected) ? activeTarget?.serve_version : null;
              const versionMismatch =
                sv != null &&
                majorOf(sv) !== majorOf(DESKTOP_PROTOCOL_VERSION);
              return (
                <div className="space-y-3">
                  {versionMismatch && (
                    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        {t('vps.versionMismatch', {
                          serve: sv,
                          desktop: DESKTOP_PROTOCOL_VERSION,
                          defaultValue: `serve v${sv} ≠ desktop v${DESKTOP_PROTOCOL_VERSION} — please upgrade clawsquire-serve`,
                        })}
                      </span>
                      <button
                        onClick={() => handleGoToBootstrap(selected.id)}
                        className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
                      >
                        {t('vps.upgradeServe', { defaultValue: 'Upgrade' })}
                      </button>
                    </div>
                  )}
                  {/* Readiness banner */}
                  {!isConnectedTo(selected) && (selected.serve_port && selected.serve_token) && (
                    <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                          {t('vps.serveReady', { defaultValue: 'Remote agent ready — click Connect to go live' })}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-500">
                          {t('vps.serveReadyDesc', { defaultValue: `Port ${selected.serve_port} · credentials stored` })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleConnect(selected)}
                        disabled={connecting}
                        className="shrink-0 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {connecting ? t('vps.connecting') : t('vps.connect')}
                      </button>
                    </div>
                  )}
                  {!isConnectedTo(selected) && !(selected.serve_port && selected.serve_token) && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3">
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        {t('vps.notSetup', { defaultValue: 'Remote agent not installed. Run Remote Setup first.' })}
                      </p>
                      <button
                        onClick={() => handleGoToBootstrap(selected.id)}
                        className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
                      >
                        {t('vps.setupFirst', { defaultValue: 'Set Up Remote' })}
                      </button>
                    </div>
                  )}
                  <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">{t('ssh.host')}:</span> <span className="font-mono">{selected.host}</span></div>
                      <div><span className="text-gray-500">{t('ssh.port')}:</span> <span className="font-mono">{selected.port}</span></div>
                      <div><span className="text-gray-500">{t('ssh.username')}:</span> <span className="font-mono">{selected.username}</span></div>
                      <div><span className="text-gray-500">{t('ssh.authMethod')}:</span> <span>{selected.auth_method === 'password' ? t('ssh.password') : t('ssh.keyFile')}</span></div>
                      <div>
                        <span className="text-gray-500">OpenClaw:</span>{' '}
                        <span>{selected.openclaw_installed ? (selected.openclaw_version || 'Installed') : t('vps.notDeployed')}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">serve:</span>{' '}
                        <span className="font-mono">
                          {sv ? (
                            <>
                              {sv}
                              {!versionMismatch && (
                                <span className="ml-1 text-green-500 text-[10px]">✓</span>
                              )}
                            </>
                          ) : (selected.serve_port ? `port ${selected.serve_port}` : '—')}
                        </span>
                      </div>
                      <div><span className="text-gray-500">{t('vps.created')}:</span> <span className="font-mono text-xs">{selected.created_at}</span></div>
                      {selected.last_connected && (
                        <div><span className="text-gray-500">{t('vps.lastConnected')}:</span> <span className="font-mono text-xs">{selected.last_connected}</span></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Setup tab — navigate to Bootstrap page */}
            {activeTab === 'setup' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('vps.setupDesc')}
                  </p>

                  {selected.openclaw_installed ? (
                    <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-400">
                      {t('vps.alreadySetup')}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGoToBootstrap()}
                      className="w-full py-3 bg-claw-600 hover:bg-claw-700 text-white rounded-lg font-medium transition-colors"
                    >
                      {t('vps.goToBootstrap')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!showAddForm && !selected && instances.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-2">{t('vps.emptyTitle')}</p>
            <p className="text-sm">{t('vps.emptyDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
