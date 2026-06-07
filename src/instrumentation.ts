export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Install console interceptor first so skill sync logs are captured
    const { installConsoleInterceptor } = await import('./lib/logger');
    installConsoleInterceptor();

    const { syncSystemSkills } = await import('./app/services/skills/system-skills-loader');
    await syncSystemSkills();

    // Start background agent worker runner
    const { getWorkerRunner } = await import('./app/services/agents/worker-runner.service');
    getWorkerRunner().start();

    // Poll job_executions and emit to log buffer so scheduler activity appears in /logs
    startSchedulerLogger();
  }
}

async function startSchedulerLogger() {
  const g = globalThis as any;
  if (g.__allerac_scheduler_logger_started) return;
  g.__allerac_scheduler_logger_started = true;

  try {
    // Advisory lock (session-level): só 1 worker Next.js faz polling.
    // Chave fixa = hash de 'allerac_scheduler_logger'. Não-bloqueante — retorna false se outro worker já tem.
    const pool = (await import('./app/clients/db')).default;
    const { rows: [{ acquired }] } = await pool.query(
      'SELECT pg_try_advisory_lock(1952936801) AS acquired'
    );
    if (!acquired) return;
  } catch {
    return;
  }

  let lastSeenAt = new Date();

  const poll = async () => {
    try {
      const pool = (await import('./app/clients/db')).default;
      const result = await pool.query(
        `SELECT je.id, je.status, je.result, je.started_at, je.completed_at, sj.name
         FROM job_executions je
         JOIN scheduled_jobs sj ON sj.id = je.job_id
         WHERE je.completed_at > $1
         ORDER BY je.completed_at ASC`,
        [lastSeenAt]
      );

      for (const row of result.rows) {
        const duration = row.completed_at && row.started_at
          ? `${((new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 1000).toFixed(1)}s`
          : '';
        const resultSnippet = row.result
          ? row.result.replace(/\n/g, ' ').slice(0, 120) + (row.result.length > 120 ? '…' : '')
          : '';
        const icon = row.status === 'completed' ? '✓' : '✗';
        const msg = `[Scheduler] ${icon} "${row.name}" ${duration}${resultSnippet ? ` — ${resultSnippet}` : ''}`;
        if (row.status === 'failed') console.error(msg);
        else console.log(msg);
        lastSeenAt = new Date(row.completed_at);
      }
    } catch { /* silent — DB might not be ready yet */ }
  };

  // Start após 10s para DB conectar, depois poll a cada 15s
  setTimeout(() => {
    poll();
    setInterval(poll, 15_000);
  }, 10_000);
}
