import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useNavigate } from 'react-router';
import { invoke } from '@tauri-apps/api/core';
import InfoTooltip from '../components/shared/InfoTooltip';
import { OPENCLAW_GETTING_STARTED_URL } from '../constants';

const TEMPLATES = [
  { id: 'llm-provider', icon: '🧠', est: '~2 min', badge: 'recommended' as const },
  { id: 'email-telegram', icon: '📧', est: '~5 min', badge: null },
  { id: 'telegram', icon: '💬', est: '~3 min', badge: 'optional' as const },
  { id: 'whatsapp', icon: '📱', est: '~2 min', badge: 'optional' as const },
  { id: 'discord', icon: '🤖', est: '~3 min', badge: 'optional' as const },
  { id: 'vps-headless', icon: '🖥️', est: '~5 min', badge: null },
] as const;

interface StepDef {
  type: 'info' | 'input' | 'select' | 'model-select' | 'complete';
  titleKey: string;
  descKey: string;
  link?: string;
  linkTextKey?: string;
  placeholder?: string;
  configPath?: string;
  channelName?: string;
  isSecret?: boolean;
  options?: { value: string; labelKey: string; icon: string; recommended?: boolean }[];
  isDynamic?: boolean;
  conceptKey?: string;
}

const STATIC_LLM_PROVIDERS = [
  { value: 'openai', labelKey: 'onboard.modelGuide.providers.openai.name', icon: '🤖', recommended: true },
  { value: 'anthropic', labelKey: 'onboard.modelGuide.providers.anthropic.name', icon: '🧠' },
  { value: 'deepseek', labelKey: 'onboard.modelGuide.providers.deepseek.name', icon: '🚀' },
  { value: 'ollama', labelKey: 'onboard.modelGuide.providers.ollama.name', icon: '💻' },
];

const PINNED_PROVIDER_IDS = ['openai', 'anthropic', 'deepseek'];

const PROVIDER_ICONS: Record<string, string> = {
  openai: '🤖', anthropic: '🧠', google: '🔍', 'openai-codex': '💻',
  xai: '⚡', mistral: '🌬️', groq: '🏎️', cerebras: '🧬',
  openrouter: '🔀', 'amazon-bedrock': '☁️', 'azure-openai-responses': '☁️',
  'google-vertex': '🔍', 'google-gemini-cli': '🔍', huggingface: '🤗',
  zai: '🇨🇳', 'github-copilot': '🐙', deepseek: '🚀', ollama: '🖥️',
};

interface DynamicProvider {
  id: string;
  model_count: number;
  sample_models: string[];
  priority: number;
}

