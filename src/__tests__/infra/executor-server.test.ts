/** @jest-environment node */

// Spawns the real infra/executor/server.js to check what environment shell
// commands receive (secret stripped, only the dedicated GitHub token exposed).

import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const SERVER = path.join(__dirname, '../../../infra/executor/server.js');
const SECRET = '0123456789abcdef0123456789abcdef';

function startExecutor(env: Record<string, string>): Promise<{ proc: ChildProcess; port: number }> {
  const port = 30000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      PATH: process.env.PATH || '',
      EXECUTOR_PORT: String(port),
      EXECUTOR_SECRET: SECRET,
      DEFAULT_CWD: '/tmp',
      LOG_API_URL: 'http://127.0.0.1:9/log-submit',
      ...env,
    } as unknown as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('executor did not start')), 5000);
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('Listening on')) {
        clearTimeout(timer);
        resolve({ proc, port });
      }
    });
    proc.on('exit', (code: number | null) => {
      clearTimeout(timer);
      reject(new Error(`executor exited with ${code}`));
    });
  });
}

async function run(port: number, command: string): Promise<{ stdout: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-executor-secret': SECRET },
    body: JSON.stringify({ command }),
  });
  return res.json() as Promise<{ stdout: string }>;
}

const PRINT_ENV = 'echo "gh=$GH_TOKEN|github=$GITHUB_TOKEN|pat=$GITHUB_PAT|exec=$EXECUTOR_GITHUB_TOKEN|secret=$EXECUTOR_SECRET|prompt=$GIT_TERMINAL_PROMPT"';

describe('executor command environment', () => {
  let proc: ChildProcess | null = null;

  afterEach(() => {
    proc?.kill();
    proc = null;
  });

  it('exposes only EXECUTOR_GITHUB_TOKEN (as GH_TOKEN/GITHUB_TOKEN) and never the executor secret', async () => {
    const started = await startExecutor({
      EXECUTOR_GITHUB_TOKEN: 'github_pat_scoped',
      GITHUB_PAT: 'broad-pat',
    });
    proc = started.proc;

    const result = await run(started.port, PRINT_ENV);

    expect(result.stdout).toBe('gh=github_pat_scoped|github=github_pat_scoped|pat=|exec=|secret=|prompt=0');
  });

  it('drops broad GitHub tokens when no dedicated token is configured', async () => {
    const started = await startExecutor({ GITHUB_TOKEN: 'broad-token', GH_TOKEN: 'other' });
    proc = started.proc;

    const result = await run(started.port, PRINT_ENV);

    expect(result.stdout).toBe('gh=|github=|pat=|exec=|secret=|prompt=0');
  });

  it('refuses to start without a secret', async () => {
    await expect(startExecutor({ EXECUTOR_SECRET: '' })).rejects.toThrow('executor exited with 1');
  });
});
