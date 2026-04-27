# Logging Pattern — Centralized Log API

## Overview

Allerac One uses a centralized logging pattern where all services send logs to `/api/log-submit` for real-time display in the Logs UI (`http://localhost:8080/logs`).

## How It Works

### Format
All logs use the format: `[ServiceName] message`

```typescript
console.log('[Telegram] Starting bot manager');
console.error('[HealthWorker] Failed to fetch metrics');
console.warn('[Notifier] Queue backlog detected');
```

### Automatic Interception
When you call a service with log interception installed, all `console.log/error/warn/info` calls are:
1. Printed to stdout (normal behavior)
2. Parsed for `[Context]` format
3. Sent to the log API automatically

### Log API
**Endpoint:** `POST /api/log-submit`

**Request:**
```json
{
  "context": "ServiceName",
  "message": "the actual message",
  "level": "log|error|warn|info"
}
```

## Using the Pattern

### In Services (Telegram, Health Worker, etc)

Install once at service startup:

```typescript
import { installLogInterceptor } from '@/lib/log-interceptor';

// Install with default API URL
installLogInterceptor();

// Or custom URL / service name
installLogInterceptor('http://allerac-app:3000/api/log-submit', 'my-service');

// Now all console.log with [Context] format are sent to the API
console.log('[MyService] Something happened');
```

### In the App (Chat)

The app already has a global logger installed (`src/lib/logger.ts`):
- `console.log` → captured + stored in `logBuffer` in memory
- No explicit call needed

For external services, the same logs can be sent to the API via `installLogInterceptor()`.

## Examples

### Telegram Bot
```typescript
// src/telegram-multi-bot.ts
import { installLogInterceptor } from '@/lib/log-interceptor';

installLogInterceptor();

// All these appear in http://localhost:8080/logs
console.log('[Telegram] Starting bot manager');
console.log('[Telegram] Message received from @user');
console.error('[Telegram] Failed to process message');
```

### Executor (Node.js)
```javascript
// infra/executor/server.js
const LOG_API_URL = process.env.LOG_API_URL || 'http://allerac-app:3000/api/log-submit';
installLogInterceptor(LOG_API_URL);

// Now executor logs with [executor] prefix are sent to the API
console.log('[executor] Starting server on :3001');
console.log('[executor] Executing command:', command);
```

### Health Worker (Python)
For services that aren't Node.js, send logs directly via HTTP POST:

```python
# services/health-worker/app.py
import requests
import json
import os
from datetime import datetime

LOG_API_URL = os.getenv('LOG_API_URL', 'http://allerac-app:3000/api/log-submit')

def send_log(context, message, level='log'):
    """Send a log to the centralized API"""
    try:
        requests.post(
            LOG_API_URL,
            json={'context': context, 'message': message, 'level': level},
            timeout=2
        )
    except Exception:
        pass  # Don't break the app if logging fails

# Use it
send_log('HealthWorker', 'Syncing metrics with Garmin')
send_log('HealthWorker', 'Failed to fetch data', 'error')
```

### Notifier (Go)
```go
// infra/notifier/internal/logging/log.go
package logging

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

var logAPIURL = getEnv("LOG_API_URL", "http://allerac-app:3000/api/log-submit")

func SendLog(context, message, level string) {
	payload := map[string]string{
		"context": context,
		"message": message,
		"level":   level,
	}
	
	body, _ := json.Marshal(payload)
	
	client := &http.Client{Timeout: 2 * time.Second}
	client.Post(logAPIURL, "application/json", bytes.NewReader(body))
}

// Usage in main code
logging.SendLog("Notifier", "Processing notification queue", "log")
logging.SendLog("Notifier", "Failed to send email", "error")

func getEnv(key, defaultValue string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultValue
}
```

## Benefits

✅ **Unified logging** — All services in one place
✅ **Real-time** — Logs appear instantly in the UI
✅ **Format consistent** — `[Context]` pattern everywhere
✅ **Easy to implement** — One-liner installation
✅ **Works across containers** — Services don't share memory

## Environment Variables

- `LOG_API_URL` — Override the log API endpoint (default: `http://allerac-app:3000/api/log-submit`)

```bash
LOG_API_URL=http://my-app:8080/api/log-submit npm start
```

## See Also

- `/api/log-submit` — Centralized log submission endpoint
- `src/lib/logger.ts` — Global logger for the app
- `http://localhost:8080/logs` — Real-time log viewer UI
