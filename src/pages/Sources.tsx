import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useActiveTarget } from '../context/ActiveTargetContext';

interface ImapStatus {
  configured: boolean;
  host: string | null;
  username: string | null;
}

const SOURCE_TYPES = [
  { id: 'imap', icon: '📧', route: '/imap', available: true },
  { id: 'rss', icon: '📰', route: null, available: false },
  { id: 'calendar', icon: '📅', route: null, available: false },
  { id: 'webhook', icon: '🔗', route: null, available: false },
] as const;

export default function Sources() {
  const { t } = useTranslation();
  const { target } = useActiveTarget();
  const [imapStatus, setImapStatus] = useState<ImapStatus>({ configured: false, host: null, username: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [host, username] = await Promise.all([
          invoke<string>('config_get', { path: 'email.imap.host' }).catch(() => ''),
          invoke<string>('config_get', { path: 'email.imap.username' }).catch(() => ''),
        ]);
        setImapStatus({
          configured: !!(host && username),
          host: host || null,
          username: username || null,
        });
      } catch {
        // config not available
      } finally {
        setLoading(false);
      }
    })();
  }, [target.mode, target.instanceId]);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t('sources.title')}</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {t('sources.description')}
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">{t('sources.loading')}</div>
      ) : (
        <div className="space-y-3">
          {SOURCE_TYPES.map((src) => {
            const isImap = src.id === 'imap';
            const configured = isImap && imapStatus.configured;

            return (
              <div
                key={src.id}
                className={`p-4 rounded-xl border ${
                  src.available
                    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{src.icon}</span>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {t(`sources.types.${src.id}.name`)}
                        {!src.available && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500">
                            {t('sources.comingSoon')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t(`sources.types.${src.id}.desc`)}
                      </div>
                      {configured && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✓ {imapStatus.username} → {imapStatus.host}
                        </div>
                      )}
                    </div>
                  </div>

                  {src.available && src.route && (
                    <Link
                      to={src.route}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        configured
                          ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {configured ? t('sources.edit') : t('sources.configure')}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-medium mb-1">{t('sources.tipTitle')}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('sources.tipDesc')}
        </p>
      </div>
    </div>
  );
}
