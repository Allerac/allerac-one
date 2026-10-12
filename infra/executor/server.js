'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS service, no build step */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { exec } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration. EXECUTOR_SECRET is mandatory: the executor runs arbitrary
// shell commands, so it refuses to start without authentication.
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.EXECUTOR_PORT || '3001', 10);
const SECRET = (process.env.EXECUTOR_SECRET || '').trim();
const DEFAULT_CWD = process.env.DEFAULT_CWD || '/tmp';
const MIN_SECRET_LENGTH = 32;

if (SECRET.length < MIN_SECRET_LENGTH) {
  console.error(
    `[executor] FATAL: EXECUTOR_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. ` +
    'Refusing to start an unauthenticated shell service. Generate one with: openssl rand -hex 32'
  );
  process.exit(1);
}

// Commands must not inherit the executor's own credential. (A determined
// shell user running as the same uid can still read /proc/1/environ, which is
// why shell access is admin-only in the app; this just stops trivial `env` leaks.)
const CHILD_ENV = { ...process.env };
delete CHILD_ENV.EXECUTOR_SECRET;
delete process.env.EXECUTOR_SECRET;

// GitHub access for shell commands comes ONLY from the dedicated, optional
// EXECUTOR_GITHUB_TOKEN (meant to be a fine-grained token limited to
// Contents + Pull requests on specific repos). It is exposed to commands as
// GH_TOKEN / GITHUB_TOKEN (curl, gh, and the git credential helper configured
// in the Dockerfile). Any other GitHub token variable is dropped.
const EXECUTOR_GITHUB_TOKEN = (CHILD_ENV.EXECUTOR_GITHUB_TOKEN || '').trim();
for (const name of ['EXECUTOR_GITHUB_TOKEN', 'GITHUB_PAT', 'GITHUB_TOKEN', 'GH_TOKEN']) {
  delete CHILD_ENV[name];
}
if (EXECUTOR_GITHUB_TOKEN) {
  CHILD_ENV.GH_TOKEN = EXECUTOR_GITHUB_TOKEN;
  CHILD_ENV.GITHUB_TOKEN = EXECUTOR_GITHUB_TOKEN;
}
// Never let git block waiting for a password prompt.
CHILD_ENV.GIT_TERMINAL_PROMPT = '0';

// HOME may live on a fresh bind mount (EXECUTOR_WORKSPACE); make sure it exists.
if (CHILD_ENV.HOME) {
  try { fs.mkdirSync(CHILD_ENV.HOME, { recursive: true }); } catch { /* best effort */ }
}

function secretMatches(provided) {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  // Hash both sides so timingSafeEqual gets equal-length buffers.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}

// Install log interceptor to send logs to centralized API
function installLogInterceptor(apiUrl, serviceName) {
  if (global.__log_interceptor_installed) return;
  global.__log_interceptor_installed = true;

  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  function parseLogArgs(args) {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const match = msg.match(/^\[([^\]]+)\]/);
    if (match) {
      const context = match[1];
      const message = msg.slice(match[0].length).trim();
      return { context, message };
    }
    return null;
  }

  function sendLogToAPI(context, message, level) {
    const serviceSecret = SECRET;
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(serviceSecret ? { Authorization: `Bearer ${serviceSecret}` } : {}),
      },
      body: JSON.stringify({ context, message, level }),
    }).catch(() => {});
  }

  console.log = (...args) => {
    originalLog(...args);
    const parsed = parseLogArgs(args);
    if (parsed) sendLogToAPI(parsed.context, parsed.message, 'log');
  };

  console.error = (...args) => {
    originalError(...args);
    const parsed = parseLogArgs(args);
    if (parsed) sendLogToAPI(parsed.context, parsed.message, 'error');
  };

  console.warn = (...args) => {
    originalWarn(...args);
    const parsed = parseLogArgs(args);
    if (parsed) sendLogToAPI(parsed.context, parsed.message, 'warn');
  };
}

