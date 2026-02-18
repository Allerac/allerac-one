export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  command: string;
  duration_ms: number;
}

export class ShellTool {
  private executorUrl: string;
  private executorSecret: string;

  constructor() {
    this.executorUrl = (process.env.EXECUTOR_URL || '').replace(/\/$/, '');
    this.executorSecret = process.env.EXECUTOR_SECRET || '';
  }

  async execute(command: string, cwd?: string, timeout?: number): Promise<ShellResult> {
    const startTime = Date.now();
    console.log(`[ShellTool] Executing: ${command}`);

    if (!this.executorUrl) {
      return {
        stdout: '',
        stderr: 'Executor service not configured. Set EXECUTOR_URL environment variable.',
        exitCode: 1,
        success: false,
        command,
        duration_ms: Date.now() - startTime,
      };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.executorSecret) {
        headers['x-executor-secret'] = this.executorSecret;
      }

      const response = await fetch(`${this.executorUrl}/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, cwd, timeout }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Executor HTTP ${response.status}: ${text}`);
      }

      return await response.json() as ShellResult;
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        success: false,
        command,
        duration_ms: Date.now() - startTime,
      };
    }
  }
}
