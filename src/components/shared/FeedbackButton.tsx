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

const REPO_ISSUES = 'https://github.com/Jiansen/clawsquire/issues/new';

const LABEL_MAP: Record<IssueType, string> = {
  bug: 'bug',
  feature: 'enhancement',
  question: 'question',
};

function mapPlatformToOs(platform: string): string {
  const m: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  return m[platform] || platform;
}

function buildIssueUrl(
  type: IssueType,
  title: string,
  description: string,
  info: FeedbackInfo | null,
  opts: { includeLogs: boolean; includeGateway: boolean },
) {
  const sections: string[] = [];

  if (description.trim()) {
    sections.push(`## Description\n${description}`);
  }

  if (info) {
    sections.push([
      '## Environment',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Platform** | ${mapPlatformToOs(info.platform)} |`,
      `| **ClawSquire** | ${info.clawsquire_version} |`,
      `| **OpenClaw** | ${info.openclaw_version} |`,
      `| **LLM Configured** | ${info.llm_configured ? 'Yes' : 'No'} |`,
    ].join('\n'));

    if (opts.includeGateway && info.gateway_status && info.gateway_status !== 'unknown') {
      sections.push(`## Gateway Status\n\`\`\`\n${info.gateway_status.slice(0, 300)}\n\`\`\``);
    }
    if (opts.includeLogs && info.recent_log_lines.length > 0) {
      const lines = info.recent_log_lines.slice(-15).join('\n');
      sections.push(`## Recent Logs\n\`\`\`\n${lines}\n\`\`\``);
    }
    if (info.screenshot_path) {
      sections.push('## Screenshot\n_Screenshot copied to clipboard — paste it here with **Cmd/Ctrl+V**_');
    }
  }

  sections.push('---\n_Auto-reported from ClawSquire app_');

  const params = new URLSearchParams();
  params.set('title', title);
  params.set('body', sections.join('\n\n'));
  params.set('labels', LABEL_MAP[type] || '');

  return `${REPO_ISSUES}?${params.toString()}`;
}

export default function FeedbackButton() {
  const { t } = useTranslation();
  const [isCollecting, setIsCollecting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [info, setInfo] = useState<FeedbackInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issueType, setIssueType] = useState<IssueType>('bug');
  const [description, setDescription] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includeGateway, setIncludeGateway] = useState(true);
  const [copiedScreenshot, setCopiedScreenshot] = useState(false);

  const handleOpen = async () => {
    setIsCollecting(true);
    setError(null);
    try {
      const result = await invoke<FeedbackInfo>('collect_feedback_info');
      setInfo(result);
      if (result.screenshot_path) {
        try {
          await invoke('copy_screenshot_to_clipboard', { path: result.screenshot_path });
          setCopiedScreenshot(true);
        } catch {
          setCopiedScreenshot(false);
        }
      }
    } catch (e) {
      setError(String(e));
    }
    setIsCollecting(false);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setDescription('');
    setError(null);
    setCopiedScreenshot(false);
  };

  const handleCopyScreenshot = async () => {
    if (!info?.screenshot_path) return;
    try {
      await invoke('copy_screenshot_to_clipboard', { path: info.screenshot_path });
      setCopiedScreenshot(true);
    } catch {
      setCopiedScreenshot(false);
    }
  };

  const handleSubmit = async () => {
    const prefix = issueType === 'bug' ? '[Bug]' : issueType === 'feature' ? '[Feature]' : '[Question]';
    const title = `${prefix} ${description.slice(0, 60) || `${issueType} report from ClawSquire`}`;

    if (info?.screenshot_path) {
      try {
        await invoke('copy_screenshot_to_clipboard', { path: info.screenshot_path });
      } catch { /* best effort */ }
    }

    const url = buildIssueUrl(issueType, title, description, info, { includeLogs, includeGateway });

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
        disabled={isCollecting}
        title={t('feedback.title')}
        className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {isCollecting ? (
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        )}
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

              {error && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  {t('feedback.collectError', { defaultValue: 'Could not collect some diagnostics. You can still submit feedback.' })}
                </div>
              )}

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
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                    <div className="flex justify-between">
                      <span>{t('dashboard.platform')}</span>
                      <span className="font-mono">{mapPlatformToOs(info.platform)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ClawSquire</span>
                      <span className="font-mono">{info.clawsquire_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>OpenClaw</span>
                      <span className="font-mono">{info.openclaw_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LLM</span>
                      <span>{info.llm_configured ? '✅ Configured' : '❌ Not configured'}</span>
                    </div>
                    {info.gateway_status && info.gateway_status !== 'unknown' && (
                      <div className="pt-1 border-t border-gray-200">
                        <span className="text-gray-500">Gateway:</span>
                        <pre className="mt-1 text-[10px] bg-gray-100 rounded p-1.5 overflow-x-auto max-h-16 whitespace-pre-wrap">
                          {info.gateway_status.slice(0, 200)}
                        </pre>
                      </div>
                    )}
                    {info.recent_log_lines.length > 0 && (
                      <div className="pt-1 border-t border-gray-200">
                        <span className="text-gray-500">Logs ({info.recent_log_lines.length} lines):</span>
                        <pre className="mt-1 text-[10px] bg-gray-100 rounded p-1.5 overflow-x-auto max-h-20 whitespace-pre-wrap">
                          {info.recent_log_lines.slice(-5).join('\n')}
                        </pre>
                      </div>
                    )}
                    {info.screenshot_path && (
                      <div className="pt-1 border-t border-gray-200 flex items-center justify-between">
                        <span className="text-gray-500">{t('feedback.screenshot')}</span>
                        <div className="flex items-center gap-2">
                          {copiedScreenshot ? (
                            <span className="text-green-600 text-[10px]">✅ {t('feedback.copiedToClipboard', { defaultValue: 'Copied to clipboard' })}</span>
                          ) : (
                            <button
                              onClick={handleCopyScreenshot}
                              className="text-[10px] text-claw-600 hover:text-claw-700 underline"
                            >
                              {t('feedback.copyScreenshot', { defaultValue: 'Copy to clipboard' })}
                            </button>
                          )}
                        </div>
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
                {info?.screenshot_path
                  ? t('feedback.screenshotHint', { defaultValue: 'Screenshot auto-copied to clipboard. Paste it (Cmd/Ctrl+V) in the GitHub issue.' })
                  : t('feedback.opensGithub')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