const LOG_API_URL = process.env.LOG_API_URL || 'http://allerac-app:3000/api/log-submit';
installLogInterceptor(LOG_API_URL);

// Defense in depth ONLY. This regex blocklist is trivially bypassed
// (`rm --recursive`, `find -delete`, `node -e`, base64, ...). It is not a
// sandbox and must not be relied on. The real controls are: admin-only shell
// access in the app, a non-root container user, no host mounts, dropped
// capabilities and a read-only root filesystem (see docker-compose.yml).
const BLOCKED_PATTERNS = [
  /\brm\s+(-\w*\s+)*-[rf]/,           // rm -rf, rm -fr, rm -r
  /\bmkfs\b/,                          // format filesystem
  /\bdd\b.*\bof=\/dev/,               // write to raw device
  /\b(shutdown|reboot|halt|poweroff)\b/, // system shutdown
  /\bchmod\s+[0-7]*7[0-7]*\s+\//,    // chmod 777 on /
  /\bchown\s+.*\s+\//,                // chown on /
  /\bcurl\b.*\|\s*(bash|sh|zsh)/,    // curl | bash (script injection)
  /\bwget\b.*-O\s*-.*\|\s*(bash|sh)/, // wget | bash
  /\bdocker\b/,                        // any docker command
  /\bsudo\b/,                          // sudo
  /\bsu\s/,                            // su (switch user)
  /\/etc\/passwd|\/etc\/shadow/,       // access password files
  />\s*\/etc\//,                       // write to /etc
  />\s*\/bin\//,                       // write to /bin
  />\s*\/usr\//,                       // write to /usr
];

function isCommandBlocked(command) {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(command));
}

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

  // Always authenticate (SECRET is guaranteed non-empty at startup).
  if (!SECRET || !secretMatches(req.headers['x-executor-secret'])) {
    respond(res, 401, { error: 'Unauthorized' });
    return;
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

    // Security: Block dangerous commands
    if (isCommandBlocked(command)) {
      console.log(`[executor][SECURITY] Blocked dangerous command: ${command}`);
      // Return 200 so LLM can receive structured error and ask user what to do
      respond(res, 200, {
        stdout: '',
        stderr: '',
        exitCode: 1,
        success: false,
        command,
        duration_ms: 0,
        errorType: 'COMMAND_BLOCKED',
        blockedCommand: command,
      });
      return;
    }

    const startTime = Date.now();
    console.log(`[executor][${new Date().toISOString()}] cmd="${command}" cwd="${cwd || DEFAULT_CWD}"`);

    exec(command, {
      cwd: cwd || DEFAULT_CWD,
      timeout: timeout || 30000,
      maxBuffer: 1024 * 1024 * 10,
      shell: '/bin/bash',
      env: CHILD_ENV,
    }, (error, stdout, stderr) => {
      const result = {
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim() || (error && !error.killed ? error.message : ''),
        exitCode: error ? (error.code ?? 1) : 0,
        success: !error,
        command,
        duration_ms: Date.now() - startTime,
      };
      console.log(`[executor][${new Date().toISOString()}] Exit ${result.exitCode} in ${result.duration_ms}ms`);
      respond(res, 200, result);
    });
  });
});

// Close connections that take too long to send headers or body (Slowloris mitigation)
server.headersTimeout = 10_000;   // 10 seconds to receive all headers
server.requestTimeout = 30_000;   // 30 seconds to receive the full request body

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[executor] Listening on :${PORT}`);
  console.log('[executor] Auth: enabled');
  console.log(`[executor] Running as uid=${typeof process.getuid === 'function' ? process.getuid() : 'n/a'}`);
  console.log(`[executor] Default cwd: ${DEFAULT_CWD}`);
  console.log(`[executor] GitHub token for commands: ${EXECUTOR_GITHUB_TOKEN ? 'configured (EXECUTOR_GITHUB_TOKEN)' : 'none'}`);
});
