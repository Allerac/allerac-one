# Testing Guide — Allerac One

Complete guide for running tests in the project.

## Quick Start

```bash
# Install dependencies (first time)
npm install

# Run all unit tests
npm test

# Run E2E tests
npm test:e2e

# Run everything (unit + E2E)
npm test && npm test:e2e
```

---

## Unit Tests (Jest)

### Run All Tests
```bash
npm test
```

Expected output:
```
Test Suites: 8 passed, 8 total
Tests:       200 passed, 200 total
```

### Run Specific Tests

**By file:**
```bash
npm test -- ChatInput.test.tsx
npm test -- OnboardingWizard.test.tsx
npm test -- auth.service.test.ts
```

**By pattern:**
```bash
# Component tests only
npm test -- --testPathPattern="components"

# Service tests only
npm test -- --testPathPattern="services"

# Specific service test
npm test -- --testPathPattern="chat.service"
```

**By test suite name:**
```bash
npm test -- --testNamePattern="ChatInput"
npm test -- --testNamePattern="OnboardingWizard"
npm test -- --testNamePattern="AuthService"
```

### Watch Mode (development)

```bash
npm test:watch
```

Press `a` to run all tests, `q` to quit.

### Coverage Report

```bash
npm test:coverage
```

Generates report in `coverage/` with:
- Lines covered
- Branches covered
- Functions covered
- Statements covered

Open: `coverage/lcov-report/index.html` in browser.

---

## E2E Tests (Playwright)

### Run All E2E Tests

```bash
npm test:e2e
```

Tests:
- **e2e/auth.spec.ts** — Register, login, logout, validation
- **e2e/onboarding.spec.ts** — Wizard, language selection, persistence
- **e2e/chat.spec.ts** — Conversations, messages, rename, delete

### Run Specific Test

```bash
# Auth tests only
npm test:e2e -- auth.spec

# Onboarding only
npm test:e2e -- onboarding.spec

# Chat only
npm test:e2e -- chat.spec
```

### UI Mode (visual debugging)

```bash
npm test:e2e:ui
```

Opens browser with interactive interface for:
- Seeing each test step
- Inspecting elements
- Pausing/resuming execution
- Visual debugging

### Advanced Debug Mode

```bash
# With trace recording
npm test:e2e -- --trace on

# With screenshots on failure
npm test:e2e -- --headed
```

---

## Test Structure

### Implemented Phases

**Phase 1-3: Services (158 tests)** ✅
```
src/__tests__/services/
  ├── Perceptron.test.ts (12 tests)
  ├── auth/
  │   └── auth.service.test.ts (31 tests)
  ├── crypto/
  │   └── encryption.service.test.ts (24 tests)
  ├── database/
  │   └── chat.service.test.ts (30 tests)
  ├── memory/
  │   └── conversation-memory.service.test.ts (20 tests)
  └── skills/
      └── skills.service.test.ts (35 tests)
```

**Phase 5: Components (42 tests)** ✅
```
src/app/components/
├── onboarding/__tests__/
│   └── OnboardingWizard.test.tsx (15 tests)
└── chat/__tests__/
    └── ChatInput.test.tsx (27 tests)
```

**Phase 7: E2E (21 tests)** ✅
```
e2e/
├── auth.spec.ts (7 tests)
├── onboarding.spec.ts (6 tests)
└── chat.spec.ts (8 tests)
```

---

## Troubleshooting

### Tests Failing Locally

**1. Clear Jest cache:**
```bash
npm test -- --clearCache
```

**2. Reinstall node_modules:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**3. Check Node version:**
```bash
node --version  # Should be 18.x or higher
npm --version   # Should be 9.x or higher
```

### E2E Tests Not Working

**1. Playwright not installed:**
```bash
npm install -D @playwright/test
npx playwright install
```

**2. Port 3000 in use:**
```bash
# Kill process on port 3000
lsof -i :3000
kill -9 <PID>

# Or use different port in playwright.config.ts
```

**3. Slow tests:**
```bash
# Increase timeout (ms)
npm test:e2e -- --timeout 60000
```

---

## CI/CD Integration

### GitHub Actions (example)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm test:e2e
```

---

## Test Coverage Goals

| Component | Current | Target |
|-----------|---------|--------|
| Services | 99.5% | 95%+ |
| Components | 60% | 80%+ |
| API Routes | 0% | 80%+ |
| **Total** | **70%** | **80%+** |

---

## Available Scripts

| Script | What it does |
|--------|-------------|
| `npm test` | Run all unit tests |
| `npm test:watch` | Watch mode for unit tests |
| `npm test:coverage` | Generate coverage report |
| `npm test:e2e` | Run E2E tests |
| `npm test:e2e:ui` | Run E2E with interactive UI |

---

## Writing New Tests

### Template: Service Test

```typescript
describe('MyService', () => {
  let service: MyService;
  const mockQuery = require('@/app/clients/db').default.query as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MyService();
  });

  describe('myMethod', () => {
    it('should do something', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });

      const result = await service.myMethod('param');

      expect(result).toEqual(expectedValue);
      expect(mockQuery).toHaveBeenCalledWith(expectedSQL, ['param']);
    });
  });
});
```

### Template: Component Test

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  const defaultProps = {
    prop1: 'value1',
    onAction: jest.fn(),
  };

  it('should render and handle action', () => {
    render(<MyComponent {...defaultProps} />);

    const button = screen.getByRole('button', { name: /action/i });
    fireEvent.click(button);

    expect(defaultProps.onAction).toHaveBeenCalled();
  });
});
```

### Template: E2E Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should do something', async ({ page }) => {
    const button = page.getByRole('button', { name: /action/i });
    await button.click();

    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

---

## Useful Links

- **Jest Docs**: https://jestjs.io/
- **Testing Library**: https://testing-library.com/
- **Playwright**: https://playwright.dev/
- **Next.js Testing**: https://nextjs.org/docs/testing

---

## PR Checklist

- [ ] Run `npm test` locally — all should pass
- [ ] Run `npm test:coverage` — target 80%+
- [ ] Run `npm test:e2e` — all should pass
- [ ] Write new tests for new functionality
- [ ] Remove `.only` and `.skip` before commit
