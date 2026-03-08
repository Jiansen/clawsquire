import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, changeLocale } from '../i18n';

const GREETINGS: Record<string, string> = {
  en: 'Welcome',
  'zh-CN': '欢迎使用',
  'zh-TW': '歡迎使用',
  es: 'Bienvenido',
  ja: 'ようこそ',
  de: 'Willkommen',
  'pt-BR': 'Bem-vindo',
};

interface WelcomeProps {
  onLanguageSelected: () => void;
}

export default function Welcome({ onLanguageSelected }: WelcomeProps) {
  const { t } = useTranslation();

  function handleSelect(code: string) {
    changeLocale(code);
    onLanguageSelected();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4">
      <div className="mb-10 text-center">
        <div className="mb-3 text-5xl">🛡️</div>
        <h1 className="text-3xl font-bold text-gray-900">ClawSquire</h1>
        <p className="mt-1 text-sm text-gray-500">{t('app.tagline')}</p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale.code}
            onClick={() => handleSelect(locale.code)}
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-5 shadow-sm transition-all hover:border-claw-400 hover:shadow-md"
          >
            <span className="text-lg font-semibold text-gray-900 group-hover:text-claw-600">
              {GREETINGS[locale.code]}
            </span>
            <span className="text-xs text-gray-500">{locale.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-12 flex items-center gap-4 text-xs text-gray-400">
        <a
          href="https://github.com/Jiansen/clawsquire"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600"
        >
          GitHub ↗
        </a>
        <span>·</span>
        <a
          href="https://clawsquire.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600"
        >
          clawsquire.com ↗
        </a>
        <span>·</span>
        <span>MIT License</span>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        The companion app for{' '}
        <a
          href="https://github.com/openclaw/openclaw"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600"
        >
          OpenClaw
        </a>{' '}
        (275K ★)
      </p>
    </div>
  );
}
