'use strict';

const http = require('http');
const { exec } = require('child_process');

const PORT = parseInt(process.env.EXECUTOR_PORT || '3001', 10);
const SECRET = process.env.EXECUTOR_SECRET || '';
const DEFAULT_CWD = process.env.DEFAULT_CWD || '/tmp';

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB — commands should never be larger
const MIN_TIMEOUT_MS = 1_000;           // 1 second
const MAX_TIMEOUT_MS = 5 * 60_000;      // 5 minutes

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
  let bodyBytes = 0;
  req.on('data', chunk => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      respond(res, 413, { error: 'Request body too large' });
      req.destroy();
      return;
    }
    body += chunk;
  });
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

    if (timeout !== undefined) {
      if (
        typeof timeout !== 'number' ||
        !Number.isInteger(timeout) ||
        timeout < MIN_TIMEOUT_MS ||
        timeout > MAX_TIMEOUT_MS
      ) {
        respond(res, 400, {
          error: `timeout must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms`,
        });
        return;
      }
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

// Close connections that take too long to send headers or body (Slowloris mitigation)
server.headersTimeout = 10_000;   // 10 seconds to receive all headers
server.requestTimeout = 30_000;   // 30 seconds to receive the full request body

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[executor] Listening on :${PORT}`);
  console.log(`[executor] Auth: ${SECRET ? 'enabled' : 'disabled (set EXECUTOR_SECRET to enable)'}`);
  console.log(`[executor] Default cwd: ${DEFAULT_CWD}`);
});
