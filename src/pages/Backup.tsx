import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useActiveTarget } from '../context/ActiveTargetContext';

interface BackupEntry {
  id: string;
  label: string;
  timestamp: string;
  size_bytes: number;
  path: string;
}

interface DiffEntry {
  op: string;
  path: string;
  old_value: unknown;
  new_value: unknown;
}

export default function Backup() {
  const { t } = useTranslation();
  const { target } = useActiveTarget();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedForDiff, setSelectedForDiff] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<DiffEntry[] | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<BackupEntry[]>('list_backups');
      setBackups(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups, target.mode, target.instanceId]);

  const createBackup = async () => {
    setCreating(true);
    setError(null);
    try {
      await invoke('create_backup', { label: null });
      await loadBackups();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async (id: string) => {
    setError(null);
    try {
      await invoke('restore_backup', { id });
      setRestoreConfirm(null);
      await loadBackups();
    } catch (e) {
      setError(String(e));
    }
  };

  const showDiff = async (id: string) => {
    if (selectedForDiff === id) {
      setSelectedForDiff(null);
      setDiffs(null);
      return;
    }
    try {
      const result = await invoke<DiffEntry[]>('diff_backups', { id1: id, id2: null });
      setDiffs(result);
      setSelectedForDiff(id);
    } catch (e) {
      setError(String(e));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('backup.title')}</h2>
        <button
          onClick={createBackup}
          disabled={creating}
          className="rounded-lg bg-claw-600 px-4 py-2 text-sm font-medium text-white
                     hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {creating ? t('common.loading') : t('backup.create')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">{t('common.loading')}</div>
      )}

      {!loading && backups.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 dark:bg-gray-800/50 p-12 text-center">
          <div className="text-4xl mb-4">💾</div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('backup.title')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('backup.noBackups')}</p>
          <button
            onClick={createBackup}
            disabled={creating}
            className="rounded-lg bg-claw-600 px-6 py-2.5 text-sm font-medium text-white
                       hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
          >
            {t('backup.create')}
          </button>
        </div>
      )}

      {backups.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {backups.map((backup) => (
              <div key={backup.id}>
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{backup.label}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatTime(backup.timestamp)}</span>
                      <span className="text-xs text-gray-400">{formatSize(backup.size_bytes)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => showDiff(backup.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedForDiff === backup.id
                          ? 'bg-claw-100 text-claw-700 ring-1 ring-claw-300'
                          : 'bg-gray-100 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      {t('backup.diff')}
                    </button>
                    {restoreConfirm === backup.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => restoreBackup(backup.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 transition-all"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setRestoreConfirm(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-all"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRestoreConfirm(backup.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-all"
                      >
                        {t('backup.restore')}
                      </button>
                    )}
                  </div>
                </div>

                {selectedForDiff === backup.id && diffs && (
                  <div className="px-4 pb-4">
                    <DiffView diffs={diffs} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffView({ diffs }: { diffs: DiffEntry[] }) {
  const { t } = useTranslation();
  if (diffs.length === 0) {
    return (
      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400 text-center">
        {t('backup.noDifferences')}
      </div>
    );
  }

  const OP_STYLES: Record<string, { label: string; color: string }> = {
    add: { label: t('backup.diffOp.added'), color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
    remove: { label: t('backup.diffOp.removed'), color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' },
    replace: { label: t('backup.diffOp.changed'), color: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400' },
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 divide-y divide-gray-100">
      {diffs.map((diff, idx) => {
        const style = OP_STYLES[diff.op] || { label: diff.op, color: 'bg-gray-100 text-gray-600 dark:text-gray-400' };
        return (
          <div key={idx} className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.color}`}>
                {style.label}
              </span>
              <code className="text-xs text-gray-700 dark:text-gray-300 font-mono">{diff.path}</code>
            </div>
            <div className="flex gap-4 text-xs font-mono">
              {diff.old_value !== null && diff.old_value !== undefined && (
                <div className="text-red-600 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1 max-w-xs truncate">
                  - {JSON.stringify(diff.old_value)}
                </div>
              )}
              {diff.new_value !== null && diff.new_value !== undefined && (
                <div className="text-green-600 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1 max-w-xs truncate">
                  + {JSON.stringify(diff.new_value)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
