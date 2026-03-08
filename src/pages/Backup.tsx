import { useTranslation } from 'react-i18next';
import { useState } from 'react';

interface BackupEntry {
  id: string;
  timestamp: string;
  label: string;
  size: string;
}

const placeholderBackups: BackupEntry[] = [
  { id: '1', timestamp: '2026-03-08T02:15:00Z', label: 'Before LLM switch', size: '4.2 KB' },
  { id: '2', timestamp: '2026-03-05T10:30:00Z', label: 'Post-install snapshot', size: '3.8 KB' },
  { id: '3', timestamp: '2026-03-01T08:00:00Z', label: 'Initial config', size: '2.1 KB' },
];

export default function Backup() {
  const { t } = useTranslation();
  const [backups] = useState<BackupEntry[]>(placeholderBackups);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('backup.title')}</h2>
        <button className="bg-claw-600 hover:bg-claw-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
          {t('backup.create')}
        </button>
      </div>

      {backups.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto text-gray-300 mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <p className="text-gray-400">{t('backup.noBackups')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">{t('backup.label')}</th>
                <th className="px-6 py-3 font-medium text-gray-500">{t('backup.timestamp')}</th>
                <th className="px-6 py-3 font-medium text-gray-500">{t('backup.size')}</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backups.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">{b.label}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(b.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{b.size}</td>
                  <td className="px-6 py-3 text-right space-x-2">
                    <button className="text-claw-600 hover:text-claw-700 font-medium transition-colors">
                      {t('backup.restore')}
                    </button>
                    <button className="text-gray-500 hover:text-gray-700 font-medium transition-colors">
                      {t('backup.diff')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