function getSteps(templateId: string): StepDef[] {
  switch (templateId) {
    case 'llm-provider':
      return [
        {
          type: 'select',
          titleKey: 'onboard.wizard.llmProvider.step1Title',
          descKey: 'onboard.wizard.llmProvider.step1Desc',
          options: STATIC_LLM_PROVIDERS,
          isDynamic: true,
          conceptKey: 'llmProvider',
        },
        {
          type: 'input',
          titleKey: 'onboard.wizard.llmProvider.step2Title',
          descKey: 'onboard.wizard.llmProvider.step2Desc',
          placeholder: 'onboard.wizard.llmProvider.step2Placeholder',
          isSecret: true,
          conceptKey: 'apiKey',
        },
        {
          type: 'model-select',
          titleKey: 'onboard.wizard.llmProvider.step3Title',
          descKey: 'onboard.wizard.llmProvider.step3Desc',
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.llmReadyTitle',
          descKey: 'onboard.wizard.llmReadyDesc',
        },
      ];
    case 'email-telegram':
      return [
        {
          type: 'info',
          titleKey: 'onboard.wizard.emailTelegram.step1Title',
          descKey: 'onboard.wizard.emailTelegram.step1Desc',
          link: 'https://t.me/BotFather',
          linkTextKey: 'onboard.wizard.telegram.step1LinkText',
          conceptKey: 'channel',
        },
        {
          type: 'input',
          titleKey: 'onboard.wizard.emailTelegram.step2Title',
          descKey: 'onboard.wizard.emailTelegram.step2Desc',
          placeholder: 'onboard.wizard.emailTelegram.step2Placeholder',
          isSecret: true,
          conceptKey: 'token',
        },
        {
          type: 'input',
          titleKey: 'onboard.wizard.emailTelegram.step3Title',
          descKey: 'onboard.wizard.emailTelegram.step3Desc',
          placeholder: 'onboard.wizard.emailTelegram.step3Placeholder',
        },
        {
          type: 'select',
          titleKey: 'onboard.wizard.emailTelegram.step4Title',
          descKey: 'onboard.wizard.emailTelegram.step4Desc',
          options: [
            { value: '5m', labelKey: 'onboard.wizard.emailTelegram.interval5m', icon: '⚡' },
            { value: '15m', labelKey: 'onboard.wizard.emailTelegram.interval15m', icon: '⏱️', recommended: true },
            { value: '30m', labelKey: 'onboard.wizard.emailTelegram.interval30m', icon: '🕐' },
            { value: '1h', labelKey: 'onboard.wizard.emailTelegram.interval1h', icon: '🕑' },
          ],
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.emailTelegram.completeTitle',
          descKey: 'onboard.wizard.emailTelegram.completeDesc',
        },
      ];
    case 'telegram':
      return [
        {
          type: 'info',
          titleKey: 'onboard.wizard.telegram.step1Title',
          descKey: 'onboard.wizard.telegram.step1Desc',
          link: 'https://t.me/BotFather',
          linkTextKey: 'onboard.wizard.telegram.step1LinkText',
          conceptKey: 'channel',
        },
        {
          type: 'input',
          titleKey: 'onboard.wizard.telegram.step2Title',
          descKey: 'onboard.wizard.telegram.step2Desc',
          placeholder: 'onboard.wizard.telegram.step2Placeholder',
          channelName: 'telegram',
          isSecret: true,
          conceptKey: 'token',
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.completeTitle',
          descKey: 'onboard.wizard.completeDesc',
        },
      ];
    case 'whatsapp':
      return [
        {
          type: 'info',
          titleKey: 'onboard.wizard.whatsapp.step1Title',
          descKey: 'onboard.wizard.whatsapp.step1Desc',
          link: 'https://docs.openclaw.ai/channels/whatsapp',
          linkTextKey: 'onboard.wizard.whatsapp.step1LinkText',
          conceptKey: 'channel',
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.completeTitle',
          descKey: 'onboard.wizard.whatsapp.completeDesc',
        },
      ];
    case 'discord':
      return [
        {
          type: 'info',
          titleKey: 'onboard.wizard.discord.step1Title',
          descKey: 'onboard.wizard.discord.step1Desc',
          link: 'https://discord.com/developers/applications',
          linkTextKey: 'onboard.wizard.discord.step1LinkText',
          conceptKey: 'channel',
        },
        {
          type: 'input',
          titleKey: 'onboard.wizard.discord.step2Title',
          descKey: 'onboard.wizard.discord.step2Desc',
          placeholder: 'onboard.wizard.discord.step2Placeholder',
          channelName: 'discord',
          isSecret: true,
          conceptKey: 'token',
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.completeTitle',
          descKey: 'onboard.wizard.completeDesc',
        },
      ];
    case 'vps-headless':
      return [
        {
          type: 'info',
          titleKey: 'onboard.wizard.vpsHeadless.step1Title',
          descKey: 'onboard.wizard.vpsHeadless.step1Desc',
          conceptKey: 'daemon',
        },
        {
          type: 'input',
          titleKey: 'onboard.wizard.vpsHeadless.step2Title',
          descKey: 'onboard.wizard.vpsHeadless.step2Desc',
          placeholder: 'onboard.wizard.vpsHeadless.step2Placeholder',
          configPath: 'gateway.auth.token',
          isSecret: true,
          conceptKey: 'gateway',
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.completeTitle',
          descKey: 'onboard.wizard.completeDesc',
        },
      ];
    default:
      return [];
  }
}

export default function Onboard() {
  const { templateId } = useParams<{ templateId?: string }>();

  if (templateId) {
    return <OnboardWizard templateId={templateId} />;
  }
  return <TemplateList />;
}

