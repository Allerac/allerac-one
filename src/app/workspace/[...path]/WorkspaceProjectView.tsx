'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FileTree from '@/app/components/workspace/FileTree';
import FileViewer from '@/app/components/workspace/FileViewer';

interface Props { path: string[]; userId: string }

interface TerminalEntry {
  type: 'cmd' | 'out' | 'err' | 'info';
  text: string;
}

interface ProcessInfo {
  pid: number;
  command: string;
  cwd: string;
  port?: number;
}

export default function WorkspaceProjectView({ path, userId }: Props) {
  const projectName = path[0] || '';
  const rootPath = `/workspace/projects/${userId}/${path.join('/')}`;

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTab, setTerminalTab] = useState<'shell' | 'jobs'>('shell');
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [isResizingTerm, setIsResizingTerm] = useState(false);
  const [terminalCmd, setTerminalCmd] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<TerminalEntry[]>([
    { type: 'info', text: `cwd: ${rootPath}` },
  ]);
  const [running, setRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);

  // Jobs state
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const processesIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem('chatTheme');
    if (saved) { setIsDarkMode(saved === 'dark'); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    setSidebarOpen(window.innerWidth < 1024);
  }, []);

  // Drag-to-resize sidebar
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => setSidebarWidth(Math.max(180, Math.min(520, e.clientX)));
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizing]);

  // Drag-to-resize terminal
  useEffect(() => {
    if (!isResizingTerm) return;
    const onMove = (e: MouseEvent) => setTerminalHeight(Math.max(100, Math.min(600, window.innerHeight - e.clientY)));
    const onUp = () => setIsResizingTerm(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizingTerm]);

  // Auto-scroll terminal output
  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  // Focus input when terminal opens
  useEffect(() => {
    if (terminalOpen && terminalTab === 'shell') {
      setTimeout(() => terminalInputRef.current?.focus(), 80);
    }
  }, [terminalOpen, terminalTab]);

  const fetchProcesses = useCallback(async () => {
    setLoadingProcesses(true);
    try {
      const res = await fetch('/api/workspace/processes');
      const data = await res.json();
      setProcesses(data.processes || []);
    } catch {
      setProcesses([]);
    } finally {
      setLoadingProcesses(false);
    }
  }, []);

  // Poll processes when jobs tab is open
  useEffect(() => {
    if (terminalOpen && terminalTab === 'jobs') {
      fetchProcesses();
      processesIntervalRef.current = setInterval(fetchProcesses, 3000);
    } else {
      if (processesIntervalRef.current) {
        clearInterval(processesIntervalRef.current);
        processesIntervalRef.current = null;
      }
    }
    return () => {
      if (processesIntervalRef.current) clearInterval(processesIntervalRef.current);
    };
  }, [terminalOpen, terminalTab, fetchProcesses]);

  const killProcess = async (pid: number) => {
    setKillingPid(pid);
    try {
      await fetch('/api/workspace/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      await fetchProcesses();
    } finally {
      setKillingPid(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/workspace/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/workspace/projects/${userId}/${projectName}` }),
      });
      if (res.ok) router.push('/workspace');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleFileSelect = (file: string) => {
    setSelectedFile(file);
    setSidebarOpen(false);
  };

  const runCommand = async () => {
    const cmd = terminalCmd.trim();
    if (!cmd || running) return;
    setTerminalCmd('');
    setCmdHistoryIdx(-1);
    if (cmd === 'clear') {
      setTerminalHistory([{ type: 'info', text: `cwd: ${rootPath}` }]);
      return;
    }
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
          const pid = data.stdout?.trim();
          lines.push({ type: 'info', text: `[background] PID ${pid} · logs em /tmp/allerac-bg-*.log` });
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
      // Refresh jobs after a command (might have started a background process)
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

  const d = isDarkMode;
  const borderColor = d ? 'border-gray-800' : 'border-gray-200';

  return (
    <div className={`flex flex-col h-dvh ${d ? 'bg-gray-950 text-gray-100' : 'bg-white text-gray-900'}`}>
      {/* Top bar */}
      <header className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${d ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className={`lg:hidden shrink-0 p-1.5 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200'}`}
            title="Toggle file tree"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/workspace" className={`shrink-0 transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className={`text-xs hidden sm:inline ${d ? 'text-gray-500' : 'text-gray-400'}`}>/workspace/projects/</span>
          <span className="font-semibold text-sm truncate">{projectName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Terminal toggle */}
          <button
            onClick={() => setTerminalOpen(o => !o)}
            title="Terminal"
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
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

          {confirmDelete ? (
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${d ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>
              <span>Deletar pasta?</span>
              <button onClick={handleDelete} disabled={deleting} className="px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 text-xs">
                {deleting ? '...' : 'Sim'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className={`px-2 py-0.5 rounded text-xs transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                Não
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className={`p-1.5 rounded-lg border transition-colors ${d ? 'border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-800 hover:bg-red-950/30' : 'border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50'}`}
              title="Deletar pasta"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <Link href="/" className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${d ? 'border-indigo-800 text-indigo-400 hover:bg-indigo-900/40' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'}`}>
            ← Chat
          </Link>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden relative flex-col">
        <div className="flex flex-1 overflow-hidden relative">
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          {/* File tree sidebar */}
          <div
            className={`flex flex-col border-r shrink-0 overflow-hidden ${borderColor} ${d ? 'bg-gray-900/90' : 'bg-gray-50'} fixed inset-y-0 left-0 z-30 transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-auto lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            style={{ width: sidebarWidth }}
          >
            <div className={`flex items-center justify-between px-3 py-2 border-b shrink-0 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
              <span className={`text-xs font-medium ${d ? 'text-gray-500' : 'text-gray-400'}`}>FILES</span>
              <button onClick={() => setSidebarOpen(false)} className={`lg:hidden p-1 rounded transition-colors ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-700'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FileTree rootPath={rootPath} selectedPath={selectedFile} onFileSelect={handleFileSelect} isDarkMode={isDarkMode} />
            </div>
          </div>

          {/* Resize handle — desktop only */}
          <div
            className={`hidden lg:block w-1 shrink-0 cursor-col-resize transition-colors ${d ? 'hover:bg-indigo-600' : 'hover:bg-indigo-400'}`}
            onMouseDown={() => setIsResizing(true)}
          />

          {/* File viewer */}
          <div className={`flex-1 overflow-hidden ${d ? 'bg-gray-950' : 'bg-white'}`}>
            <FileViewer filePath={selectedFile} isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* Terminal panel */}
        {terminalOpen && (
          <>
            <div className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-indigo-500 transition-colors" onMouseDown={() => setIsResizingTerm(true)} />
            <div className="flex flex-col shrink-0 bg-gray-950 border-t border-gray-800" style={{ height: terminalHeight }}>

              {/* Terminal tabs + actions */}
              <div className="flex items-center justify-between border-b border-gray-800 shrink-0 px-2">
                <div className="flex">
                  {(['shell', 'jobs'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setTerminalTab(tab)}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                        terminalTab === tab
                          ? 'border-emerald-500 text-emerald-400'
                          : 'border-transparent text-gray-500 hover:text-gray-300'
                      }`}
                    >
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
                    <button onClick={() => setTerminalHistory([{ type: 'info', text: `cwd: ${rootPath}` }])} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded">
                      clear
                    </button>
                  )}
                  {terminalTab === 'jobs' && (
                    <button onClick={fetchProcesses} disabled={loadingProcesses} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded disabled:opacity-40">
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
                        entry.type === 'cmd' ? 'text-emerald-400' :
                        entry.type === 'err' ? 'text-red-400' :
                        entry.type === 'info' ? 'text-gray-500' :
                        'text-gray-200'
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
                    <button
                      onClick={runCommand}
                      disabled={!terminalCmd.trim() || running}
                      className="shrink-0 text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
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
                              {p.port ? (
                                <span className="text-emerald-400">:{p.port}</span>
                              ) : (
                                <span className="text-gray-700">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => killProcess(p.pid)}
                                disabled={killingPid === p.pid}
                                className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-500 hover:bg-red-950/40 transition-colors disabled:opacity-40"
                              >
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
    </div>
  );
}
