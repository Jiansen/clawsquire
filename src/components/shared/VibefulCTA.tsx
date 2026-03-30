import { useTranslation } from 'react-i18next';

export default function VibefulCTA({ utmMedium = 'app' }: { utmMedium?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl flex-shrink-0">🚀</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
            {t('vibeful.dashboardTitle', { defaultValue: 'Want a cloud AI agent that works 24/7?' })}
          </p>
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
            {t('vibeful.dashboardDesc', { defaultValue: 'Vibeful runs in the cloud — no API key, no setup, works even when your computer is off.' })}
          </p>
        </div>
      </div>
      <a
        href={`https://vibeful.io?utm_source=clawsquire&utm_medium=${utmMedium}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-all whitespace-nowrap flex-shrink-0"
      >
        {t('vibeful.tryVibeful', { defaultValue: 'Try Vibeful' })}
      </a>
    </div>
  );
}