function TemplateList() {
  const { t } = useTranslation();
  const [openclawInstalled, setOpenclawInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<{ openclaw_installed: boolean }>('get_environment').then((env) => {
      setOpenclawInstalled(env.openclaw_installed);
    });
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('onboard.title')}</h2>
        <p className="mt-1 text-gray-500 dark:text-gray-400">{t('onboard.chooseTemplate')}</p>
      </div>

      {openclawInstalled === false && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 p-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">{t('onboard.wizard.prereqNotInstalled')}</p>
            <a
              href={OPENCLAW_GETTING_STARTED_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-yellow-700 underline mt-1 inline-block"
            >
              {t('onboard.wizard.installLink')}
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TEMPLATES.map((tpl) => (
          <Link
            key={tpl.id}
            to={`/onboard/${tpl.id}`}
            className={`relative bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-6 hover:shadow-md transition-all group ${
              tpl.badge === 'recommended'
                ? 'border-claw-300 ring-1 ring-claw-200'
                : 'border-gray-200 dark:border-gray-800 hover:border-claw-300'
            }`}
          >
            {tpl.badge === 'recommended' && (
              <span className="absolute -top-2.5 right-3 bg-claw-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                {t('common.recommended')}
              </span>
            )}
            {tpl.badge === 'optional' && (
              <span className="absolute -top-2.5 right-3 bg-gray-400 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                {t('common.optional')}
              </span>
            )}
            <div className="flex items-start gap-4">
              <span className="text-3xl">{tpl.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-claw-700 transition-colors">
                  {t(`onboard.templates.${tpl.id}.name`)}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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

function OnboardWizard({ templateId }: { templateId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [dynamicProviders, setDynamicProviders] = useState<DynamicProvider[] | null>(null);
  const [models, setModels] = useState<{ id: string; input: string; context_window: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [providerSearch, setProviderSearch] = useState('');

  useEffect(() => {
    invoke<DynamicProvider[]>('list_providers')
      .then(setDynamicProviders)
      .catch(() => setDynamicProviders(null));
  }, []);

  const providerOptions = (() => {
    if (!dynamicProviders) {
      return STATIC_LLM_PROVIDERS.map((p) => ({ ...p, label: p.value, modelCount: 0 }));
    }
    const dynamicIds = new Set(dynamicProviders.map((p) => p.id));
    const dynamic = dynamicProviders.map((p) => ({
      value: p.id,
      labelKey: `onboard.modelGuide.providers.${p.id}.name`,
      label: p.id,
      icon: PROVIDER_ICONS[p.id] || '🔌',
      recommended: p.priority === 0,
      modelCount: p.model_count,
    }));
    const missingStatic = STATIC_LLM_PROVIDERS
      .filter((p) => !dynamicIds.has(p.value))
      .map((p) => ({ ...p, label: p.value, modelCount: 0 }));
    return [...dynamic, ...missingStatic];
  })();

  const steps = getSteps(templateId);

  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<{
    phase: 'idle' | 'testing' | 'success' | 'error';
    response?: string;
    error?: string;
    model?: string;
  }>({ phase: 'idle' });

  if (steps.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Template not found.</p>
        <Link to="/onboard" className="text-claw-600 underline mt-2 inline-block">
          {t('onboard.wizard.startAnother')}
        </Link>
      </div>
    );
  }

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = step.type === 'complete';
  const totalNonComplete = steps.filter((s) => s.type !== 'complete').length;

  const inputKey = `step-${currentStep}`;
  const inputValue = values[inputKey] || '';

  const canProceed = (() => {
    if (step.type === 'info') return true;
    if (step.type === 'select') return true;
    if (step.type === 'input') return inputValue.trim().length > 0;
    if (step.type === 'model-select') return models.length === 0 || selectedModel.length > 0;
    return true;
  })();

  const handleNext = async () => {
    if (!canProceed) return;
    setError(null);

    if (step.type === 'input' && step.channelName) {
      setSaving(true);
      try {
        const res = await invoke<{ success: boolean; error?: string | null }>('add_channel', {
          channel: step.channelName,
          token: inputValue.trim(),
        });
        if (!res.success && res.error) {
          setError(res.error);
          setSaving(false);
          return;
        }
      } catch (e) {
        setError(String(e));
        setSaving(false);
        return;
      }
      setSaving(false);
    } else if (step.type === 'input' && step.configPath) {
      setSaving(true);
      try {
        await invoke('config_set', { path: step.configPath, value: inputValue.trim() });
      } catch (e) {
        setError(String(e));
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (step.type === 'input' && !step.configPath && !step.channelName && templateId === 'llm-provider') {
      setSaving(true);
      try {
        await invoke('setup_provider', { provider: selectedProvider, apiKey: inputValue.trim() });
      } catch (e) {
        setError(String(e));
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (step.type === 'select' && (templateId === 'telegram' || templateId === 'llm-provider')) {
      setSelectedProvider(values[`select-${currentStep}`] || 'openai');
    }

    if (templateId === 'email-telegram' && step.type === 'select') {
      setSaving(true);
      try {
        const telegramToken = values['step-1'] || '';
        const emailAddress = values['step-2'] || '';
        const interval = values[`select-${currentStep}`] || '15m';
        const res = await invoke<{ channel_ok: boolean; cron_ok: boolean; errors: string[] }>('setup_email_monitor', {
          telegramToken: telegramToken.trim(),
          emailAddress: emailAddress.trim(),
          checkInterval: interval,
        });
        if (res.errors.length > 0) {
          setError(res.errors.join('\n'));
          setSaving(false);
          return;
        }
      } catch (e) {
        setError(String(e));
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (step.type === 'model-select' && selectedModel && models.length > 0) {
      // Model is already configured in the provider — this step is confirmation only.
      // No additional config_set needed.
    }

    const nextStep = Math.min(currentStep + 1, steps.length - 1);
    if (steps[nextStep]?.type === 'model-select') {
      const provider = values[`select-0`] || selectedProvider;
      setModelsLoading(true);
      setModels([]);
      try {
        const res = await invoke<{ id: string; input: string; context_window: string }[]>('list_models', { provider });
        setModels(res);
        if (res.length > 0) setSelectedModel(res[0].id);
      } catch {
        setModels([]);
      }
      setModelsLoading(false);
    }

    setCurrentStep(nextStep);
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const templateName = t(`onboard.templates.${templateId}.name`);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/onboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </Link>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{templateName}</h2>
      </div>

      {!isLast && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('onboard.step', { current: currentStep + 1, total: totalNonComplete })}
          </span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-claw-500 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalNonComplete) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t(step.titleKey)}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t(step.descKey)}</p>
          </div>
          {step.conceptKey && <InfoTooltip conceptKey={step.conceptKey} />}
        </div>

        {step.type === 'info' && step.link && (
          <a
            href={step.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-claw-50 px-4 py-2.5 text-sm font-medium text-claw-700 hover:bg-claw-100 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" />
              <path d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" />
            </svg>
            {step.linkTextKey ? t(step.linkTextKey) : step.link}
          </a>
        )}

        {step.type === 'select' && step.options && (() => {
          const allOpts = step.isDynamic ? providerOptions : step.options;
          const renderCard = (opt: typeof allOpts[number]) => {
            const selected = (values[`select-${currentStep}`] || 'openai') === opt.value;
            const translated = t(opt.labelKey, { defaultValue: '' });
            const displayName: string = (typeof translated === 'string' && translated) ? translated : ('label' in opt ? String((opt as Record<string, unknown>).label) : opt.value);
            const mCount = 'modelCount' in opt ? Number((opt as Record<string, unknown>).modelCount) : 0;
            return (
              <button
                key={opt.value}
                onClick={() => setValues((v) => ({ ...v, [`select-${currentStep}`]: opt.value }))}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                  selected
                    ? 'border-claw-500 bg-claw-50 shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                }`}
              >
                {opt.recommended && (
                  <span className="absolute -top-2 right-2 bg-claw-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {t('common.recommended')}
                  </span>
                )}
                <span className="text-2xl">{opt.icon}</span>
                <div className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{displayName}</div>
                {mCount > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">{mCount} models</div>
                )}
              </button>
            );
          };

          if (!step.isDynamic) {
            return <div className="grid grid-cols-2 gap-3">{allOpts.map(renderCard)}</div>;
          }

          const pinned = allOpts.filter((o) => PINNED_PROVIDER_IDS.includes(o.value));
          const others = allOpts.filter((o) => !PINNED_PROVIDER_IDS.includes(o.value));
          const q = providerSearch.toLowerCase();
          const filtered = q
            ? others.filter((o) => {
                const tl = t(o.labelKey, { defaultValue: '' });
                const name = (typeof tl === 'string' && tl) ? tl : o.value;
                return name.toLowerCase().includes(q) || o.value.toLowerCase().includes(q);
              })
            : others;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">{pinned.map(renderCard)}</div>
              {others.length > 0 && (
                <>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={providerSearch}
                      onChange={(e) => setProviderSearch(e.target.value)}
                      placeholder={t('onboard.wizard.searchProviders')}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-800 pl-10 pr-3 py-2 text-sm focus:border-claw-400 focus:ring-1 focus:ring-claw-400 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                    {filtered.length > 0 ? filtered.map(renderCard) : (
                      <p className="col-span-2 text-center text-sm text-gray-400 py-3">{t('onboard.wizard.noProviderMatch')}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {step.type === 'input' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('onboard.wizard.apiKeyLabel')}
            </label>
            <input
              type={step.isSecret ? 'password' : 'text'}
              value={inputValue}
              onChange={(e) => {
                setValues((v) => ({ ...v, [inputKey]: e.target.value }));
                setTestState({ phase: 'idle' });
              }}
              placeholder={step.placeholder ? t(step.placeholder) : ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none
                         transition-all font-mono"
              autoFocus
            />
            {step.isSecret && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V7H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1.5V4.5A3.5 3.5 0 008 1zm2 6V4.5a2 2 0 10-4 0V7h4z" clipRule="evenodd" />
                </svg>
                {t('onboard.wizard.apiKeyHint')}
              </p>
            )}

            {templateId === 'llm-provider' && inputValue.trim().length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                {testState.phase === 'idle' && (
                  <button
                    onClick={async () => {
                      setTestState({ phase: 'testing' });
                      try {
                        const provider = values[`select-0`] || selectedProvider;
                        const res = await invoke<{ success: boolean; response: string | null; error: string | null; model: string | null }>('test_llm', {
                          provider,
                          apiKey: inputValue.trim(),
                        });
                        if (res.success) {
                          setTestState({ phase: 'success', response: res.response || '', model: res.model || '' });
                        } else {
                          setTestState({ phase: 'error', error: res.error || 'Unknown error', model: res.model || '' });
                        }
                      } catch (e) {
                        setTestState({ phase: 'error', error: String(e) });
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-all"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    {t('onboard.wizard.testConnection')}
                  </button>
                )}
                {testState.phase === 'testing' && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="animate-spin">⏳</span>
                    {t('onboard.wizard.testing')}
                  </div>
                )}
                {testState.phase === 'success' && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                    <p className="text-sm font-medium text-green-800 flex items-center gap-1.5">
                      <span>✅</span> {t('onboard.wizard.testSuccess')}
                    </p>
                    {testState.response && (
                      <div className="mt-2 rounded bg-green-100 dark:bg-green-900/40 p-2 text-xs text-green-700 dark:text-green-400">
                        <span className="font-medium">{t('onboard.wizard.testResponse')}</span>
                        <p className="mt-1 italic">&ldquo;{testState.response}&rdquo;</p>
                      </div>
                    )}
                    {testState.model && (
                      <p className="mt-1 text-xs text-green-600">{t('onboard.wizard.testModel', { model: testState.model })}</p>
                    )}
                  </div>
                )}
                {testState.phase === 'error' && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                    <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
                      <span>❌</span> {t('onboard.wizard.testFailed')}
                    </p>
                    {testState.error && (
                      <pre className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded p-2 overflow-auto max-h-24">
                        {testState.error}
                      </pre>
                    )}
                    <button
                      onClick={() => setTestState({ phase: 'idle' })}
                      className="mt-2 text-xs text-red-600 dark:text-red-400 underline"
                    >
                      {t('dashboard.install.tryAgain')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step.type === 'model-select' && (
          <div className="space-y-2">
            {modelsLoading ? (
              <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                <span className="animate-spin inline-block mr-2">⏳</span>
                {t('common.loading')}
              </div>
            ) : models.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('onboard.wizard.llmProvider.noModels')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('onboard.wizard.llmProvider.skipModelHint')}</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                {models.map((m) => {
                  const shortName = m.id.includes('/') ? m.id.split('/').pop()! : m.id;
                  const selected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-all ${
                        selected
                          ? 'bg-claw-50 border-2 border-claw-500'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800/50 border-2 border-transparent'
                      }`}
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{shortName}</span>
                        <span className="ml-2 text-xs text-gray-400">{m.input}</span>
                      </div>
                      <span className="text-xs text-gray-400">{m.context_window}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step.type === 'complete' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">🎉</div>
            {templateId === 'llm-provider' && <TryChatMini />}
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => navigate('/')}
                className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 transition-all shadow-sm"
              >
                {t('onboard.wizard.goToDashboard')}
              </button>
              <Link
                to="/onboard"
                className="rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-all"
              >
                {t('onboard.wizard.startAnother')}
              </Link>
            </div>
            {templateId === 'llm-provider' && (
              <p className="mt-4 text-xs text-gray-400">
                {t('onboard.wizard.optionalBotsHint')}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {!isLast && (
        <div className="flex justify-between">
          <button
            onClick={isFirst ? () => navigate('/onboard') : handleBack}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-all"
          >
            {t('onboard.back')}
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed || saving}
            className="rounded-lg bg-claw-600 px-6 py-2 text-sm font-medium text-white
                       hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
          >
            {saving ? t('onboard.wizard.saving') : t('onboard.next')}
          </button>
        </div>
      )}
    </div>
  );
}

function TryChatMini() {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const handleSend = async () => {
    const msg = message.trim() || 'Hello! What can you do?';
    setPhase('sending');
    setReply('');
    setError('');
    try {
      const res = await invoke<{ success: boolean; reply?: string | null; error?: string | null }>('agent_chat', { message: msg });
      if (res.success && res.reply) {
        setReply(res.reply);
        setPhase('done');
      } else {
        setError(res.error || 'No response');
        setPhase('error');
      }
    } catch (e) {
      setError(String(e));
      setPhase('error');
    }
  };

  return (
    <div className="mt-4 mb-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 text-left">
      <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
        <span>💬</span> {t('onboard.wizard.tryChatTitle')}
      </h4>
      <p className="text-xs text-green-700 dark:text-green-400 mb-3">{t('onboard.wizard.tryChatDesc')}</p>

      {phase === 'idle' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('onboard.wizard.tryChatPlaceholder')}
            className="flex-1 rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-400 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-all"
          >
            {t('onboard.wizard.tryChatSend')}
          </button>
        </div>
      )}

      {phase === 'sending' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <span className="animate-spin">⏳</span> {t('onboard.wizard.tryChatSending')}
        </div>
      )}

      {phase === 'done' && reply && (
        <div className="space-y-2">
          <div className="rounded-lg bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800 p-3">
            <p className="text-xs text-green-500 font-medium mb-1">🦞 OpenClaw:</p>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{reply}</p>
          </div>
          <button
            onClick={() => { setPhase('idle'); setMessage(''); }}
            className="text-xs text-green-600 underline"
          >
            {t('onboard.wizard.tryChatAgain')}
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-3">
            <p className="text-xs text-yellow-700">{t('onboard.wizard.tryChatError')}</p>
            <pre className="text-xs text-yellow-600 mt-1 overflow-auto max-h-16">{error}</pre>
          </div>
          <button
            onClick={() => setPhase('idle')}
            className="text-xs text-yellow-600 underline"
          >
            {t('dashboard.install.tryAgain')}
          </button>
        </div>
      )}
    </div>
  );
}
