import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { SUPPORTED_LOCALES, changeLocale } from '../i18n';

type Theme = 'light' | 'dark' | 'system';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>('system');

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('settings.language')}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale.code}
              onClick={() => changeLocale(locale.code)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                i18n.language === locale.code
                  ? 'bg-claw-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-base">{locale.flag}</span>
              <span>{locale.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('settings.theme')}</h3>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setTheme(opt)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                theme === opt
                  ? 'bg-claw-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`settings.${opt}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <h3 className="text-sm font-medium text-red-500 mb-4">{t('settings.dangerZone')}</h3>
        <p className="text-sm text-gray-500 mb-3">{t('settings.uninstallDescription')}</p>
        <button
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
          onClick={() => {/* TODO: Phase C/E */}}
        >
          {t('settings.uninstallOpenClaw')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('settings.about')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('settings.version')}</span>
            <span className="font-mono text-gray-900">0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tauri</span>
            <span className="font-mono text-gray-900">2.x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">React</span>
            <span className="font-mono text-gray-900">19.x</span>
          </div>
        </div>
      </div>
    </div>
  );
}
