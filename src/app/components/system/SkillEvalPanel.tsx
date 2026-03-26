'use client';

import { useState, useEffect } from 'react';
import type { Model } from '@/app/types';

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", "Courier New", monospace' };

const EVAL_SKILLS = [
  { name: 'writer', label: '✍️ Content', color: '#f5d76e' },
  { name: 'social', label: '📸 Social',  color: '#e040fb' },
  { name: 'code',   label: '💻 Code',    color: '#50fa7b' },
];

interface CriterionResult {
  label: string;
  pass: boolean;
  reason: string;
}

interface CaseState {
  status: 'pending' | 'generating' | 'judging' | 'done' | 'error';
  description?: string;
  scorePct?: number;
  criteria?: CriterionResult[];
  response?: string;
  error?: string;
}

interface HistoryRun {
  run_id: string;
  skill_name: string;
  skill_version: string;
  model: string;
  provider: string;
  overall_pct: string;
  case_count: string;
  created_at: string;
}

interface ProposedChange {
  old: string;
  new: string;
  rationale: string;
  approved: boolean;
}

type ImprovementPhase = 'idle' | 'analyzing' | 'proposed' | 'applying' | 'applied';

function scoreColor(pct: number): string {
  if (pct >= 80) return '#50fa7b';
  if (pct >= 50) return '#f1fa8c';
  return '#ff5555';
}

function ScoreBar({ pct, width = 20 }: { pct: number; width?: number }) {
  const color  = scoreColor(pct);
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  return (
    <span style={{ color, ...MONO, fontSize: '11px' }}>
      {'█'.repeat(filled)}{'░'.repeat(empty)} {pct}%
    </span>
  );
}

interface SkillEvalPanelProps {
  userId?: string;
  MODELS: Model[];
  selectedModel: string;
}

