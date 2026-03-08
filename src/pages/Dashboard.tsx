import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export default function Dashboard() {
  const { t } = useTranslation();

  const status = { version: '0.4.2', running: true };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">{t('dashboard.openclawStatus')}</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                status.running ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-lg font-semibold text-gray-900">
              {status.running ? t('dashboard.running') : t('dashboard.stopped')}
            </span>
          </div>
          <span className="text-sm text-gray-500">
            {t('dashboard.version')}: {status.version}
          </span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard.quickActions')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            to="/onboard"
            className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-claw-300 hover:shadow-md transition-all group"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-claw-600 group-hover:text-claw-700">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{t('dashboard.newSetup')}</span>
          </Link>

          <Link
            to="/doctor"
            className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-claw-300 hover:shadow-md transition-all group"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-claw-600 group-hover:text-claw-700">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{t('dashboard.runDoctor')}</span>
          </Link>

          <button className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-claw-300 hover:shadow-md transition-all group">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-claw-600 group-hover:text-claw-700">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{t('dashboard.backupNow')}</span>
          </button>

          <button className="flex flex-col items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-claw-300 hover:shadow-md transition-all group">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-claw-600 group-hover:text-claw-700">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{t('dashboard.viewConfig')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
