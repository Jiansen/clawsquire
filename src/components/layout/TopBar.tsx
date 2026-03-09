import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { SUPPORTED_LOCALES, changeLocale } from '../../i18n';

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = SUPPORTED_LOCALES.find((l) => l.code === i18n.language);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 transition-colors">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('app.name')}</h1>

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
    </header>
  );
}
