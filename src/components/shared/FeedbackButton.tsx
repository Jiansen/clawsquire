import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

interface FeedbackInfo {
  platform: string;
  openclaw_version: string;
  clawsquire_version: string;
  gateway_status: string;
  llm_configured: boolean;
  recent_log_lines: string[];
  screenshot_path: string | null;
}

type IssueType = 'bug' | 'feature' | 'question';

const ISSUE_TEMPLATES: Record<IssueType, string> = {
  bug: 'bug_report.yml',
  feature: 'feature_request.yml',
  question: '',
};

export default function FeedbackButton() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'collecting' | 'ready'>('idle');
  const [info, setInfo] = useState<FeedbackInfo | null>(null);
  const [issueType, setIssueType] = useState<IssueType>('bug');
  const [description, setDescription] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includeGateway, setIncludeGateway] = useState(true);

  const handleOpen = async () => {
    setIsOpen(true);
    setPhase('collecting');
    try {
      const result = await invoke<FeedbackInfo>('collect_feedback_info');
      setInfo(result);
      setPhase('ready');
    } catch {
      setPhase('ready');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setPhase('idle');
    setDescription('');
  };

  const handleSubmit = async () => {
    const sections: string[] = [];

    if (description.trim()) {
      sections.push(`## ${t('feedback.descriptionLabel')}\n${description}`);
    }

    if (info) {
      sections.push([
        '## Environment',
        `- **Platform**: ${info.platform}`,
        `- **ClawSquire**: ${info.clawsquire_version}`,
        `- **OpenClaw**: ${info.openclaw_version}`,
        `- **LLM Configured**: ${info.llm_configured ? 'Yes' : 'No'}`,
      ].join('\n'));

      if (includeGateway && info.gateway_status) {
        sections.push(`## Gateway Status\n\`\`\`\n${info.gateway_status}\n\`\`\``);
      }

      if (includeLogs && info.recent_log_lines.length > 0) {
        sections.push(`## Recent Logs (last 30 lines)\n\`\`\`\n${info.recent_log_lines.join('\n')}\n\`\`\``);
      }

      if (info.screenshot_path) {
        sections.push(`## Screenshot\n_Screenshot saved to: \`${info.screenshot_path}\`_\n_Please drag and drop the file into this issue._`);
      }
    }

    const body = sections.join('\n\n');
    const template = ISSUE_TEMPLATES[issueType];
    const title = issueType === 'bug'
      ? `[Bug] ${description.slice(0, 60) || 'Bug report from ClawSquire'}`
      : issueType === 'feature'
        ? `[Feature] ${description.slice(0, 60) || 'Feature request from ClawSquire'}`
        : `[Question] ${description.slice(0, 60) || 'Question from ClawSquire'}`;

    const params = new URLSearchParams();
    params.set('title', title);
    params.set('body', body);
    if (template) params.set('template', template);

    const url = `https://github.com/Jiansen/clawsquire/issues/new?${params.toString()}`;

    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }

    handleClose();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        title={t('feedback.title')}
        className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">{t('feedback.title')}</h3>
                <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              {phase === 'collecting' && (
                <div className="text-center py-8 text-sm text-gray-500">
                  <span className="animate-spin inline-block mr-2">⏳</span>
                  {t('feedback.collecting')}
                </div>
              )}

              {phase === 'ready' && (
                <>
                  {/* Issue Type */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">{t('feedback.type')}</label>
                    <div className="flex gap-2">
                      {(['bug', 'feature', 'question'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setIssueType(type)}
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                            issueType === type
                              ? type === 'bug'
                                ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                                : type === 'feature'
                                  ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                                  : 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {type === 'bug' ? '🐛' : type === 'feature' ? '💡' : '❓'}{' '}
                          {t(`feedback.types.${type}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      {t('feedback.descriptionLabel')}
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('feedback.descriptionPlaceholder')}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-claw-500 focus:ring-2 focus:ring-claw-200 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Auto-collected info */}
                  {info && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {t('feedback.autoCollected')}
                      </p>
                      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>{t('dashboard.platform')}</span>
                          <span className="font-mono">{info.platform}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>OpenClaw</span>
                          <span className="font-mono">{info.openclaw_version}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>ClawSquire</span>
                          <span className="font-mono">{info.clawsquire_version}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>LLM</span>
                          <span>{info.llm_configured ? '✅' : '❌'}</span>
                        </div>
                        {info.screenshot_path && (
                          <div className="flex justify-between">
                            <span>{t('feedback.screenshot')}</span>
                            <span className="text-green-600">✅ {t('feedback.screenshotSaved')}</span>
                          </div>
                        )}
                      </div>

                      {/* Include toggles */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeGateway}
                            onChange={(e) => setIncludeGateway(e.target.checked)}
                            className="rounded border-gray-300 text-claw-600 focus:ring-claw-500"
                          />
                          {t('feedback.includeGateway')}
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeLogs}
                            onChange={(e) => setIncludeLogs(e.target.checked)}
                            className="rounded border-gray-300 text-claw-600 focus:ring-claw-500"
                          />
                          {t('feedback.includeLogs')}
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSubmit}
                      className="flex-1 rounded-lg bg-claw-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-claw-700 transition-all shadow-sm"
                    >
                      {t('feedback.submit')}
                    </button>
                    <button
                      onClick={handleClose}
                      className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>

                  <p className="text-[10px] text-gray-400 text-center">
                    {t('feedback.opensGithub')}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
