# Garmin Auth Worker

## Problema

O Garmin SSO bloqueia com 429 requisições vindas de IPs de cloud providers (Azure, GCP, AWS) no passo de troca do OAuth1 token — especificamente a chamada para:

```
GET https://connectapi.garmin.com/oauth-service/oauth/preauthorized?ticket=...
```

O restante do fluxo (login, cookies, CSRF, MFA) funciona normalmente. Só esse endpoint específico é bloqueado.

## Solução

Um Cloudflare Worker que serve como proxy cirúrgico para esse único request. O Worker roda em 300+ edge locations com IPs diversificados que o Garmin não bloqueia.

```
Antes:  health-worker (VM IP) → connectapi.garmin.com  ❌ 429
Depois: health-worker (VM IP) → CF Worker (edge IP) → connectapi.garmin.com  ✅
```

Todo o restante do fluxo de autenticação (SSO, cookies, CSRF, MFA) continua rodando no `health-worker` Python. Só o OAuth1 token exchange vai pelo CF.

O Worker é **compartilhado por todos os usuários** — ele não guarda estado, apenas faz o request de um IP limpo e retorna o token. Múltiplos usuários podem autenticar simultaneamente sem conflito.

## Arquitetura

```
Usuário → allerac-one → health-worker
                             │
                     garth SSO flow normal
                     (login, cookies, MFA)
                             │
                    get_oauth1_token() ──► CF Worker ──► connectapi.garmin.com
                    (monkeypatched)
```

O monkeypatch em `services/health-worker/garmin.py` substitui `garth.sso.get_oauth1_token` por uma versão que chama o CF Worker se `AUTH_WORKER_URL` estiver configurado. Se não estiver, o código segue o caminho original sem mudança.

## Arquivos

```
services/garmin-auth-worker/
  src/index.ts      — Worker: recebe { ticket }, assina OAuth1, chama Garmin, retorna token
  wrangler.toml     — config do Cloudflare Worker
  package.json
  tsconfig.json

services/health-worker/garmin.py
  — monkeypatch de garth.sso.get_oauth1_token (ativo se AUTH_WORKER_URL estiver setado)
```

## Deploy

### 1. Deploy do CF Worker

```bash
cd services/garmin-auth-worker
npm install
npx wrangler deploy
# Anota a URL exibida no output: https://garmin-auth-worker.<account>.workers.dev
```

### 2. Configurar o secret no Worker

```bash
npx wrangler secret put WORKER_SECRET
# Digite um valor forte, ex: openssl rand -hex 32
```

### 3. Adicionar no `.env`

```env
AUTH_WORKER_URL=https://garmin-auth-worker.<account>.workers.dev
AUTH_WORKER_SECRET=<o mesmo secret configurado no wrangler>
```

### 4. Rebuild do health-worker

```bash
docker compose -f docker-compose.local.yml up -d --build health-worker
```

## Endpoint do Worker

```
POST /preauthorize
Headers: X-Worker-Secret: <secret>
Body:    { "ticket": "<garmin SSO ticket>" }

Response 200: { "oauth_token": "...", "oauth_token_secret": "...", ... }
Response 401: { "error": "Unauthorized" }
Response 4xx: { "error": "...", "detail": "..." }

GET /health
Response 200: { "status": "ok", "time": "..." }
```

## Segurança

- `X-Worker-Secret` garante que apenas o `health-worker` pode chamar o Worker
- O ticket tem vida curta (gerado no momento do login, usado uma única vez)
- O Worker não armazena nada — sem estado, sem logs de credenciais
- Se o Worker estiver fora do ar, o login falha com erro claro; o sync (que usa token salvo) não é afetado

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `AUTH_WORKER_URL` | `health-worker` container | URL do CF Worker (ex: `https://garmin-auth-worker.x.workers.dev`) |
| `AUTH_WORKER_SECRET` | `health-worker` container | Shared secret para autenticar chamadas ao Worker |
| `WORKER_SECRET` | CF Worker secret (wrangler) | Mesmo valor que `AUTH_WORKER_SECRET` |
