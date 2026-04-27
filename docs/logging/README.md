# Logging System

Allerac One uses a centralized logging system where all services send logs to a unified API for real-time display.

## Documentation

- **[logging-standard.md](./logging-standard.md)** — The logging standard
  - Format: `[Context] message`
  - Canonical context tags and colors
  - Log levels and message conventions
  - **READ THIS FIRST** before adding logs to a service

- **[logging-pattern.md](./logging-pattern.md)** — How to implement logging
  - Using the log interceptor in new services
  - Integration examples
  - Environment variables
  - **READ THIS** when adding logging to a new service (Telegram, Health Worker, etc)

## Quick Start

### 1. Follow the standard
Use the `[Context]` format in all your console.log calls:
```typescript
console.log('[MyService] Something happened');
console.error('[MyService] Failed to do X');
```

### 2. Install the interceptor (for external services)
```typescript
import { installLogInterceptor } from '@/lib/log-interceptor';
installLogInterceptor();
```

### 3. Logs appear in the UI
All logs with `[Context]` format automatically go to `http://localhost:8080/logs`

## Architecture

```
Service (console.log) 
  ↓
Log Interceptor (@/lib/log-interceptor.ts)
  ↓
API Endpoint (/api/log-submit)
  ↓
Log Buffer (@/lib/logger.ts)
  ↓
UI (http://localhost:8080/logs)
```

## Services Using Logging

- ✅ **App (Chat)** — Via global logger in logger.ts
- ✅ **Telegram** — Via installLogInterceptor()
- ✅ **Executor** — Via installLogInterceptor() in server.js
- 📋 **Health Worker** — Python example in logging-pattern.md
- 📋 **Notifier** — Go example in logging-pattern.md
- 📋 **Other services** — See logging-pattern.md for language-specific examples
