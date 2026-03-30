import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';

interface AgentCommand {
  command: string;
  reason: string;
  risk: 'safe' | 'moderate' | 'dangerous';
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  output?: string;
}

interface AgentInstallerProps {
  errorMessage: string;
  onRetryInstall: () => void;
  onDismiss: () => void;
}

type AgentMode = 'choose' | 'auto' | 'manual';
type AgentPhase = 'checking-llm' | 'diagnosing' | 'ready' | 'executing' | 'done' | 'error';

export default function AgentInstaller({ errorMessage, onRetryInstall, onDismiss }: AgentInstallerProps) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<AgentMode>('choose');
  const [phase, setPhase] = useState<AgentPhase>('checking-llm');
  const [, setLlmReady] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [commands, setCommands] = useState<AgentCommand[]>([]);
  const [, setCurrentCmd] = useState(-1);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [agentLog]);

  useEffect(() => {
    checkLlm();
  }, []);

  const addLog = (msg: string) => setAgentLog((prev) => [...prev, msg]);

  const getStoredCredentials = () => {
    const provider = localStorage.getItem('clawsquire.llmProvider') || 'anthropic';
    const keyData = localStorage.getItem('clawsquire.apiKey');
    const apiKey = keyData ? (JSON.parse(keyData) as { key: string }).key || '' : '';
    return { provider, apiKey };
  };

  const checkLlm = async () => {
    setPhase('checking-llm');
    addLog(t('agentInstaller.checkingLlm'));
    try {
      const { provider, apiKey } = getStoredCredentials();
      if (!apiKey) {
        setLlmError('No API key configured. Please set up your AI provider first.');
        setPhase('error');
        return;
      }
      const res = await invoke<{ success: boolean; response: string | null; error: string | null; model: string | null }>(
        'test_llm',
        { provider, apiKey },
      );
      if (res.success) {
        addLog(t('agentInstaller.llmReady', { model: res.model || provider }));
        setLlmReady(true);
        startDiagnosis();
      } else {
        addLog(t('agentInstaller.llmFailed'));
        setLlmError(res.error || 'LLM not reachable');
        setPhase('error');
      }
    } catch (e) {
      setLlmError(String(e));
      setPhase('error');
    }
  };

  const startDiagnosis = async () => {
    setPhase('diagnosing');
    addLog(t('agentInstaller.diagnosing'));

    const { provider, apiKey } = getStoredCredentials();

    const lang = i18n.language || 'en';
    const systemPrompt = [
      'You are ClawSquire Fix Agent — a cross-platform troubleshooter for ClawSquire and OpenClaw.',
      '',
      'CORE BEHAVIOR:',
      `- Reply in the user's language (current: ${lang}). Diagnosis and reasons should be in that language.`,
      '- Be evidence-driven: the error message is your primary evidence. Read it carefully.',
      '- Be direct: identify root cause → provide fix commands. No filler, no speculation.',
      '- If unsure about the root cause, say so and suggest the most likely fix.',
      '',
      'APPROACH:',
      '1. Identify the OS from error context (paths, commands, error format).',
      '2. Identify the root cause: missing dependency, permission issue, PATH problem, version conflict, network error, etc.',
      '3. Generate ONLY the commands that fix the problem. No diagnostic-only commands.',
      '4. End with a verification or retry command when appropriate.',
      '',
      'RESPOND IN JSON ONLY:',
      '{"diagnosis": "1-2 sentence root cause", "commands": [{"command": "...", "reason": "why needed", "risk": "safe|moderate|dangerous"}]}',
      '',
      'RISK LEVELS:',
      '- safe: version checks, PATH adjustments, package manager installs',
      '- moderate: system-level installs, shell profile edits, service restarts',
      '- dangerous: anything requiring admin/sudo, modifying system files, deleting data',
      '',
      'BOUNDARIES:',
      '- Keep commands to 2-6. Fewer is better.',
      '- Never suggest wiping user data or unrelated system changes.',
      '- If the error suggests a network/auth issue (not fixable by commands), explain in diagnosis instead.',
    ].join('\n');

    const userMessage = `Operation failed. Here is the error output:\n\n${errorMessage}\n\nAnalyze the error and provide the fix commands.`;

    try {
      const res = await invoke<{ success: boolean; reply: string | null; error: string | null }>(
        'llm_chat_direct',
        { provider, apiKey, systemPrompt, userMessage },
      );

      if (res.success && res.reply) {
        try {
          const jsonMatch = res.reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            setDiagnosis(parsed.diagnosis || res.reply);
            const cmds: AgentCommand[] = (parsed.commands || []).map(
              (c: { command: string; reason: string; risk?: string }) => ({
                command: c.command,
                reason: c.reason,
                risk: c.risk || 'moderate',
                status: 'pending' as const,
              }),
            );
            setCommands(cmds);
            addLog(t('agentInstaller.foundCommands', { count: cmds.length }));
            setPhase('ready');
          } else {
            setDiagnosis(res.reply);
            addLog(t('agentInstaller.diagnosisComplete'));
            setPhase('ready');
          }
        } catch {
          setDiagnosis(res.reply);
          addLog(t('agentInstaller.diagnosisComplete'));
          setPhase('ready');
        }
      } else {
        addLog(t('agentInstaller.diagnosisFailed'));
        setPhase('error');
        setLlmError(res.error || 'Diagnosis failed');
      }
    } catch (e) {
      addLog(t('agentInstaller.diagnosisFailed'));
      setPhase('error');
      setLlmError(String(e));
    }
  };

  const [verifyResult, setVerifyResult] = useState<{ checked: boolean; installed: boolean } | null>(null);

  const verifyInstallation = async () => {
    addLog(t('agentInstaller.verifying', { defaultValue: 'Verifying installation...' }));
    try {
      const env = await invoke<{ openclaw_installed: boolean; openclaw_version: string | null }>('get_environment');
      const result = { checked: true, installed: env.openclaw_installed };
      setVerifyResult(result);
      if (env.openclaw_installed) {
        addLog(t('agentInstaller.verifySuccess', { defaultValue: `✓ OpenClaw installed (${env.openclaw_version})`, version: env.openclaw_version || '' }));
      } else {
        addLog(t('agentInstaller.verifyFailed', { defaultValue: '✗ OpenClaw still not detected' }));
      }
    } catch (e) {
      addLog(`Verify error: ${String(e)}`);
      setVerifyResult({ checked: true, installed: false });
    }
  };

  const executeAll = async () => {
    setMode('auto');
    setPhase('executing');
    for (let i = 0; i < commands.length; i++) {
      await executeCommand(i);
      if (commands[i]?.status === 'failed') break;
    }
    setPhase('done');
    await verifyInstallation();
  };

  const executeCommand = async (idx: number) => {
    setCurrentCmd(idx);
    setCommands((prev) => prev.map((c, i) => (i === idx ? { ...c, status: 'running' } : c)));
    addLog(`$ ${commands[idx].command}`);

    try {
      const res = await invoke<{ success: boolean; stdout: string; stderr: string }>(
        'run_shell_command',
        { command: commands[idx].command },
      );

      const output = res.stdout || res.stderr || '';
      addLog(output || '(no output)');
      setCommands((prev) =>
        prev.map((c, i) =>
          i === idx ? { ...c, status: res.success ? 'done' : 'failed', output } : c,
        ),
      );
    } catch (e) {
      const errStr = String(e);
      addLog(`Error: ${errStr}`);
      setCommands((prev) =>
        prev.map((c, i) =>
          i === idx ? { ...c, status: 'failed', output: errStr } : c,
        ),
      );
    }
  };

  const skipCommand = (idx: number) => {
    setCommands((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, status: 'skipped' } : c)),
    );
    addLog(`Skipped: ${commands[idx].command}`);
  };

  const riskBadge = (risk: string) => {
    switch (risk) {
      case 'safe':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">{t('agentInstaller.safe')}</span>;
      case 'moderate':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400">{t('agentInstaller.moderate')}</span>;
      case 'dangerous':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">{t('agentInstaller.dangerous')}</span>;
      default:
        return null;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <span className="text-green-500">✓</span>;
      case 'running':
        return <span className="animate-spin text-blue-500">⏳</span>;
      case 'failed':
        return <span className="text-red-500">✗</span>;
      case 'skipped':
        return <span className="text-gray-400">⏭</span>;
      default:
        return <span className="text-gray-400">○</span>;
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-2">
          <span>🤖</span> {t('agentInstaller.title')}
        </h3>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">
          {t('agentInstaller.dismiss')}
        </button>
      </div>

      <p className="text-xs text-violet-700 dark:text-violet-400">
        {t('agentInstaller.subtitle')}
      </p>

      {/* LLM check failed */}
      {phase === 'error' && llmError && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-400">{t('agentInstaller.llmNotAvailable')}</p>
            <pre className="text-xs text-red-500 mt-1 overflow-auto max-h-16">{llmError}</pre>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
            <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">{t('agentInstaller.tryVibeful')}</p>
            <a
              href="https://vibeful.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-all"
            >
              Vibeful ↗
            </a>
          </div>
        </div>
      )}

      {/* Checking LLM / Diagnosing */}
      {(phase === 'checking-llm' || phase === 'diagnosing') && (
        <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
          <span className="animate-spin">⏳</span>
          {phase === 'checking-llm' ? t('agentInstaller.checkingLlm') : t('agentInstaller.diagnosing')}
        </div>
      )}

      {/* Diagnosis result */}
      {diagnosis && (
        <div className="rounded-lg bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 p-3">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-1">
            {t('agentInstaller.diagnosisLabel')}
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{diagnosis}</p>
        </div>
      )}

      {/* Mode selection */}
      {phase === 'ready' && mode === 'choose' && commands.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-violet-700 dark:text-violet-400">
            {t('agentInstaller.modePrompt', { count: commands.length })}
          </p>
          <div className="flex gap-3">
            <button
              onClick={executeAll}
              className="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-all"
            >
              {t('agentInstaller.modeAuto')}
            </button>
            <button
              onClick={() => setMode('manual')}
              className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              {t('agentInstaller.modeManual')}
            </button>
          </div>
        </div>
      )}

      {/* Command list (manual mode or executing) */}
      {commands.length > 0 && (mode === 'manual' || phase === 'executing' || phase === 'done') && (
        <div className="space-y-2">
          {commands.map((cmd, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 ${
                cmd.status === 'running'
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30'
                  : cmd.status === 'done'
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                    : cmd.status === 'failed'
                      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {statusIcon(cmd.status)}
                    <code className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">
                      {cmd.command}
                    </code>
                    {riskBadge(cmd.risk)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-5">{cmd.reason}</p>
                  {cmd.output && (
                    <pre className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-5 max-h-20 overflow-auto bg-gray-50 dark:bg-gray-800 rounded p-1.5">
                      {cmd.output}
                    </pre>
                  )}
                </div>
                {mode === 'manual' && cmd.status === 'pending' && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={async () => {
                        await executeCommand(idx);
                        const allDone = commands.every((c, i) => i === idx || c.status !== 'pending');
                        if (allDone) {
                          setPhase('done');
                          await verifyInstallation();
                        }
                      }}
                      className="px-2.5 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-700 transition-all"
                    >
                      {t('agentInstaller.run')}
                    </button>
                    <button
                      onClick={() => skipCommand(idx)}
                      className="px-2.5 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-all"
                    >
                      {t('agentInstaller.skip')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done / Verify / Retry */}
      {phase === 'done' && (
        <div className="space-y-3">
          {verifyResult?.checked && verifyResult.installed && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 text-center">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                ✅ {t('agentInstaller.installConfirmed', { defaultValue: 'OpenClaw is now installed!' })}
              </p>
            </div>
          )}
          {verifyResult?.checked && !verifyResult.installed && (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-3 text-center">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                ⚠️ {t('agentInstaller.installNotConfirmed', { defaultValue: 'Commands ran but OpenClaw was not detected. You may need to restart or try again.' })}
              </p>
            </div>
          )}
          {!verifyResult && (
            <button
              onClick={verifyInstallation}
              className="w-full rounded-lg bg-blue-100 dark:bg-blue-900/40 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-all"
            >
              {t('agentInstaller.verifyButton', { defaultValue: 'Verify Installation' })}
            </button>
          )}
          <div className="flex gap-3">
            <button
              onClick={onRetryInstall}
              className="flex-1 rounded-lg bg-claw-600 px-4 py-2 text-sm font-medium text-white hover:bg-claw-700 transition-all"
            >
              {t('agentInstaller.retryInstall')}
            </button>
            <button
              onClick={onDismiss}
              className="rounded-lg bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-all"
            >
              {t('agentInstaller.close')}
            </button>
          </div>
        </div>
      )}

      {/* Agent log */}
      {agentLog.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
            {t('agentInstaller.viewLog')} ({agentLog.length})
          </summary>
          <div
            ref={logRef}
            className="mt-2 max-h-32 overflow-y-auto bg-gray-950 rounded-lg p-3 font-mono text-gray-400 space-y-0.5"
          >
            {agentLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </details>
      )}

      {/* Footer: Vibeful + Report */}
      <div className="pt-2 border-t border-violet-200 dark:border-violet-800 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          Powered by{' '}
          <a href="https://vibeful.io" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">
            Vibeful Core Engine
          </a>
          {' · '}
          <a href="https://vibeful.io" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">
            {t('agentInstaller.tryVibefulCloud')}
          </a>
        </p>
        <a
          href={`https://github.com/Jiansen/clawsquire/issues/new?title=${encodeURIComponent('[Agent] Fix failed')}&labels=bug,agent&body=${encodeURIComponent(`## Agent Error\n\`\`\`\n${errorMessage?.slice(0, 300) || 'N/A'}\n\`\`\`\n\n_Auto-reported from ClawSquire AI Agent_`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1"
        >
          ⚠️ {t('feedback.reportIssue')}
        </a>
      </div>
    </div>
  );
}
