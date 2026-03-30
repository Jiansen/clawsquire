import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, changeLocale } from '../../i18n';
import { useState } from 'react';
import FeedbackButton from '../shared/FeedbackButton';
import FlagIcon from '../shared/FlagIcon';
import { useTheme } from '../../lib/useTheme';
import { useOperation } from '../../context/OperationContext';

// Primary operational nav items (top group)
const primaryNavItems = [
  {
    to: '/',
    labelKey: 'nav.dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
  },
  {
    to: '/vps',
    labelKey: 'nav.vps',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-7-2h.01M17 8h.01M12 16h.01M17 16h.01" />
      </svg>
    ),
  },
  {
    to: '/channels',
    labelKey: 'nav.channels',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    to: '/sources',
    labelKey: 'nav.sources',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/automations',
    labelKey: 'nav.automations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

// Secondary / setup items (bottom group, above utility icons)
// Note: Remote Setup (Bootstrap) is accessed via VPS → Setup tab.
//       Onboard/Setup Wizard is accessible via /onboard URL but not in sidebar.
const secondaryNavItems = [
  {
    to: '/config',
    labelKey: 'nav.config',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    to: '/backup',
    labelKey: 'nav.backup',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
  {
    to: '/doctor',
    labelKey: 'nav.doctor',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { operation } = useOperation();

  const cycleTheme = () => {
    const next: Record<string, 'light' | 'dark' | 'system'> = {
      light: 'dark', dark: 'system', system: 'light',
    };
    setTheme(next[theme] ?? 'light');
  };

  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === i18n.language);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
      isActive
        ? 'bg-claw-600 text-white'
        : operation.busy
          ? 'text-gray-600 cursor-not-allowed'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <aside className="flex flex-col items-center w-16 min-h-screen bg-gray-900 py-4">
      <div className="mb-6 text-claw-400 font-bold text-lg select-none" title="ClawSquire">CS</div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        {primaryNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={operation.busy ? `${t(item.labelKey)} (${operation.label || 'busy'})` : t(item.labelKey)}
            className={navLinkClass}
            onClick={(e) => { if (operation.busy) e.preventDefault(); }}
          >
            {item.icon}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="my-3 w-8 border-t border-gray-700" />

      {/* Operation indicator */}
      {operation.busy && (
        <div className="w-10 text-center mb-2" title={operation.label}>
          <span className="animate-pulse text-amber-400 text-xs">⏳</span>
        </div>
      )}

      {/* Secondary nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {secondaryNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={operation.busy ? `${t(item.labelKey)} (${operation.label || 'busy'})` : t(item.labelKey)}
            className={navLinkClass}
            onClick={(e) => { if (operation.busy) e.preventDefault(); }}
          >
            {item.icon}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 mt-auto">
        <FeedbackButton />
        <button
          onClick={cycleTheme}
          title={t('settings.theme')}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
        >
          {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'}
        </button>
        <div className="relative">
        <button
          onClick={() => setLangOpen(!langOpen)}
          title={t('settings.language')}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
        >
          {currentLocale ? <FlagIcon flag={currentLocale.flag} flagSvg={currentLocale.flagSvg} size={18} /> : '🌐'}
        </button>
        {langOpen && (
          <div className="absolute bottom-12 left-0 bg-gray-800 rounded-lg shadow-xl py-1 min-w-[140px] z-50">
            {SUPPORTED_LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => {
                  changeLocale(locale.code);
                  setLangOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  i18n.language === locale.code
                    ? 'text-claw-400 bg-gray-700'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <FlagIcon flag={locale.flag} flagSvg={locale.flagSvg} size={14} /> {locale.name}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>
    </aside>
  );
}
