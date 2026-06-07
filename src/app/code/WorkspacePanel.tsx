'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import FileTree from '@/app/components/workspace/FileTree';
import FileViewer from '@/app/components/workspace/FileViewer';

interface Project { name: string; path: string; fileCount: number }

interface TerminalEntry { type: 'cmd' | 'out' | 'err' | 'info'; text: string }
interface ProcessInfo { pid: number; command: string; cwd: string; port?: number }

interface WorkspaceLabel { project: string; file?: string }

interface Props {
  userId: string;
  isDarkMode: boolean;
  onContextChange: (context: string, label: WorkspaceLabel | null) => void;
  fileRefreshTrigger?: number;
}

export default function WorkspacePanel({ userId, isDarkMode, onContextChange, fileRefreshTrigger }: Props) {
  const [projects, setProjects]               = useState<Project[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile]       = useState<string | null>(null);

  // Terminal
  const [terminalOpen, setTerminalOpen]           = useState(false);
  const [terminalTab, setTerminalTab]             = useState<'shell' | 'jobs'>('shell');
  const [terminalHeight, setTerminalHeight]       = useState(220);
  const [isResizingTerm, setIsResizingTerm]       = useState(false);
  const [terminalCmd, setTerminalCmd]             = useState('');
  const [terminalHistory, setTerminalHistory]     = useState<TerminalEntry[]>([]);
  const [running, setRunning]                     = useState(false);
  const [cmdHistory, setCmdHistory]               = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx]         = useState(-1);
  const [processes, setProcesses]                 = useState<ProcessInfo[]>([]);
  const [loadingProcesses, setLoadingProcesses]   = useState(false);
  const [killingPid, setKillingPid]               = useState<number | null>(null);

  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const terminalInputRef  = useRef<HTMLInputElement>(null);
  const processesIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const d = isDarkMode;

  // ── Refresh selected file after an accepted edit ─────────────────────────────
  useEffect(() => {
    if (!fileRefreshTrigger || !selectedFile || !selectedProject) return;
    selectFile(selectedFile, selectedProject);
  }, [fileRefreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Projects ────────────────────────────────────────────────────────────────

  const fetchProjects = useCallback(() => {
    setLoading(true);
    fetch('/api/workspace/projects')
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const selectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setSelectedFile(null);
    setTerminalHistory([{ type: 'info', text: `cwd: ${project.path}` }]);
    onContextChange(
      `## Workspace context\nProject: ${project.name} (${project.path})\nNo file selected yet.`,
      { project: project.name },
    );
  }, [onContextChange]);

  const selectFile = useCallback(async (filePath: string, project: Project) => {
    setSelectedFile(filePath);
    const relPath = filePath.replace(project.path + '/', '');

    let fileContent = '';
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.content) {
        const MAX_CHARS = 8000;
        fileContent = data.content.length > MAX_CHARS
          ? data.content.slice(0, MAX_CHARS) + `\n\n... (truncated — ${data.content.length} chars total)`
          : data.content;
      }
    } catch { /* ignore — context will just show the path */ }

    const context = fileContent
      ? `## Workspace context\nProject: ${project.name} (${project.path})\nSelected file: ${relPath}\n\n\`\`\`\n${fileContent}\n\`\`\``
      : `## Workspace context\nProject: ${project.name} (${project.path})\nSelected file: ${relPath}\nFull path: ${filePath}`;

    onContextChange(context, { project: project.name, file: relPath });
  }, [onContextChange]);

  const clearProject = useCallback(() => {
    setSelectedProject(null);
    setSelectedFile(null);
    setTerminalOpen(false);
    onContextChange('', null);
  }, [onContextChange]);

  // ── Terminal resize ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isResizingTerm) return;
    const onMove = (e: MouseEvent) =>
      setTerminalHeight(Math.max(100, Math.min(600, window.innerHeight - e.clientY)));
    const onUp = () => setIsResizingTerm(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizingTerm]);

  useEffect(() => {
    if (terminalOutputRef.current)
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
  }, [terminalHistory]);

  useEffect(() => {
    if (terminalOpen && terminalTab === 'shell')
      setTimeout(() => terminalInputRef.current?.focus(), 80);
  }, [terminalOpen, terminalTab]);

  // ── Jobs ────────────────────────────────────────────────────────────────────

  const fetchProcesses = useCallback(async () => {
    setLoadingProcesses(true);
    try {
      const res = await fetch('/api/workspace/processes');
      const data = await res.json();
      setProcesses(data.processes || []);
    } catch { setProcesses([]); }
    finally { setLoadingProcesses(false); }
  }, []);

  useEffect(() => {
    if (terminalOpen && terminalTab === 'jobs') {
      fetchProcesses();
      processesIntervalRef.current = setInterval(fetchProcesses, 3000);
    } else {
      if (processesIntervalRef.current) { clearInterval(processesIntervalRef.current); processesIntervalRef.current = null; }
    }
    return () => { if (processesIntervalRef.current) clearInterval(processesIntervalRef.current); };
  }, [terminalOpen, terminalTab, fetchProcesses]);

  const killProcess = async (pid: number) => {
    setKillingPid(pid);
    try {
      await fetch('/api/workspace/kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }) });
      await fetchProcesses();
    } finally { setKillingPid(null); }
  };

  // ── Shell command ────────────────────────────────────────────────────────────

  const rootPath = selectedProject?.path ?? '';

  const runCommand = async () => {
    const cmd = terminalCmd.trim();
    if (!cmd || running) return;
    setTerminalCmd(''); setCmdHistoryIdx(-1);
    if (cmd === 'clear') { setTerminalHistory([{ type: 'info', text: `cwd: ${rootPath}` }]); return; }
    setCmdHistory(h => [cmd, ...h.slice(0, 49)]);
    setTerminalHistory(h => [...h, { type: 'cmd', text: `$ ${cmd}` }]);
    setRunning(true);
    try {
      const res = await fetch('/api/workspace/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, cwd: rootPath }),
      });
      const data = await res.json();
      if (data.error) {
        setTerminalHistory(h => [...h, { type: 'err', text: data.error }]);
      } else {
        const lines: TerminalEntry[] = [];
        if (data.background) {
          lines.push({ type: 'info', text: `[background] PID ${data.stdout?.trim()} · logs em /tmp/allerac-bg-*.log` });
        } else {
          if (data.stdout) lines.push({ type: 'out', text: data.stdout });
          if (data.stderr) lines.push({ type: 'err', text: data.stderr });
          if (!data.stdout && !data.stderr) lines.push({ type: 'info', text: `(exit ${data.exitCode}, ${data.duration_ms}ms)` });
          else lines.push({ type: 'info', text: `exit ${data.exitCode} · ${data.duration_ms}ms` });
        }
        setTerminalHistory(h => [...h, ...lines]);
      }
    } catch (e: any) {
      setTerminalHistory(h => [...h, { type: 'err', text: e.message }]);
    } finally {
      setRunning(false);
      if (terminalTab === 'jobs') fetchProcesses();
      setTimeout(() => terminalInputRef.current?.focus(), 50);
    }
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { runCommand(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(cmdHistoryIdx + 1, cmdHistory.length - 1);
      setCmdHistoryIdx(idx);
      if (cmdHistory[idx] !== undefined) setTerminalCmd(cmdHistory[idx]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = cmdHistoryIdx - 1;
      setCmdHistoryIdx(idx);
      setTerminalCmd(idx < 0 ? '' : (cmdHistory[idx] ?? ''));
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setTerminalHistory([{ type: 'info', text: `cwd: ${rootPath}` }]);
    }
  };

  // ── Projects list view ───────────────────────────────────────────────────────

  if (!selectedProject) {
    return (
      <div className={`flex flex-col h-full ${d ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`flex items-center justify-between px-4 h-11 border-b shrink-0 ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          <span className={`text-xs font-semibold uppercase tracking-wider ${d ? 'text-gray-500' : 'text-gray-400'}`}>Workspace</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${d ? 'text-gray-600' : 'text-gray-400'}`}>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            <button onClick={fetchProjects} title="Refresh"
              className={`p-1 rounded transition-colors ${d ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`h-20 rounded-xl animate-pulse ${d ? 'bg-gray-800' : 'bg-gray-200'}`} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
              <span className="text-5xl opacity-30">📂</span>
              <p className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-500'}`}>No projects yet.</p>
              <p className={`text-xs ${d ? 'text-gray-600' : 'text-gray-400'}`}>Ask the AI to create a project — it will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map(p => (
                <button key={p.name} onClick={() => selectProject(p)}
                  className={`group text-left p-4 rounded-xl border transition-all ${
                    d ? 'border-gray-700 hover:border-indigo-700 bg-gray-800/50 hover:bg-indigo-950/30'
                      : 'border-gray-200 hover:border-indigo-400 bg-white hover:bg-indigo-50'
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">📁</span>
                      <span className={`font-medium text-sm truncate transition-colors ${d ? 'text-gray-200 group-hover:text-indigo-300' : 'text-gray-800 group-hover:text-indigo-600'}`}>
                        {p.name}
                      </span>
                    </div>
                    <svg className={`w-4 h-4 shrink-0 transition-colors ${d ? 'text-gray-600 group-hover:text-indigo-400' : 'text-gray-400 group-hover:text-indigo-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className={`mt-2 text-xs transition-colors ${d ? 'text-gray-600 group-hover:text-gray-500' : 'text-gray-400 group-hover:text-gray-600'}`}>
                    {p.fileCount} file{p.fileCount !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Project view (file tree + viewer + terminal) ─────────────────────────────

  return (
    <div className={`flex flex-col h-full ${d ? 'bg-gray-950' : 'bg-white'}`}>

      {/* Project header */}
      <div className={`flex items-center gap-2 px-3 h-11 border-b shrink-0 ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
        <button onClick={clearProject} title="Back to projects"
          className={`p-1 rounded transition-colors ${d ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-lg shrink-0">📁</span>
        <span className={`font-medium text-sm truncate flex-1 ${d ? 'text-gray-200' : 'text-gray-800'}`}>{selectedProject.name}</span>
        {selectedFile && (
          <span className={`text-xs truncate max-w-[40%] ${d ? 'text-gray-500' : 'text-gray-400'}`}>
            {selectedFile.replace(selectedProject.path + '/', '')}
          </span>
        )}
        {/* Terminal toggle */}
        <button
          onClick={() => setTerminalOpen(o => !o)}
          title="Terminal"
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ml-1 ${
            terminalOpen
              ? d ? 'border-emerald-700 text-emerald-400 bg-emerald-950/40' : 'border-emerald-400 text-emerald-600 bg-emerald-50'
              : d ? 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600' : 'border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="hidden sm:inline">Terminal</span>
        </button>
      </div>

      {/* File tree + viewer */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedFile ? 'hidden lg:flex' : 'flex flex-1'} lg:flex-none lg:w-52 shrink-0 border-r overflow-y-auto ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <FileTree
            rootPath={selectedProject.path}
            selectedPath={selectedFile}
            onFileSelect={fp => selectFile(fp, selectedProject)}
            isDarkMode={d}
          />
        </div>
        <div className={`${selectedFile ? 'flex flex-1' : 'hidden lg:flex lg:flex-1'} flex-col overflow-hidden`}>
          {selectedFile && (
            <div className={`lg:hidden flex items-center gap-2 px-3 h-10 border-b shrink-0 ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
              <button onClick={() => setSelectedFile(null)}
                className={`flex items-center gap-1.5 text-sm ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Files
              </button>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <FileViewer
              key={selectedFile ? `${selectedFile}-${fileRefreshTrigger ?? 0}` : 'empty'}
              filePath={selectedFile}
              isDarkMode={d}
            />
          </div>
        </div>
      </div>

      {/* Terminal panel */}
      {terminalOpen && (
        <>
          <div className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-indigo-500 transition-colors"
            onMouseDown={() => setIsResizingTerm(true)} />
          <div className="flex flex-col shrink-0 bg-gray-950 border-t border-gray-800" style={{ height: terminalHeight }}>

            {/* Terminal tabs + actions */}
            <div className="flex items-center justify-between border-b border-gray-800 shrink-0 px-2">
              <div className="flex">
                {(['shell', 'jobs'] as const).map(tab => (
                  <button key={tab} onClick={() => setTerminalTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      terminalTab === tab ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}>
                    {tab === 'shell' ? 'Terminal' : (
                      <span className="flex items-center gap-1.5">
                        Jobs
                        {processes.length > 0 && (
                          <span className="bg-emerald-700 text-emerald-200 text-xs rounded-full px-1.5 py-0 leading-4">{processes.length}</span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {terminalTab === 'shell' && (
                  <button onClick={() => setTerminalHistory([{ type: 'info', text: `cwd: ${rootPath}` }])}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded">
                    clear
                  </button>
                )}
                {terminalTab === 'jobs' && (
                  <button onClick={fetchProcesses} disabled={loadingProcesses}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded disabled:opacity-40">
                    ↻ refresh
                  </button>
                )}
                <button onClick={() => setTerminalOpen(false)} className="text-gray-500 hover:text-gray-300 transition-colors p-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Shell tab */}
            {terminalTab === 'shell' && (
              <>
                <div ref={terminalOutputRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5">
                  {terminalHistory.map((entry, i) => (
                    <pre key={i} className={`whitespace-pre-wrap break-all leading-relaxed ${
                      entry.type === 'cmd'  ? 'text-emerald-400' :
                      entry.type === 'err'  ? 'text-red-400' :
                      entry.type === 'info' ? 'text-gray-500' : 'text-gray-200'
                    }`}>{entry.text}</pre>
                  ))}
                  {running && (
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      <span>running…</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-800 shrink-0">
                  <span className="text-emerald-400 font-mono text-xs shrink-0">$</span>
                  <input
                    ref={terminalInputRef}
                    type="text"
                    value={terminalCmd}
                    onChange={e => { setTerminalCmd(e.target.value); setCmdHistoryIdx(-1); }}
                    onKeyDown={handleTerminalKeyDown}
                    disabled={running}
                    placeholder="node index.js"
                    className="flex-1 bg-transparent font-mono text-xs text-gray-100 outline-none placeholder-gray-600 disabled:opacity-50"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button onClick={runCommand} disabled={!terminalCmd.trim() || running}
                    className="shrink-0 text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Run
                  </button>
                </div>
              </>
            )}

            {/* Jobs tab */}
            {terminalTab === 'jobs' && (
              <div className="flex-1 overflow-y-auto">
                {loadingProcesses && processes.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-600 text-xs gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    carregando…
                  </div>
                ) : processes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 text-xs gap-1">
                    <span>Nenhum processo rodando</span>
                    <span className="text-gray-700">Use <code className="text-gray-500">node app.js &</code> para rodar em background</span>
                  </div>
                ) : (
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500">
                        <th className="text-left px-3 py-1.5 font-normal">PID</th>
                        <th className="text-left px-3 py-1.5 font-normal">COMANDO</th>
                        <th className="text-left px-3 py-1.5 font-normal">PORTA</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {processes.map(p => (
                        <tr key={p.pid} className="border-b border-gray-900 hover:bg-gray-900/50">
                          <td className="px-3 py-2 text-gray-500">{p.pid}</td>
                          <td className="px-3 py-2 text-gray-200 max-w-xs truncate">{p.command}</td>
                          <td className="px-3 py-2">
                            {p.port ? <span className="text-emerald-400">:{p.port}</span> : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => killProcess(p.pid)} disabled={killingPid === p.pid}
                              className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-500 hover:bg-red-950/40 transition-colors disabled:opacity-40">
                              {killingPid === p.pid ? '…' : 'Kill'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
