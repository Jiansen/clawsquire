import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { SUPPORTED_LOCALES, changeLocale } from '../../i18n';
import HelpPanel from '../shared/HelpPanel';
import { useActiveTarget } from '../../context/ActiveTargetContext';

function TargetSwitcher() {
  const { target, switching, error, setTarget } = useActiveTarget();
  const [open, setOpen] = useState(false);
  const [connectForm, setConnectForm] = useState(false);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConnectForm(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLocal = async () => {
    await setTarget('local');
    setOpen(false);
    setConnectForm(false);
  };

  const handleProtocolConnect = async () => {
    if (!url || !token) return;
    const wsUrl = url.startsWith('ws') ? url : `ws://${url}`;
    const host = url.replace(/^wss?:\/\//, '').replace(/:\d+$/, '');
    try {
      await setTarget('protocol', { url: wsUrl, token, host });
      setOpen(false);
      setConnectForm(false);
      setUrl('');
      setToken('');
    } catch {
      // error shown via context
    }
  };

  const isLocal = target.mode === 'local';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${
          isLocal
            ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'
            : 'text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30'
        } ${switching ? 'opacity-50' : ''}`}
        data-testid="target-switcher"
      >
        {switching ? (
          <span className="animate-spin">&#10227;</span>
        ) : isLocal ? (
          <span className="text-base">&#128421;</span>
        ) : (
          <span className="text-base">&#127760;</span>
        )}
        <span className="font-medium">
          {isLocal ? 'Local' : (target.host || 'Remote')}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[280px] z-50">
          <button
            onClick={handleLocal}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
              isLocal
                ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLocal ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <span className="text-base">&#128421;</span> Local
          </button>

          {!isLocal && target.mode === 'protocol' && (
            <div className="px-3 py-2 text-sm flex items-center gap-2 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 font-medium">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span className="text-base">&#127760;</span>
              <span className="truncate">{target.host || 'Remote'}</span>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
            {!connectForm ? (
              <button
                onClick={() => setConnectForm(true)}
                className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                + Connect to remote agent...
              </button>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="host:port (e.g. 192.168.1.5:18790)"
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
                <input
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProtocolConnect()}
                  placeholder="Auth token"
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {error && (
                  <p className="text-xs text-red-500">{error}</p>
                )}
                <button
                  onClick={handleProtocolConnect}
                  disabled={!url || !token || switching}
                  className="w-full px-2 py-1.5 text-xs font-medium bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {switching ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const current = SUPPORTED_LOCALES.find((l) => l.code === i18n.language);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    function handleKeyboard(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '/') {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, []);

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex flex-col leading-tight">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('app.name')}</h1>
          {appVersion && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono leading-none">
              v{appVersion}
            </span>
          )}
        </div>
        <TargetSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setHelpOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400 hover:text-claw-600 dark:hover:text-claw-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={t('helpPanel.title')}
          data-testid="help-button"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3.75 3.75 0 015.335 5.278l-.354.354-.828.828A1.25 1.25 0 0011 13.25v.25a.75.75 0 01-1.5 0v-.25a2.75 2.75 0 01.805-1.945l.829-.829.353-.353A2.25 2.25 0 008.94 6.94zM10 17a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </button>

        <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <span>{current?.flag}</span>
          <span>{current?.name}</span>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] z-50">
            {SUPPORTED_LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => {
                  changeLocale(locale.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  i18n.language === locale.code
                    ? 'text-claw-600 dark:text-claw-400 bg-claw-50 dark:bg-claw-900/20 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {locale.flag} {locale.name}
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}
