import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import InfoTooltip from '../components/shared/InfoTooltip';
import CommunitySearch from '../components/shared/CommunitySearch';
import AgentChat from '../components/AgentChat';
import { useActiveTarget } from '../context/ActiveTargetContext';

interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  category: string;
  fix_hint: string | null;
}

interface DoctorReport {
  checks: DoctorCheck[];
  summary: { total: number; passed: number; warnings: number; failures: number };
}

const CATEGORY_ORDER = ['installation', 'config', 'gateway', 'security', 'backup'];

const STATUS_STYLES = {
  pass: { bg: 'bg-green-50 dark:bg-green-950/30', icon: '✅', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  warn: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', icon: '⚠️', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  fail: { bg: 'bg-red-50 dark:bg-red-950/30', icon: '❌', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
};

export default function Doctor() {
  const { t, i18n } = useTranslation();
  const { target } = useActiveTarget();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const runDoctor = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DoctorReport>('run_doctor');
      setReport(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runDoctor();
  }, [runDoctor, target.mode, target.instanceId]);

  const groupedChecks = report
    ? CATEGORY_ORDER.map((cat) => ({
        category: cat,
        checks: report.checks.filter((c) => c.category === cat),
      })).filter((g) => g.checks.length > 0)
    : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">🩺 {t('doctor.title')}</h2>
            <InfoTooltip conceptKey="gateway" inline />
          </div>
          <button
            onClick={runDoctor}
            disabled={loading}
            className="rounded-lg bg-claw-600 px-4 py-2 text-sm font-medium text-white
                       hover:bg-claw-700 disabled:opacity-50 transition-all shadow-sm"
          >
            {loading ? t('common.loading') : report ? t('doctor.rerun') : t('doctor.runCheck')}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && !report && (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 text-center">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-claw-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('doctor.checking')}</p>
          </div>
        )}

        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <SummaryCard label={t('doctor.total')} value={report.summary.total} color="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" />
              <SummaryCard label={t('doctor.pass')} value={report.summary.passed} color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" />
              <SummaryCard label={t('doctor.warn')} value={report.summary.warnings} color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" />
              <SummaryCard label={t('doctor.fail')} value={report.summary.failures} color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
            </div>

            {groupedChecks.map(({ category, checks }) => {
              const catPassed = checks.filter((c) => c.status === 'pass').length;
              const catTotal = checks.length;
              const catHasIssues = checks.some((c) => c.status !== 'pass');
              return (
                <div key={category} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t(`doctor.categories.${category}`)}
                    </h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      catHasIssues
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    }`}>
                      {catPassed}/{catTotal}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {checks.map((check, idx) => {
                      const style = STATUS_STYLES[check.status];
                      const key = `${category}-${idx}`;
                      const isExpanded = expandedCheck === key;
                      return (
                        <div key={key}>
                          <button
                            onClick={() => setExpandedCheck(isExpanded ? null : key)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left
                                       hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${style.bg}`}
                          >
                            <span className="text-base flex-shrink-0">{style.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{check.name}</div>
                              {check.message && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{check.message}</div>
                              )}
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${style.badge}`}>
                              {t(`doctor.${check.status}`)}
                            </span>
                          </button>
                          {isExpanded && (check.fix_hint || check.message) && (
                            <div className="px-4 pb-3 pt-1 bg-gray-50 dark:bg-gray-800/30">
                              {check.message && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{check.message}</p>
                              )}
                              {check.fix_hint && (
                                <div className="flex items-start gap-2 bg-claw-50 dark:bg-claw-900/20 rounded-lg p-3">
                                  <span className="text-xs">💡</span>
                                  <p className="text-xs text-claw-700 dark:text-claw-400">{check.fix_hint}</p>
                                </div>
                              )}
                              {check.status !== 'pass' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchQuery(check.name);
                                  }}
                                  className="mt-2 text-xs text-claw-600 dark:text-claw-400 hover:text-claw-700 dark:hover:text-claw-300 hover:underline transition"
                                >
                                  🔍 {t('doctor.search.searchFor', { name: check.name })}
                                </button>
                              )}
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
        )}
      </section>

      <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-1">
            🔍 {t('doctor.search.title')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('doctor.search.subtitle')}</p>
        </div>
        <CommunitySearch initialQuery={searchQuery || undefined} key={searchQuery} />
      </section>

      <AgentChat
        systemContext={[
          'You are ClawSquire Doctor — a diagnostic assistant for ClawSquire and OpenClaw.',
          '',
          'REFERENCE (link users to specific pages when relevant):',
          '- Doctor CLI: https://docs.openclaw.ai/cli/doctor',
          '- Health checks: https://docs.openclaw.ai/gateway/health',
          '- Gateway troubleshooting: https://docs.openclaw.ai/gateway/troubleshooting',
          '- General troubleshooting: https://docs.openclaw.ai/help/troubleshooting',
          '- Debugging: https://docs.openclaw.ai/help/debugging',
          '- Environment variables: https://docs.openclaw.ai/help/environment',
          '- Node.js issues: https://docs.openclaw.ai/debug/node-issue',
          '- Gateway config: https://docs.openclaw.ai/gateway/configuration',
          '- Logging: https://docs.openclaw.ai/gateway/logging',
          '',
          'CORE BEHAVIOR:',
          `- Reply in the user's language (current: ${i18n.language || 'en'}).`,
          '- Be evidence-driven: base your diagnosis on the health check results and the user\'s description.',
          '- Suggest specific fix commands when you\'re confident. Explain why each command is needed.',
          '- If unsure, say so and link to the most relevant docs page. Never fabricate solutions.',
          '- When referencing docs, provide the specific page URL.',
          '',
          'WHAT YOU HELP WITH:',
          '- Health check failures (gateway, node, config, network)',
          '- Runtime errors and crash diagnostics',
          '- Configuration issues and version conflicts',
          '- Performance problems and resource issues',
          '',
          'BOUNDARIES:',
          '- You are a Q&A assistant. You cannot execute commands — only suggest them.',
          '- If a problem is beyond OpenClaw (OS-level, hardware), say so.',
          '',
          report ? `CURRENT HEALTH REPORT: ${report.summary.failures} failures, ${report.summary.warnings} warnings out of ${report.summary.total} checks.` : '',
          report ? `Failed: ${report.checks.filter(c => c.status === 'fail').map(c => `${c.name}: ${c.message}`).join('; ')}` : '',
          report ? `Warnings: ${report.checks.filter(c => c.status === 'warn').map(c => `${c.name}: ${c.message}`).join('; ')}` : '',
        ].filter(Boolean).join('\n')}
        title={t('agentChat.doctorTitle')}
        placeholder={t('agentChat.doctorPlaceholder')}
      />
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-3 text-center ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
    </div>
  );
}
