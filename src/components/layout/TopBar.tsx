import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { SUPPORTED_LOCALES, changeLocale } from '../../i18n';
import HelpPanel from '../shared/HelpPanel';
import { useActiveTarget } from '../../context/ActiveTargetContext';
import { useNavigate } from 'react-router';

function TargetSwitcher() {
  const { target, instances, switching, setTarget } = useActiveTarget();
  const [open, setOpen] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPasswordPrompt(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = async (mode: 'local' | 'vps', instanceId?: string) => {
    if (mode === 'local') {
      await setTarget('local');
      setOpen(false);
      return;
    }
    const inst = instances.find(i => i.id === instanceId);
    if (inst?.auth_method === 'password') {
      setPasswordPrompt(instanceId!);
      return;
    }
    await setTarget('vps', instanceId);
    setOpen(false);
  };

  const handlePasswordSubmit = async () => {
    if (passwordPrompt) {
      await setTarget('vps', passwordPrompt, password);
      setPassword('');
      setPasswordPrompt(null);
      setOpen(false);
    }
  };

  const isLocal = target.mode === 'local';
  const activeInstance = instances.find(i => i.id === target.instanceId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${
          isLocal
            ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'
            : 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        } ${switching ? 'opacity-50' : ''}`}
        data-testid="target-switcher"
      >
        {switching ? (
          <span className="animate-spin">⟳</span>
        ) : isLocal ? (
          <span>🖥</span>
        ) : (
          <span>☁️</span>
        )}
        <span className="font-medium">
          {isLocal ? 'Local' : (activeInstance?.name || target.host || 'VPS')}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[220px] z-50">
          <button
            onClick={() => handleSelect('local')}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
              isLocal
                ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLocal ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            🖥 Local
          </button>

          {instances.map(inst => (
            <button
              key={inst.id}
              onClick={() => handleSelect('vps', inst.id)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                target.instanceId === inst.id
                  ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${target.instanceId === inst.id ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              <div className="flex flex-col">
                <span>☁️ {inst.name}</span>
                <span className="text-xs text-gray-400">{inst.host}</span>
              </div>
            </button>
          ))}

          {passwordPrompt && (
            <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="SSH Password"
                className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
              />
              <button
                onClick={handlePasswordSubmit}
                className="mt-1 w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Connect
              </button>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); navigate('/vps'); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              + Manage VPS instances...
            </button>
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
  const ref = useRef<HTMLDivElement>(null);

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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('app.name')}</h1>
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
