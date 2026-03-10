import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useActiveTarget } from '../context/ActiveTargetContext';

interface ChannelInfo {
  name: string;
  status: string;
}

interface ChannelAddResult {
  success: boolean;
  message: string | null;
  error: string | null;
}

interface ChannelRemoveResult {
  success: boolean;
  error: string | null;
}

const CHANNEL_TYPES = [
  { id: 'telegram', icon: '💬', tokenBased: true, linkUrl: 'https://t.me/BotFather' },
  { id: 'discord', icon: '🤖', tokenBased: true, linkUrl: 'https://discord.com/developers/applications' },
  { id: 'whatsapp', icon: '📱', tokenBased: false, linkUrl: 'https://docs.openclaw.ai/channels/whatsapp' },
  { id: 'slack', icon: '💼', tokenBased: true, linkUrl: 'https://api.slack.com/apps' },
  { id: 'webchat', icon: '🌐', tokenBased: false, linkUrl: null },
] as const;

type ChannelTypeId = (typeof CHANNEL_TYPES)[number]['id'];

export default function Channels() {
  const { t } = useTranslation();
  const { target } = useActiveTarget();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<ChannelTypeId | null>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const result = await invoke<ChannelInfo[]>('list_channels');
      setChannels(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels, target.mode, target.instanceId]);

  const handleAdd = async () => {
    if (!selectedType) return;
    const typeDef = CHANNEL_TYPES.find(c => c.id === selectedType);
    if (!typeDef) return;

    if (typeDef.tokenBased && !token.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await invoke<ChannelAddResult>('add_channel', {
        channel: selectedType,
        token: token.trim() || 'placeholder',
      });
      if (result.success) {
        setSuccess(t('channels.addSuccess', { channel: selectedType }));
        setShowAdd(false);
        setSelectedType(null);
        setToken('');
        await loadChannels();
      } else {
        setError(result.error || t('channels.addFailed'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (name: string) => {
    setRemoving(name);
    setError(null);
    setSuccess(null);
    try {
      const result = await invoke<ChannelRemoveResult>('remove_channel', { channel: name });
      if (result.success) {
        setSuccess(t('channels.removeSuccess', { channel: name }));
        await loadChannels();
      } else {
        setError(result.error || t('channels.removeFailed'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving(null);
    }
  };

  const typeDef = selectedType ? CHANNEL_TYPES.find(c => c.id === selectedType) : null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('channels.title')}</h1>
        <button
          onClick={() => { setShowAdd(true); setError(null); setSuccess(null); }}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          + {t('channels.addChannel')}
        </button>
      </div>

      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {t('channels.description')}
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
        <div className="text-center py-12 text-gray-400">{t('channels.loading')}</div>
      ) : channels.length === 0 && !showAdd ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📡</div>
          <h2 className="text-lg font-medium mb-2">{t('channels.emptyTitle')}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{t('channels.emptyDesc')}</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t('channels.addFirst')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => {
            const chType = CHANNEL_TYPES.find(c => c.id === ch.name);
            return (
              <div
                key={ch.name}
                className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{chType?.icon || '📡'}</span>
                  <div>
                    <div className="font-medium">{t(`channels.types.${ch.name}`, ch.name)}</div>
                    <div className="text-xs text-green-600 dark:text-green-400">
                      {t('channels.statusConfigured')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(ch.name)}
                  disabled={removing === ch.name}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                >
                  {removing === ch.name ? '...' : t('channels.remove')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="mt-6 p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t('channels.addChannel')}</h2>
            <button
              onClick={() => { setShowAdd(false); setSelectedType(null); setToken(''); }}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          {!selectedType ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CHANNEL_TYPES.map((ct) => {
                const alreadyAdded = channels.some(c => c.name === ct.id);
                return (
                  <button
                    key={ct.id}
                    onClick={() => !alreadyAdded && setSelectedType(ct.id)}
                    disabled={alreadyAdded}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      alreadyAdded
                        ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'
                    }`}
                  >
                    <div className="text-3xl mb-2">{ct.icon}</div>
                    <div className="text-sm font-medium">{t(`channels.types.${ct.id}`, ct.id)}</div>
                    {alreadyAdded && (
                      <div className="text-xs text-green-500 mt-1">{t('channels.alreadyAdded')}</div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-xl">{typeDef?.icon}</span>
                <span className="font-medium">{t(`channels.types.${selectedType}`, selectedType)}</span>
                <button
                  onClick={() => { setSelectedType(null); setToken(''); }}
                  className="ml-auto text-blue-500 hover:text-blue-600 text-xs"
                >
                  {t('channels.changeType')}
                </button>
              </div>

              {typeDef?.linkUrl && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t(`channels.setup.${selectedType}`)}
                  {' '}
                  <a
                    href={typeDef.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 hover:text-blue-600 underline"
                  >
                    {t('channels.openGuide')}
                  </a>
                </p>
              )}

              {typeDef?.tokenBased ? (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('channels.tokenLabel')}
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('channels.tokenPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-sm">
                  {t(`channels.noToken.${selectedType}`, t('channels.noTokenGeneric'))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAdd}
                  disabled={saving || (typeDef?.tokenBased && !token.trim())}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? t('channels.saving') : t('channels.save')}
                </button>
                <button
                  onClick={() => { setShowAdd(false); setSelectedType(null); setToken(''); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('channels.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
