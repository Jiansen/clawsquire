import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';

export type SafetyLevel = 'conservative' | 'standard' | 'full' | 'custom';

interface Permission {
  key: string;
  level: 'basic' | 'advanced' | 'expert';
  locked?: boolean;
  default: Record<SafetyLevel, boolean>;
}

const PERMISSIONS: Permission[] = [
  { key: 'slashCommands', level: 'basic', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'botRestart', level: 'basic', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'accessControl', level: 'basic', default: { conservative: true, standard: true, full: true, custom: true } },
  { key: 'fileTools', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'commandExec', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'browserScript', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'advancedConfig', level: 'advanced', default: { conservative: false, standard: false, full: true, custom: false } },
];

const PRESET_ICONS: Record<SafetyLevel, string> = {
  conservative: '🔒',
  standard: '🟡',
  full: '🔓',
  custom: '⚙️',
};

const PRESET_COLORS: Record<SafetyLevel, string> = {
  conservative: 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30',
  standard: 'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30',
  full: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30',
  custom: 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
};

const PRESET_ACTIVE_COLORS: Record<SafetyLevel, string> = {
  conservative: 'border-green-500 bg-green-100 dark:bg-green-900/40 ring-2 ring-green-400',
  standard: 'border-yellow-500 bg-yellow-100 dark:bg-yellow-900/40 ring-2 ring-yellow-400',
  full: 'border-red-500 bg-red-100 dark:bg-red-900/40 ring-2 ring-red-400',
  custom: 'border-claw-500 bg-claw-100 ring-2 ring-claw-400',
};

const CUSTOM_STORAGE_KEY = 'clawsquire.customPermissions';

function loadCustomPermissions(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Record<string, boolean>;
  } catch { /* ignore */ }
  return Object.fromEntries(PERMISSIONS.map(p => [p.key, p.default.standard]));
}

async function applyPermissionConfig(key: string, enabled: boolean): Promise<void> {
  const set = (path: string, value: string) =>
    invoke('run_openclaw_cli', { args: ['config', 'set', path, value, '--json'] });

  switch (key) {
    case 'slashCommands': {
      const v = enabled ? '"auto"' : 'false';
      await set('commands.native', v);
      await set('commands.nativeSkills', v);
      break;
    }
    case 'botRestart':
      await set('commands.restart', String(enabled));
      break;
    case 'accessControl':
      await set('commands.useAccessGroups', String(enabled));
      break;
    case 'fileTools':
      if (enabled) {
        await set('tools.fs.workspaceOnly', 'false');
      } else {
        await invoke('config_set', { path: 'tools.profile', value: 'messaging' });
        await set('tools.fs.workspaceOnly', 'true');
      }
      break;
    case 'commandExec':
      await set('tools.exec.security', enabled ? '"allowlist"' : '"deny"');
      break;
    case 'browserScript':
      await set('browser.evaluateEnabled', String(enabled));
      break;
    case 'advancedConfig':
      await set('commands.config', String(enabled));
      await set('commands.debug', String(enabled));
      break;
  }
}

interface SafetyPresetsProps {
  value: SafetyLevel;
  onChange: (level: SafetyLevel) => void;
  showDetails?: boolean;
}

export default function SafetyPresets({ value, onChange, showDetails = false }: SafetyPresetsProps) {
  const { t } = useTranslation();
  const [expandCustom, setExpandCustom] = useState(false);
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>(loadCustomPermissions);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const levels: SafetyLevel[] = ['conservative', 'standard', 'full', 'custom'];

  const handleToggleCustom = async (key: string, enabled: boolean) => {
    const next = { ...customPermissions, [key]: enabled };
    setCustomPermissions(next);
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(next));
    setApplyingKey(key);
    try {
      await applyPermissionConfig(key, enabled);
    } catch { /* ignore; visual state is already updated */ }
    setApplyingKey(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => {
              onChange(level);
              if (level === 'custom') setExpandCustom(true);
            }}
            className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
              value === level ? PRESET_ACTIVE_COLORS[level] : PRESET_COLORS[level] + ' hover:shadow-md'
            }`}
          >
            <span className="text-xl mt-0.5">{PRESET_ICONS[level]}</span>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {t(`settings.safetyPresets.${level}.name`)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                {t(`settings.safetyPresets.${level}.description`)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {(showDetails || value === 'custom' || expandCustom) && (
        <>
          <PermissionsList
            level={value}
            customPermissions={customPermissions}
            applyingKey={applyingKey}
            onToggle={value === 'custom' ? handleToggleCustom : undefined}
          />
          {value === 'custom' && (
            <p className="text-xs text-gray-400 text-center mt-2">
              {t('settings.customHint')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface PermissionsListProps {
  level: SafetyLevel;
  customPermissions: Record<string, boolean>;
  applyingKey: string | null;
  onToggle?: (key: string, enabled: boolean) => void;
}

function PermissionsList({ level, customPermissions, applyingKey, onToggle }: PermissionsListProps) {
  const { t } = useTranslation();
  const isCustom = level === 'custom';

  const groups = [
    { label: t('settings.permissionLevels.basic'), filter: 'basic' as const, color: 'text-green-600' },
    { label: t('settings.permissionLevels.advanced'), filter: 'advanced' as const, color: 'text-yellow-600' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
      {groups.map((group) => {
        const perms = PERMISSIONS.filter((p) => p.level === group.filter);
        return (
          <div key={group.filter} className="p-4">
            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${group.color}`}>
              {group.label}
            </h4>
            <div className="space-y-2.5">
              {perms.map((perm) => {
                const enabled = isCustom
                  ? (customPermissions[perm.key] ?? perm.default.standard)
                  : perm.default[level];
                const isLocked = perm.locked || !isCustom;
                const isApplying = applyingKey === perm.key;

                return (
                  <div key={perm.key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {t(`settings.permissions.${perm.key}`)}
                    </span>
                    {isLocked ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        enabled
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}>
                        {enabled ? t('common.enabled') : t('common.disabled')}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {isApplying && (
                          <span className="text-gray-400 text-xs animate-pulse">···</span>
                        )}
                        <button
                          onClick={() => onToggle?.(perm.key, !enabled)}
                          disabled={isApplying}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                            enabled
                              ? 'bg-green-500 focus:ring-green-400'
                              : 'bg-gray-300 dark:bg-gray-600 focus:ring-gray-400'
                          }`}
                          role="switch"
                          aria-checked={enabled}
                          aria-label={t(`settings.permissions.${perm.key}`)}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                              enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
