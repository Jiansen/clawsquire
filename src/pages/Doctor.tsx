import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import InfoTooltip from '../components/shared/InfoTooltip';

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
  pass: { bg: 'bg-green-50', border: 'border-green-200', icon: '✅', badge: 'bg-green-100 text-green-700' },
  warn: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '⚠️', badge: 'bg-yellow-100 text-yellow-700' },
  fail: { bg: 'bg-red-50', border: 'border-red-200', icon: '❌', badge: 'bg-red-100 text-red-700' },
};

export default function Doctor() {
  const { t } = useTranslation();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  const runDoctor = async () => {
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
  };

  const groupedChecks = report
    ? CATEGORY_ORDER.map((cat) => ({
        category: cat,
        checks: report.checks.filter((c) => c.category === cat),
      })).filter((g) => g.checks.length > 0)
    : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">{t('doctor.title')}</h2>
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <div className="text-4xl mb-4">🩺</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('doctor.title')}</h3>
          <p className="text-sm text-gray-500 mb-4">
            {t('doctor.description')}
          </p>
          <button
            onClick={runDoctor}
            className="rounded-lg bg-claw-600 px-6 py-2.5 text-sm font-medium text-white
                       hover:bg-claw-700 transition-all shadow-sm"
          >
            {t('doctor.runCheck')}
          </button>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <SummaryCard label={t('doctor.total')} value={report.summary.total} color="bg-gray-100 text-gray-700" />
            <SummaryCard label={t('doctor.pass')} value={report.summary.passed} color="bg-green-100 text-green-700" />
            <SummaryCard label={t('doctor.warn')} value={report.summary.warnings} color="bg-yellow-100 text-yellow-700" />
            <SummaryCard label={t('doctor.fail')} value={report.summary.failures} color="bg-red-100 text-red-700" />
          </div>

          {groupedChecks.map(({ category, checks }) => {
            const catPassed = checks.filter((c) => c.status === 'pass').length;
            const catTotal = checks.length;
            const catHasIssues = checks.some((c) => c.status !== 'pass');
            return (
              <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {t(`doctor.categories.${category}`)}
                  </h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    catHasIssues ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {catPassed}/{catTotal}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {checks.map((check, idx) => {
                    const style = STATUS_STYLES[check.status];
                    const key = `${category}-${idx}`;
                    const isExpanded = expandedCheck === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setExpandedCheck(isExpanded ? null : key)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left
                                     hover:bg-gray-50 transition-colors ${style.bg}`}
                        >
                          <span className="text-base flex-shrink-0">{style.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{check.name}</div>
                            {check.message && (
                              <div className="text-xs text-gray-500 truncate">{check.message}</div>
                            )}
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${style.badge}`}>
                            {t(`doctor.${check.status}`)}
                          </span>
                        </button>
                        {isExpanded && (check.fix_hint || check.message) && (
                          <div className="px-4 pb-3 pt-1 bg-gray-50">
                            {check.message && (
                              <p className="text-sm text-gray-600 mb-2">{check.message}</p>
                            )}
                            {check.fix_hint && (
                              <div className="flex items-start gap-2 bg-claw-50 rounded-lg p-3">
                                <span className="text-xs">💡</span>
                                <p className="text-xs text-claw-700">{check.fix_hint}</p>
                              </div>
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
        </>
      )}
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