export default function SkillEvalPanel({ userId, MODELS, selectedModel }: SkillEvalPanelProps) {
  const [evalSkill,   setEvalSkill]   = useState(EVAL_SKILLS[0].name);
  const [evalModel,   setEvalModel]   = useState(selectedModel);
  const [isRunning,   setIsRunning]   = useState(false);
  const [cases,       setCases]       = useState<Record<string, CaseState>>({});
  const [overallPct,  setOverallPct]  = useState<number | null>(null);
  const [runId,       setRunId]       = useState<string | null>(null);
  const [history,     setHistory]     = useState<HistoryRun[]>([]);

  // Improvement flow
  const [improvePhase,   setImprovePhase]   = useState<ImprovementPhase>('idle');
  const [improveAnalysis, setImproveAnalysis] = useState('');
  const [proposedChanges, setProposedChanges] = useState<ProposedChange[]>([]);
  const [appliedCount,    setAppliedCount]    = useState(0);

  useEffect(() => { setEvalModel(selectedModel); }, [selectedModel]);
  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/skill-eval?limit=10');
      if (res.ok) setHistory(await res.json());
    } catch { /* ignore */ }
  };

  const resetImprovementFlow = () => {
    setImprovePhase('idle');
    setImproveAnalysis('');
    setProposedChanges([]);
    setAppliedCount(0);
  };

  const currentModel = MODELS.find(m => m.id === evalModel);
  const skillConfig  = EVAL_SKILLS.find(s => s.name === evalSkill)!;

  // ── Run evals ────────────────────────────────────────────────────────────────

  const runEval = async () => {
    if (isRunning || !currentModel) return;
    setCases({});
    setOverallPct(null);
    setRunId(null);
    resetImprovementFlow();
    setIsRunning(true);

    try {
      const res = await fetch('/api/skill-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: evalSkill, model: evalModel, provider: currentModel.provider }),
      });
      if (!res.ok || !res.body) throw new Error('Failed to start eval');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }

          if (evt.type === 'case_start') {
            setCases(prev => ({ ...prev, [evt.caseId]: { status: 'generating', description: evt.description } }));
          } else if (evt.type === 'generating') {
            setCases(prev => ({ ...prev, [evt.caseId]: { ...prev[evt.caseId], status: 'generating' } }));
          } else if (evt.type === 'judging') {
            setCases(prev => ({ ...prev, [evt.caseId]: { ...prev[evt.caseId], status: 'judging' } }));
          } else if (evt.type === 'case_done') {
            setCases(prev => ({
              ...prev,
              [evt.caseId]: { status: 'done', description: prev[evt.caseId]?.description, scorePct: evt.scorePct, criteria: evt.criteria, response: evt.response },
            }));
          } else if (evt.type === 'case_error') {
            setCases(prev => ({ ...prev, [evt.caseId]: { ...prev[evt.caseId], status: 'error', error: evt.message } }));
          } else if (evt.type === 'done') {
            setOverallPct(evt.overallPct);
            setRunId(evt.runId);
            await loadHistory();
          } else if (evt.type === 'error') {
            console.error('[SkillEval]', evt.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[SkillEval]', err);
    } finally {
      setIsRunning(false);
    }
  };

  // ── Suggest improvements ─────────────────────────────────────────────────────

  const suggestImprovements = async () => {
    if (!runId || improvePhase !== 'idle') return;
    setImprovePhase('analyzing');
    setImproveAnalysis('');
    setProposedChanges([]);

    try {
      const res = await fetch('/api/skill-eval/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: evalSkill, runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Improve request failed');

      setImproveAnalysis(data.analysis ?? '');
      setProposedChanges((data.changes ?? []).map((c: any) => ({ ...c, approved: true })));
      setImprovePhase('proposed');
    } catch (err: any) {
      console.error('[SkillImprove]', err);
      setImproveAnalysis(`Error: ${err.message}`);
      setImprovePhase('proposed');
    }
  };

  // ── Apply approved changes ────────────────────────────────────────────────────

  const applyChanges = async () => {
    const approved = proposedChanges.filter(c => c.approved);
    if (approved.length === 0 || improvePhase !== 'proposed') return;
    setImprovePhase('applying');

    try {
      const res = await fetch('/api/skill-eval/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: evalSkill, changes: approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Apply request failed');

      setAppliedCount(data.applied ?? approved.length);
      setImprovePhase('applied');
    } catch (err: any) {
      console.error('[SkillApply]', err);
      setImproveAnalysis(`Apply error: ${err.message}`);
      setImprovePhase('proposed');
    }
  };

  const clearHistory = async () => {
    await fetch('/api/skill-eval', { method: 'DELETE' });
    setHistory([]);
    setCases({});
    setOverallPct(null);
    setRunId(null);
    resetImprovementFlow();
  };

  const hasCases  = Object.keys(cases).length > 0;
  const hasScore  = overallPct !== null && !isRunning;
  const needsFix  = hasScore && overallPct! < 100;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...MONO, padding: '16px', color: '#b0bec5', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Title */}
      <div style={{ color: '#8be9fd', fontSize: '11px', letterSpacing: '0.1em' }}>
        ▸ SKILL QUALITY EVALUATOR — CI/CD FOR SKILLS
      </div>

      {/* Config row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
        <div>
          <div style={{ color: '#555', fontSize: '10px', marginBottom: '4px' }}>SKILL</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {EVAL_SKILLS.map(s => (
              <button
                key={s.name}
                onClick={() => { setEvalSkill(s.name); setCases({}); setOverallPct(null); setRunId(null); resetImprovementFlow(); }}
                disabled={isRunning}
                style={{ ...MONO, padding: '4px 10px', fontSize: '11px', cursor: isRunning ? 'not-allowed' : 'pointer',
                  background: evalSkill === s.name ? '#1a1a2e' : 'transparent',
                  border: `1px solid ${evalSkill === s.name ? s.color : '#333'}`,
                  color: evalSkill === s.name ? s.color : '#555', borderRadius: '3px', transition: 'all 0.1s' }}
              >{s.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ color: '#555', fontSize: '10px', marginBottom: '4px' }}>MODEL</div>
          <select
            value={evalModel}
            onChange={e => setEvalModel(e.target.value)}
            disabled={isRunning}
            style={{ ...MONO, background: '#111', border: '1px solid #333', color: '#b0bec5', padding: '4px 8px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer' }}
          >
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
          </select>
        </div>

        <button
          onClick={improvePhase === 'applied' ? () => { resetImprovementFlow(); runEval(); } : runEval}
          disabled={isRunning}
          style={{ ...MONO, padding: '5px 16px', fontSize: '11px', cursor: isRunning ? 'not-allowed' : 'pointer',
            background: isRunning ? '#1a1a2e' : '#0a2e0a',
            border: `1px solid ${isRunning ? '#333' : '#50fa7b'}`,
            color: isRunning ? '#555' : '#50fa7b', borderRadius: '3px', transition: 'all 0.1s' }}
        >
          {isRunning ? '⟳ RUNNING...' : improvePhase === 'applied' ? '▶ RE-RUN EVALS' : '▶ RUN EVALS'}
        </button>
      </div>

      {/* Overall score */}
      {hasScore && (
        <div style={{ padding: '10px 14px', border: `1px solid ${scoreColor(overallPct!)}`, borderRadius: '3px', background: '#111' }}>
          <div style={{ color: '#555', fontSize: '10px', marginBottom: '6px' }}>OVERALL — {skillConfig.label}</div>
          <ScoreBar pct={overallPct!} />
          <div style={{ color: '#555', fontSize: '10px', marginTop: '4px' }}>
            {overallPct! >= 80 ? '✓ skill is performing well'
              : overallPct! >= 50 ? '⚠ skill needs improvement'
              : '✗ skill needs significant work'}
          </div>
        </div>
      )}

      {/* Case results */}
      {hasCases && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '0.05em' }}>TEST CASES</div>
          {Object.entries(cases).map(([caseId, state]) => (
            <div key={caseId} style={{ border: '1px solid #222', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#111', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#555', fontSize: '10px', minWidth: '60px' }}>{caseId.replace(/_/g, '-')}</span>
                <span style={{ color: '#8be9fd', fontSize: '11px', flex: 1 }}>{state.description}</span>
                <span style={{ fontSize: '10px' }}>
                  {state.status === 'generating' && <span style={{ color: '#f1fa8c' }}>⟳ generating...</span>}
                  {state.status === 'judging'    && <span style={{ color: '#bd93f9' }}>⟳ judging...</span>}
                  {state.status === 'done'       && state.scorePct !== undefined && <ScoreBar pct={state.scorePct} width={15} />}
                  {state.status === 'error'      && <span style={{ color: '#ff5555' }}>✗ error</span>}
                </span>
              </div>
              {state.status === 'done' && state.criteria && (
                <div style={{ padding: '8px 12px', background: '#0d0d0d', borderTop: '1px solid #1a1a1a' }}>
                  {state.criteria.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '11px', lineHeight: 1.5 }}>
                      <span style={{ color: c.pass ? '#50fa7b' : '#ff5555', flexShrink: 0 }}>{c.pass ? '✓' : '✗'}</span>
                      <span style={{ color: '#666', flex: 1 }}>{c.label}</span>
                      <span style={{ color: '#444', fontSize: '10px', maxWidth: '180px', textAlign: 'right' }}>{c.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {state.status === 'error' && (
                <div style={{ padding: '8px 12px', background: '#0d0d0d', color: '#ff5555', fontSize: '11px', borderTop: '1px solid #1a1a1a' }}>
                  {state.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Self-improvement section ── */}
      {needsFix && improvePhase === 'idle' && (
        <button
          onClick={suggestImprovements}
          style={{ ...MONO, padding: '8px 16px', fontSize: '11px', cursor: 'pointer',
            background: '#1a0a2e', border: '1px solid #bd93f9', color: '#bd93f9',
            borderRadius: '3px', textAlign: 'left', transition: 'all 0.1s' }}
        >
          ✦ SUGGEST IMPROVEMENTS — let AI analyze failures and propose fixes
        </button>
      )}

      {improvePhase === 'analyzing' && (
        <div style={{ padding: '12px 14px', border: '1px solid #333', borderRadius: '3px', background: '#111' }}>
          <span style={{ color: '#bd93f9', fontSize: '11px' }}>⟳ analyzing failures and generating improvement proposals...</span>
        </div>
      )}

      {(improvePhase === 'proposed' || improvePhase === 'applying') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Analysis */}
          {improveAnalysis && (
            <div style={{ padding: '10px 14px', border: '1px solid #444', borderRadius: '3px', background: '#111' }}>
              <div style={{ color: '#555', fontSize: '10px', marginBottom: '6px' }}>ANALYSIS</div>
              <div style={{ color: '#f1fa8c', fontSize: '11px', lineHeight: 1.6 }}>{improveAnalysis}</div>
            </div>
          )}

          {/* Proposed changes */}
          {proposedChanges.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: '#555', fontSize: '10px', letterSpacing: '0.05em' }}>
                PROPOSED CHANGES — {proposedChanges.filter(c => c.approved).length}/{proposedChanges.length} approved
              </div>
              {proposedChanges.map((change, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${change.approved ? '#444' : '#222'}`,
                    borderRadius: '3px',
                    overflow: 'hidden',
                    opacity: change.approved ? 1 : 0.4,
                    transition: 'all 0.1s',
                  }}
                >
                  {/* Change header */}
                  <div style={{ padding: '6px 10px', background: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => setProposedChanges(prev => prev.map((c, j) => j === i ? { ...c, approved: !c.approved } : c))}
                      disabled={improvePhase === 'applying'}
                      style={{ ...MONO, padding: '2px 8px', fontSize: '10px', cursor: 'pointer',
                        background: change.approved ? '#0a2e0a' : '#1a1a1a',
                        border: `1px solid ${change.approved ? '#50fa7b' : '#333'}`,
                        color: change.approved ? '#50fa7b' : '#555', borderRadius: '2px' }}
                    >
                      {change.approved ? '✓ approved' : '○ skipped'}
                    </button>
                    <span style={{ color: '#666', fontSize: '10px', flex: 1 }}>{change.rationale}</span>
                  </div>

                  {/* Diff */}
                  <div style={{ borderTop: '1px solid #1a1a1a' }}>
                    {change.old && (
                      <div style={{ padding: '6px 10px', background: '#1a0000', borderBottom: '1px solid #1a1a1a' }}>
                        <div style={{ color: '#555', fontSize: '9px', marginBottom: '3px' }}>REMOVE</div>
                        <pre style={{ margin: 0, color: '#ff5555', fontSize: '10px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {change.old}
                        </pre>
                      </div>
                    )}
                    <div style={{ padding: '6px 10px', background: '#001a00' }}>
                      <div style={{ color: '#555', fontSize: '9px', marginBottom: '3px' }}>ADD</div>
                      <pre style={{ margin: 0, color: '#50fa7b', fontSize: '10px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {change.new}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Apply button */}
          {proposedChanges.filter(c => c.approved).length > 0 && (
            <button
              onClick={applyChanges}
              disabled={improvePhase === 'applying'}
              style={{ ...MONO, padding: '8px 16px', fontSize: '11px',
                cursor: improvePhase === 'applying' ? 'not-allowed' : 'pointer',
                background: improvePhase === 'applying' ? '#1a1a2e' : '#0a1a2e',
                border: `1px solid ${improvePhase === 'applying' ? '#333' : '#8be9fd'}`,
                color: improvePhase === 'applying' ? '#555' : '#8be9fd',
                borderRadius: '3px', transition: 'all 0.1s' }}
            >
              {improvePhase === 'applying'
                ? '⟳ APPLYING CHANGES...'
                : `⬆ APPLY ${proposedChanges.filter(c => c.approved).length} APPROVED CHANGE(S)`}
            </button>
          )}
        </div>
      )}

      {improvePhase === 'applied' && (
        <div style={{ padding: '12px 14px', border: '1px solid #50fa7b', borderRadius: '3px', background: '#001a00' }}>
          <div style={{ color: '#50fa7b', fontSize: '11px', marginBottom: '4px' }}>
            ✓ SKILL UPDATED — {appliedCount} change(s) applied
          </div>
          <div style={{ color: '#555', fontSize: '10px', lineHeight: 1.6 }}>
            Skill is live immediately. Click RE-RUN EVALS above to measure the improvement.
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ color: '#555', fontSize: '10px', letterSpacing: '0.05em' }}>EVAL HISTORY</span>
          {history.length > 0 && (
            <button onClick={clearHistory} style={{ ...MONO, background: 'transparent', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '10px', padding: 0 }}>
              [clear]
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div style={{ color: '#333', fontSize: '11px' }}>no eval runs yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {history.map(run => {
              const pct   = Math.round(Number(run.overall_pct));
              const skill = EVAL_SKILLS.find(s => s.name === run.skill_name);
              const date  = new Date(run.created_at);
              return (
                <div key={run.run_id} style={{ padding: '6px 10px', border: '1px solid #1a1a1a', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                  <span style={{ color: skill?.color ?? '#8be9fd', minWidth: '70px' }}>{skill?.label ?? run.skill_name}</span>
                  <ScoreBar pct={pct} width={15} />
                  <span style={{ color: '#444', marginLeft: 'auto', fontSize: '10px' }}>
                    {run.model} · {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
