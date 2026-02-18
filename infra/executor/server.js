'use strict';

const http = require('http');
const { exec } = require('child_process');

const PORT = parseInt(process.env.EXECUTOR_PORT || '3001', 10);
const SECRET = process.env.EXECUTOR_SECRET || '';
const DEFAULT_CWD = process.env.DEFAULT_CWD || '/tmp';

function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    respond(res, 200, { status: 'ok' });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/execute') {
    respond(res, 404, { error: 'Not found' });
    return;
  }

  if (SECRET) {
    const provided = req.headers['x-executor-secret'];
    if (provided !== SECRET) {
      respond(res, 401, { error: 'Unauthorized' });
      return;
    }
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let command, cwd, timeout;
    try {
      ({ command, cwd, timeout } = JSON.parse(body));
    } catch {
      respond(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    if (!command || typeof command !== 'string') {
      respond(res, 400, { error: 'Missing or invalid command' });
      return;
    }

    const startTime = Date.now();
    console.log(`[executor] Running: ${command}`);

    exec(command, {
      cwd: cwd || DEFAULT_CWD,
      timeout: timeout || 30000,
      maxBuffer: 1024 * 1024 * 10,
      shell: '/bin/bash',
    }, (error, stdout, stderr) => {
      const result = {
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim() || (error && !error.killed ? error.message : ''),
        exitCode: error ? (error.code ?? 1) : 0,
        success: !error,
        command,
        duration_ms: Date.now() - startTime,
      };
      console.log(`[executor] Exit ${result.exitCode} in ${result.duration_ms}ms: ${command}`);
      respond(res, 200, result);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[executor] Listening on :${PORT}`);
  console.log(`[executor] Auth: ${SECRET ? 'enabled' : 'disabled (set EXECUTOR_SECRET to enable)'}`);
  console.log(`[executor] Default cwd: ${DEFAULT_CWD}`);
});
