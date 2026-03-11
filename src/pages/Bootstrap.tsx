import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
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

export default function Bootstrap() {
  const { t } = useTranslation();
  const { target } = useActiveTarget();
  const isRemote = target.mode === 'protocol';

  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installScript, setInstallScript] = useState<string>('');
  const [scriptPlatform, setScriptPlatform] = useState<'linux' | 'macos' | 'windows'>('linux');
  const [copied, setCopied] = useState(false);

  const detect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<BootstrapStatus>('bootstrap_detect');
      setStatus(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isRemote) {
      detect();
    }
  }, [isRemote, detect]);

  useEffect(() => {
    invoke<string>('bootstrap_get_script', {
      platform: scriptPlatform,
      arch: 'x86_64',
    }).then(setInstallScript);
  }, [scriptPlatform]);

  const handleInstall = async (component: string) => {
    setInstalling(component);
    setError(null);
    try {
      if (component === 'node') {
        const result = await invoke<NodeInstallResult>('bootstrap_install_node');
        if (!result.success) {
          setError(result.error || t('bootstrap.installFailed'));
        }
      } else if (component === 'openclaw') {
        const result = await invoke<InstallResult>('bootstrap_install_openclaw');
        if (!result.success) {
          setError(result.error || t('bootstrap.installFailed'));
        }
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

  const statusIcon = (s: BootstrapStep['status']) => {
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

      {/* Phase 1: Install clawsquire-serve */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-bold">1</span>
          {t('bootstrap.step1Title')}
        </h2>
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
      </section>

      {/* Phase 2: Connect */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-bold">2</span>
          {t('bootstrap.step2Title')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('bootstrap.step2Desc')}</p>
        {isRemote ? (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t('bootstrap.connected', { host: target.host || 'remote' })}
          </div>
        ) : (
          <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 py-2">
            {t('bootstrap.notConnected')}
          </div>
        )}
      </section>

      {/* Phase 3: Environment check + install */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-bold">3</span>
            {t('bootstrap.step3Title')}
          </h2>
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

        {isRemote && status && (
          <div className="space-y-3">
            {status.steps.map((step) => (
              <div key={step.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  {statusIcon(installing === step.id ? 'running' : step.status)}
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
    </div>
  );
}
