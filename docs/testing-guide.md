# Testing Guide — Allerac One

Guia completo para executar os testes do projeto.

## Quick Start

```bash
# Instalar dependências (primeira vez)
npm install

# Rodar todos os testes unitários
npm test

# Rodar testes E2E
npm test:e2e

# Rodar tudo (unit + E2E)
npm test && npm test:e2e
```

---

## Unit Tests (Jest)

### Rodar Todos os Testes
```bash
npm test
```

Output esperado:
```
Test Suites: 8 passed, 8 total
Tests:       200 passed, 200 total
```

### Rodar Testes Específicos

**Por arquivo:**
```bash
npm test -- ChatInput.test.tsx
npm test -- OnboardingWizard.test.tsx
npm test -- auth.service.test.ts
```

**Por padrão (pattern):**
```bash
# Testes de componentes apenas
npm test -- --testPathPattern="components"

# Testes de services apenas
npm test -- --testPathPattern="services"

# Testes de um serviço específico
npm test -- --testPathPattern="chat.service"
```

**Por suite name:**
```bash
npm test -- --testNamePattern="ChatInput"
npm test -- --testNamePattern="OnboardingWizard"
npm test -- --testNamePattern="AuthService"
```

### Watch Mode (desenvolvimento)

```bash
npm test:watch
```

Pressione `a` para rodar todos os testes, `q` para sair.

### Coverage Report

```bash
npm test:coverage
```

Gera relatório em `coverage/` com:
- Linhas cobertas
- Branches cobertas
- Funções cobertas
- Statements cobertas

Abrir: `coverage/lcov-report/index.html` no navegador.

---

## E2E Tests (Playwright)

### Rodar Todos os Testes E2E

```bash
npm test:e2e
```

Testa:
- **e2e/auth.spec.ts** — Register, login, logout, validação
- **e2e/onboarding.spec.ts** — Wizard, language selection, persistence
- **e2e/chat.spec.ts** — Conversas, mensagens, rename, delete

### Rodar Teste Específico

```bash
# Apenas auth tests
npm test:e2e -- auth.spec

# Apenas onboarding
npm test:e2e -- onboarding.spec

# Apenas chat
npm test:e2e -- chat.spec
```

### UI Mode (visual debugging)

```bash
npm test:e2e:ui
```

Abre navegador com interface interativa para:
- Ver cada passo do teste
- Inspecionar elementos
- Pausar/retomar execução
- Fazer debug visual

### Modo Debug Avançado

```bash
# Com trace recording
npm test:e2e -- --trace on

# Com screenshots em caso de falha
npm test:e2e -- --headed
```

---

## Estrutura dos Testes

### Phases Implementadas

**Phase 1-3: Services (158 testes)** ✅
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

**Phase 5: Components (42 testes)** ✅
```
src/app/components/
├── onboarding/__tests__/
│   └── OnboardingWizard.test.tsx (15 tests)
└── chat/__tests__/
    └── ChatInput.test.tsx (27 tests)
```

**Phase 7: E2E (21 testes)** ✅
```
e2e/
├── auth.spec.ts (7 tests)
├── onboarding.spec.ts (6 tests)
└── chat.spec.ts (8 tests)
```

---

## Troubleshooting

### Testes Falhando Localmente

**1. Limpar cache Jest:**
```bash
npm test -- --clearCache
```

**2. Reinstalar node_modules:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**3. Verificar Node version:**
```bash
node --version  # Deve ser 18.x ou superior
npm --version   # Deve ser 9.x ou superior
```

### E2E Tests não Funcionam

**1. Playwright não instalado:**
```bash
npm install -D @playwright/test
npx playwright install
```

**2. Port 3000 em uso:**
```bash
# Matar processo na port 3000
lsof -i :3000
kill -9 <PID>

# Ou usar port diferente no playwright.config.ts
```

**3. Slow tests:**
```bash
# Aumentar timeout (ms)
npm test:e2e -- --timeout 60000
```

---

## CI/CD Integration

### GitHub Actions (exemplo)

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

| Componente | Atual | Alvo |
|-----------|-------|------|
| Services | 99.5% | 95%+ |
| Components | 60% | 80%+ |
| API Routes | 0% | 80%+ |
| **Total** | **70%** | **80%+** |

---

## Scripts Disponíveis

| Script | O que faz |
|--------|----------|
| `npm test` | Rodar todos os testes unitários |
| `npm test:watch` | Watch mode para testes unitários |
| `npm test:coverage` | Gerar relatório de coverage |
| `npm test:e2e` | Rodar testes E2E |
| `npm test:e2e:ui` | Rodar E2E com UI interativa |

---

## Escrevendo Novos Testes

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

## Links Úteis

- **Jest Docs**: https://jestjs.io/
- **Testing Library**: https://testing-library.com/
- **Playwright**: https://playwright.dev/
- **Next.js Testing**: https://nextjs.org/docs/testing

---

## Checklist para PR

- [ ] Rodar `npm test` localmente — todos devem passar
- [ ] Rodar `npm test:coverage` — target 80%+
- [ ] Rodar `npm test:e2e` — todos devem passar
- [ ] Novos testes escritos para nova funcionalidade
- [ ] Remover `.only` e `.skip` antes de fazer commit
