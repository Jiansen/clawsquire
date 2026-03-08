import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

const templates = [
  { id: 'telegram', icon: '💬', est: '~3 min' },
  { id: 'discord', icon: '🤖', est: '~3 min' },
  { id: 'llm-provider', icon: '🧠', est: '~2 min' },
  { id: 'vps-headless', icon: '🖥️', est: '~5 min' },
] as const;

export default function Onboard() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('onboard.title')}</h2>
        <p className="mt-1 text-gray-500">{t('onboard.chooseTemplate')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {templates.map((tpl) => (
          <Link
            key={tpl.id}
            to={`/onboard/${tpl.id}`}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-claw-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{tpl.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 group-hover:text-claw-700 transition-colors">
                  {t(`onboard.templates.${tpl.id}.name`)}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {t(`onboard.templates.${tpl.id}.description`)}
                </p>
                <span className="mt-3 inline-block text-xs text-gray-400">{tpl.est}</span>
              </div>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300 group-hover:text-claw-500 transition-colors mt-1">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
