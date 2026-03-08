import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SafetyLevel = 'conservative' | 'standard' | 'full' | 'custom';

interface Permission {
  key: string;
  level: 'basic' | 'advanced' | 'expert';
  default: Record<SafetyLevel, boolean>;
}

const PERMISSIONS: Permission[] = [
  { key: 'chat', level: 'basic', default: { conservative: true, standard: true, full: true, custom: true } },
  { key: 'configManagement', level: 'basic', default: { conservative: true, standard: true, full: true, custom: true } },
  { key: 'browserControl', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'fileAccess', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'skillInstall', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'cronJobs', level: 'advanced', default: { conservative: false, standard: true, full: true, custom: false } },
  { key: 'camera', level: 'expert', default: { conservative: false, standard: false, full: true, custom: false } },
  { key: 'voiceWake', level: 'expert', default: { conservative: false, standard: false, full: true, custom: false } },
  { key: 'canvas', level: 'expert', default: { conservative: false, standard: false, full: true, custom: false } },
  { key: 'autoExec', level: 'expert', default: { conservative: false, standard: false, full: true, custom: false } },
];

const PRESET_ICONS: Record<SafetyLevel, string> = {
  conservative: '🔒',
  standard: '🟡',
  full: '🔓',
  custom: '⚙️',
};

const PRESET_COLORS: Record<SafetyLevel, string> = {
  conservative: 'border-green-300 bg-green-50',
  standard: 'border-yellow-300 bg-yellow-50',
  full: 'border-red-300 bg-red-50',
  custom: 'border-gray-300 bg-gray-50',
};

const PRESET_ACTIVE_COLORS: Record<SafetyLevel, string> = {
  conservative: 'border-green-500 bg-green-100 ring-2 ring-green-400',
  standard: 'border-yellow-500 bg-yellow-100 ring-2 ring-yellow-400',
  full: 'border-red-500 bg-red-100 ring-2 ring-red-400',
  custom: 'border-claw-500 bg-claw-100 ring-2 ring-claw-400',
};

interface SafetyPresetsProps {
  value: SafetyLevel;
  onChange: (level: SafetyLevel) => void;
  showDetails?: boolean;
}

export default function SafetyPresets({ value, onChange, showDetails = false }: SafetyPresetsProps) {
  const { t } = useTranslation();
  const [expandCustom, setExpandCustom] = useState(false);

  const levels: SafetyLevel[] = ['conservative', 'standard', 'full', 'custom'];

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
              <div className="font-semibold text-sm text-gray-900">
                {t(`settings.safetyPresets.${level}.name`)}
              </div>
              <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                {t(`settings.safetyPresets.${level}.description`)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {(showDetails || value === 'custom' || expandCustom) && (
        <PermissionsList level={value} />
      )}
    </div>
  );
}

function PermissionsList({ level }: { level: SafetyLevel }) {
  const { t } = useTranslation();

  const groups = [
    { label: t('settings.permissionLevels.basic'), filter: 'basic' as const, color: 'text-green-600' },
    { label: t('settings.permissionLevels.advanced'), filter: 'advanced' as const, color: 'text-yellow-600' },
    { label: t('settings.permissionLevels.expert'), filter: 'expert' as const, color: 'text-red-600' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
      {groups.map((group) => {
        const perms = PERMISSIONS.filter((p) => p.level === group.filter);
        return (
          <div key={group.filter} className="p-4">
            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${group.color}`}>
              {group.label}
            </h4>
            <div className="space-y-2">
              {perms.map((perm) => {
                const enabled = perm.default[level];
                return (
                  <div key={perm.key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      {t(`settings.permissions.${perm.key}`)}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {enabled ? t('common.enabled') : t('common.disabled')}
                    </span>
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
