import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface CronJob {
  name: string;
  every: string;
  channel: string | null;
  message: string | null;
}

interface CronAddResult {
  success: boolean;
  error: string | null;
}

interface CronRemoveResult {
  success: boolean;
  error: string | null;
}

interface ChannelInfo {
  name: string;
  status: string;
}

const PRESETS = [
  { id: 'email-summary', icon: '📧', defaultEvery: '15m' },
  { id: 'scheduled-reminder', icon: '⏰', defaultEvery: '1h' },
  { id: 'custom', icon: '🔧', defaultEvery: '30m' },
] as const;

const INTERVALS = [
  { value: '5m', labelKey: 'automations.intervals.5m' },
  { value: '15m', labelKey: 'automations.intervals.15m' },
  { value: '30m', labelKey: 'automations.intervals.30m' },
  { value: '1h', labelKey: 'automations.intervals.1h' },
  { value: '6h', labelKey: 'automations.intervals.6h' },
  { value: '24h', labelKey: 'automations.intervals.24h' },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

export default function Automations() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>(null);
  const [name, setName] = useState('');
  const [every, setEvery] = useState('15m');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('');
  const [announce, setAnnounce] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [jobList, channelList] = await Promise.all([
        invoke<CronJob[]>('cron_list'),
        invoke<ChannelInfo[]>('list_channels'),
      ]);
      setJobs(jobList);
      setChannels(channelList);
      if (channelList.length > 0 && !channel) {
        setChannel(channelList[0].name);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const applyPreset = (presetId: PresetId) => {
    setSelectedPreset(presetId);
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    setEvery(preset.defaultEvery);

    if (presetId === 'email-summary') {
      setName(t('automations.presets.email-summary.defaultName'));
      setMessage(t('automations.presets.email-summary.defaultMessage'));
    } else if (presetId === 'scheduled-reminder') {
      setName(t('automations.presets.scheduled-reminder.defaultName'));
      setMessage(t('automations.presets.scheduled-reminder.defaultMessage'));
    } else {
      setName('');
      setMessage('');
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !message.trim() || !channel) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await invoke<CronAddResult>('cron_add', {
        name: name.trim(),
        every,
        message: message.trim(),
        channel,
        announce,
      });
      if (result.success) {
        setSuccess(t('automations.createSuccess', { name: name.trim() }));
        resetForm();
        await loadData();
      } else {
        setError(result.error || t('automations.createFailed'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (jobName: string) => {
    setRemoving(jobName);
    setError(null);
    setSuccess(null);
    try {
      const result = await invoke<CronRemoveResult>('cron_remove', { name: jobName });
      if (result.success) {
        setSuccess(t('automations.removeSuccess', { name: jobName }));
        await loadData();
      } else {
        setError(result.error || t('automations.removeFailed'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving(null);
    }
  };

  const resetForm = () => {
    setShowCreate(false);
    setSelectedPreset(null);
    setName('');
    setEvery('15m');
    setMessage('');
    setAnnounce(true);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('automations.title')}</h1>
        <button
          onClick={() => { setShowCreate(true); setError(null); setSuccess(null); }}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          + {t('automations.create')}
        </button>
      </div>

      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {t('automations.description')}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">{t('automations.loading')}</div>
      ) : jobs.length === 0 && !showCreate ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">⚡</div>
          <h2 className="text-lg font-medium mb-2">{t('automations.emptyTitle')}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{t('automations.emptyDesc')}</p>
          {channels.length === 0 ? (
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              {t('automations.noChannelsHint')}
            </p>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t('automations.createFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.name}
              className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{job.name}</div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>⏱ {job.every}</span>
                    {job.channel && <span>📡 {job.channel}</span>}
                  </div>
                  {job.message && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                      {job.message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(job.name)}
                  disabled={removing === job.name}
                  className="ml-3 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 shrink-0"
                >
                  {removing === job.name ? '...' : t('automations.remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="mt-6 p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t('automations.create')}</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>

          {!selectedPreset ? (
            <>
              <p className="text-sm text-gray-500 mb-4">{t('automations.choosePreset')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-center transition-all"
                  >
                    <div className="text-3xl mb-2">{preset.icon}</div>
                    <div className="text-sm font-medium">{t(`automations.presets.${preset.id}.name`)}</div>
                    <div className="text-xs text-gray-400 mt-1">{t(`automations.presets.${preset.id}.desc`)}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-xl">{PRESETS.find(p => p.id === selectedPreset)?.icon}</span>
                <span className="font-medium">{t(`automations.presets.${selectedPreset}.name`)}</span>
                <button
                  onClick={() => setSelectedPreset(null)}
                  className="ml-auto text-blue-500 hover:text-blue-600 text-xs"
                >
                  {t('automations.changePreset')}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('automations.nameLabel')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('automations.namePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('automations.messageLabel')}</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('automations.messagePlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('automations.intervalLabel')}</label>
                  <select
                    value={every}
                    onChange={(e) => setEvery(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {INTERVALS.map((iv) => (
                      <option key={iv.value} value={iv.value}>{t(iv.labelKey)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('automations.channelLabel')}</label>
                  {channels.length === 0 ? (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 py-2">
                      {t('automations.noChannelsHint')}
                    </p>
                  ) : (
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {channels.map((ch) => (
                        <option key={ch.name} value={ch.name}>{ch.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={announce}
                  onChange={(e) => setAnnounce(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t('automations.announceLabel')}
              </label>

              {name.trim() && message.trim() && channel && (
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
                  <div className="font-medium text-xs text-gray-400 mb-1">{t('automations.preview')}</div>
                  <p className="text-gray-700 dark:text-gray-200">
                    {t('automations.previewText', { name: name.trim(), every, channel })}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={saving || !name.trim() || !message.trim() || !channel}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? t('automations.saving') : t('automations.save')}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('automations.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
