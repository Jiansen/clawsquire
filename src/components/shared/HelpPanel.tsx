import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CommunitySearch from './CommunitySearch';

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

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpPanel({ open, onClose }: HelpPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [tab, setTab] = useState<'faq' | 'community'>('faq');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setExpandedFaq(null);
      setTab('faq');
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const filteredFaqs = FAQ_KEYS.filter((key) => {
    if (!search) return true;
    const q = t(`help.faq.${key}.question`).toLowerCase();
    const a = t(`help.faq.${key}.answer`).toLowerCase();
    return q.includes(search.toLowerCase()) || a.includes(search.toLowerCase());
  });

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col animate-slide-in-right"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold">{t('helpPanel.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('helpPanel.searchPlaceholder')}
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setTab('faq')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                tab === 'faq'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {t('helpPanel.tabFaq')}
            </button>
            <button
              onClick={() => setTab('community')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                tab === 'community'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              ✨ {t('helpPanel.tabCommunity')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'faq' ? (
            <div className="space-y-2">
              {filteredFaqs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">{t('help.noResults')}</p>
                  <button
                    onClick={() => setTab('community')}
                    className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                  >
                    {t('helpPanel.tryCommunity')}
                  </button>
                </div>
              ) : (
                filteredFaqs.map((key) => (
                  <div
                    key={key}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === key ? null : key)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 pr-3">
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
                      <div className="px-4 pb-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                          {t(`help.faq.${key}.answer`)}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <CommunitySearch initialQuery={search || undefined} />
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 text-center">
          <p className="text-xs text-gray-400">
            {t('helpPanel.footer')}
          </p>
        </div>
      </div>
    </>
  );
}
