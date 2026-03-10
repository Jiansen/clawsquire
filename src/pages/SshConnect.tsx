import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface SshExecResult {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

type AuthMethod = 'password' | 'key';

export default function SshConnect() {
  const { t } = useTranslation();

  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [password, setPassword] = useState('');
  const [keyPath, setKeyPath] = useState('~/.ssh/id_ed25519');
  const [command, setCommand] = useState('');

  const [phase, setPhase] = useState<'idle' | 'connecting' | 'running'>('idle');
  const [result, setResult] = useState<SshExecResult | null>(null);
  const [testResult, setTestResult] = useState<SshExecResult | null>(null);

  const authPayload = () => ({
    host,
    port: parseInt(port, 10) || 22,
    username,
    password: authMethod === 'password' ? password : null,
    keyPath: authMethod === 'key' ? keyPath : null,
  });

  const handleTest = async () => {
    setPhase('connecting');
    setTestResult(null);
    setResult(null);
    try {
      const res = await invoke<SshExecResult>('ssh_test_connection', authPayload());
      setTestResult(res);
    } catch (e) {
      setTestResult({
        success: false,
        exit_code: null,
        stdout: '',
        stderr: '',
        error: String(e),
      });
    }
    setPhase('idle');
  };

  const handleRun = async () => {
    if (!command.trim()) return;
    setPhase('running');
    setResult(null);
    try {
      const res = await invoke<SshExecResult>('ssh_run_command', {
        ...authPayload(),
        command: command.trim(),
      });
      setResult(res);
    } catch (e) {
      setResult({
        success: false,
        exit_code: null,
        stdout: '',
        stderr: '',
        error: String(e),
      });
    }
    setPhase('idle');
  };

  const isConnecting = phase === 'connecting';
  const isRunning = phase === 'running';
  const canConnect = host.trim().length > 0 && username.trim().length > 0 &&
    (authMethod === 'password' ? password.length > 0 : keyPath.trim().length > 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('ssh.title')}
        </h2>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          {t('ssh.description')}
        </p>
      </div>

      {/* Connection settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          {t('ssh.connection')}
        </h3>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('ssh.host')}
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm
                         focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                         transition-all font-mono bg-white dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('ssh.port')}
            </label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm
                         focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                         transition-all font-mono bg-white dark:bg-gray-800"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('ssh.username')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm
                       focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                       transition-all font-mono bg-white dark:bg-gray-800"
          />
        </div>

        {/* Auth method toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('ssh.authMethod')}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setAuthMethod('password')}
              className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                authMethod === 'password'
                  ? 'border-claw-500 bg-claw-50 text-claw-700'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
              }`}
            >
              🔑 {t('ssh.password')}
            </button>
            <button
              onClick={() => setAuthMethod('key')}
              className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                authMethod === 'key'
                  ? 'border-claw-500 bg-claw-50 text-claw-700'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
              }`}
            >
              📄 {t('ssh.keyFile')}
            </button>
          </div>
        </div>

        {authMethod === 'password' ? (
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('ssh.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm
                         focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                         transition-all font-mono bg-white dark:bg-gray-800"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('ssh.keyPath')}
            </label>
            <input
              type="text"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="~/.ssh/id_ed25519"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm
                         focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                         transition-all font-mono bg-white dark:bg-gray-800"
            />
            <p className="mt-1 text-xs text-gray-400">
              {t('ssh.keyPathHint')}
            </p>
          </div>
        )}

        <button
          onClick={handleTest}
          disabled={!canConnect || isConnecting}
          className="rounded-lg bg-gray-100 dark:bg-gray-800 px-5 py-2.5 text-sm font-medium
                     text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700
                     disabled:opacity-50 transition-all"
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span> {t('ssh.testing')}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>🔌</span> {t('ssh.testConnection')}
            </span>
          )}
        </button>

        {testResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              testResult.success
                ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
            }`}
          >
            {testResult.success ? (
              <span className="flex items-center gap-1.5">✅ {t('ssh.connectionOk')}</span>
            ) : (
              <span className="flex items-center gap-1.5">❌ {testResult.error || t('ssh.connectionFailed')}</span>
            )}
          </div>
        )}
      </div>

      {/* Command execution */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          {t('ssh.runCommand')}
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('ssh.command')}
          </label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={t('ssh.commandPlaceholder')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm
                       focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                       transition-all font-mono bg-white dark:bg-gray-800 resize-y"
          />
        </div>

        <button
          onClick={handleRun}
          disabled={!canConnect || !command.trim() || isRunning}
          className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white
                     hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span> {t('ssh.executing')}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>▶️</span> {t('ssh.execute')}
            </span>
          )}
        </button>

        {result && (
          <div className="space-y-2">
            <div className={`rounded-lg border p-1 text-xs ${
              result.success
                ? 'border-green-200 dark:border-green-800'
                : 'border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2 px-2 py-1 text-gray-500 dark:text-gray-400">
                <span>{result.success ? '✅' : '❌'}</span>
                <span>{t('ssh.exitCode')}: {result.exit_code ?? '—'}</span>
              </div>
            </div>

            {result.stdout && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">stdout</label>
                <pre className="rounded-lg bg-gray-900 text-green-400 p-3 text-xs overflow-auto max-h-64 font-mono">
                  {result.stdout}
                </pre>
              </div>
            )}

            {result.stderr && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">stderr</label>
                <pre className="rounded-lg bg-gray-900 text-red-400 p-3 text-xs overflow-auto max-h-40 font-mono">
                  {result.stderr}
                </pre>
              </div>
            )}

            {result.error && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">
                {result.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
