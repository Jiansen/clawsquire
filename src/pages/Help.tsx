import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const FAQ_KEYS = [
  'gatewayWontStart',
  'whereToGetApiKey',
  'whatIsSandbox',
  'howToCreateBot',
  'doctorCheckFailed',
  'isMyDataSafe',
  'canIUndo',
  'whatIfSomethingBreaks',
] as const;

export default function Help() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const filteredFaqs = FAQ_KEYS.filter((key) => {
    if (!search) return true;
    const q = t(`help.faq.${key}.question`).toLowerCase();
    const a = t(`help.faq.${key}.answer`).toLowerCase();
    return q.includes(search.toLowerCase()) || a.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900">{t('help.title')}</h2>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('help.searchPlaceholder')}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-10
                     text-sm focus:outline-none focus:ring-2 focus:ring-claw-400 focus:border-claw-400"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {t('help.commonQuestions')}
          </h3>
        </div>
        {filteredFaqs.map((key) => (
          <div key={key} className="overflow-hidden">
            <button
              onClick={() => setExpandedFaq(expandedFaq === key ? null : key)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left
                         hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900 pr-4">
                {t(`help.faq.${key}.question`)}
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                  expandedFaq === key ? 'rotate-180' : ''
                }`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedFaq === key && (
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {t(`help.faq.${key}.answer`)}
                </p>
              </div>
            )}
          </div>
        ))}
        {filteredFaqs.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {t('help.noResults')}
          </div>
        )}
      </div>
    </div>
  );
}
