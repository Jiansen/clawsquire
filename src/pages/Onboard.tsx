import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useNavigate } from 'react-router';
import { invoke } from '@tauri-apps/api/core';
import InfoTooltip from '../components/shared/InfoTooltip';
import { OPENCLAW_GETTING_STARTED_URL } from '../constants';

const TEMPLATES = [
  { id: 'telegram', icon: '💬', est: '~3 min' },
  { id: 'discord', icon: '🤖', est: '~3 min' },
  { id: 'llm-provider', icon: '🧠', est: '~2 min' },
  { id: 'vps-headless', icon: '🖥️', est: '~5 min' },
] as const;

interface StepDef {
  type: 'info' | 'input' | 'select' | 'complete';
  titleKey: string;
  descKey: string;
  link?: string;
  linkTextKey?: string;
  placeholder?: string;
  configPath?: string;
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
          type: 'complete',
          titleKey: 'onboard.wizard.completeTitle',
          descKey: 'onboard.wizard.completeDesc',
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
          configPath: 'gateways.telegram.botToken',
          isSecret: true,
          conceptKey: 'token',
        },
        {
          type: 'select',
          titleKey: 'onboard.wizard.telegram.step3Title',
          descKey: 'onboard.wizard.telegram.step3Desc',
          options: STATIC_LLM_PROVIDERS,
          isDynamic: true,
          conceptKey: 'llmProvider',
        },
        {
          type: 'complete',
          titleKey: 'onboard.wizard.completeTitle',
          descKey: 'onboard.wizard.completeDesc',
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
          configPath: 'gateways.discord.botToken',
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
          configPath: 'gateway.token',
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
        <h2 className="text-2xl font-bold text-gray-900">{t('onboard.title')}</h2>
        <p className="mt-1 text-gray-500">{t('onboard.chooseTemplate')}</p>
      </div>

      {openclawInstalled === false && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-800">{t('onboard.wizard.prereqNotInstalled')}</p>
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
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-claw-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{tpl.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 group-hover:text-claw-700 transition-colors">
                  {t(`onboard.templates.${tpl.id}.name`)}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
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
        <p className="text-gray-500">Template not found.</p>
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
    return true;
  })();

  const handleNext = async () => {
    if (!canProceed) return;
    setError(null);

    if (step.type === 'input' && step.configPath) {
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

    if (step.type === 'input' && !step.configPath && templateId === 'llm-provider') {
      setSaving(true);
      try {
        const providerConfigPath = `models.providers.${selectedProvider}.apiKey`;
        await invoke('config_set', { path: providerConfigPath, value: inputValue.trim() });
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

    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const templateName = t(`onboard.templates.${templateId}.name`);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/onboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </Link>
        <h2 className="text-xl font-bold text-gray-900">{templateName}</h2>
      </div>

      {!isLast && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t(step.titleKey)}</h3>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">{t(step.descKey)}</p>
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

        {step.type === 'select' && step.options && (
          <div className="grid grid-cols-2 gap-3">
            {(step.isDynamic ? providerOptions : step.options).map((opt) => {
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
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.recommended && (
                    <span className="absolute -top-2 right-2 bg-claw-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {t('common.recommended')}
                    </span>
                  )}
                  <span className="text-2xl">{opt.icon}</span>
                  <div className="mt-2 text-sm font-medium text-gray-900">{displayName}</div>
                  {mCount > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">{mCount} models</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {step.type === 'input' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
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
              <div className="mt-3 pt-3 border-t border-gray-100">
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
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    {t('onboard.wizard.testConnection')}
                  </button>
                )}
                {testState.phase === 'testing' && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="animate-spin">⏳</span>
                    {t('onboard.wizard.testing')}
                  </div>
                )}
                {testState.phase === 'success' && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                    <p className="text-sm font-medium text-green-800 flex items-center gap-1.5">
                      <span>✅</span> {t('onboard.wizard.testSuccess')}
                    </p>
                    {testState.response && (
                      <div className="mt-2 rounded bg-green-100 p-2 text-xs text-green-700">
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
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
                      <span>❌</span> {t('onboard.wizard.testFailed')}
                    </p>
                    {testState.error && (
                      <pre className="mt-2 text-xs text-red-600 bg-red-100 rounded p-2 overflow-auto max-h-24">
                        {testState.error}
                      </pre>
                    )}
                    <button
                      onClick={() => setTestState({ phase: 'idle' })}
                      className="mt-2 text-xs text-red-600 underline"
                    >
                      {t('dashboard.install.tryAgain')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step.type === 'complete' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">🎉</div>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => navigate('/')}
                className="rounded-lg bg-claw-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-claw-700 transition-all shadow-sm"
              >
                {t('onboard.wizard.goToDashboard')}
              </button>
              <Link
                to="/onboard"
                className="rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
              >
                {t('onboard.wizard.startAnother')}
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {!isLast && (
        <div className="flex justify-between">
          <button
            onClick={isFirst ? () => navigate('/onboard') : handleBack}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
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
