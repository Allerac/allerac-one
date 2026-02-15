# Telegram Bot Self-Service Implementation

## Sistema Implementado ✅

O Allerac agora suporta **self-service completo** para configuração de bots do Telegram. Usuários podem criar e gerenciar seus próprios bots sem necessidade de acesso ao servidor.

## Arquitetura

### Componentes Criados

1. **Banco de Dados** (`005_add_telegram_bot_configs.sql`)
   - Tabela `telegram_bot_configs` com tokens criptografados
   - Índices para performance
   - Trigger para atualização automática de timestamps

2. **Service Layer** (`telegram-bot-config.service.ts`)
   - CRUD completo de configurações de bot
   - Criptografia AES-256 para tokens
   - Detecção de mudanças para hot reload

3. **Server Actions** (`actions/telegram-bot-config.ts`)
   - API server-side para operações de bot
   - Validação de tokens via API do Telegram
   - Tratamento de erros e validações

4. **UI Component** (`TelegramBotSettings.tsx`)
   - Interface completa para gerenciar bots
   - Teste de token em tempo real
   - Criar, editar, ativar/desativar, deletar bots

5. **Multi-Bot Manager** (`telegram-multi-bot.ts`)
   - Hot reload a cada 10 segundos
   - Lê configurações do banco de dados
   - Inicia/para bots automaticamente

6. **Integração na UI** (`page.tsx`, `UserSettingsModal.tsx`)
   - Botão "Telegram Bot Settings" nas configurações do usuário
   - Modal dedicado para gerenciar bots

## Fluxo de Uso

### Para Usuários

1. **Acessar Settings**
   - Clicar no ícone de usuário (canto superior direito)
   - Clicar em "Telegram Bot Settings"

2. **Criar Bot no Telegram**
   - Abrir @BotFather no Telegram
   - `/newbot` e seguir instruções
   - Copiar o token

3. **Configurar no Allerac**
   - Clicar "Add New Bot"
   - Colar o token
   - Clicar "Test Token" para validar
   - Adicionar Telegram User IDs permitidos
   - Salvar

4. **Bot Ativo**
   - Em até 10 segundos o bot estará online
   - Testar enviando mensagem no Telegram

### Para Administradores

Nenhuma ação necessária! O sistema é totalmente self-service.

## Deploy Instructions

### 1. Adicionar Encryption Key no .env

```bash
# No servidor
cd ~/allerac-one
nano .env
```

Adicionar:
```env
# Telegram Bot Token Encryption Key (32 bytes for AES-256)
TELEGRAM_TOKEN_ENCRYPTION_KEY=8996c0f4473202864cf77c84ce9ebc5b6c380ff7884865ab1ec177069cbf39d8
```

Salvar: Ctrl+O, Enter, Ctrl+X

### 2. Fazer Pull e Rebuild

```bash
git pull
docker compose build app telegram-bot
```

### 3. Rodar Migration

A migration roda automaticamente no startup, mas você pode forçar:

```bash
docker compose run --rm migrations
```

Ou rodar manualmente:
```bash
docker exec -it allerac-one-db-1 psql -U postgres -d allerac -f /database/migrations/005_add_telegram_bot_configs.sql
```

### 4. Restart dos Serviços

```bash
docker compose restart app
docker compose --profile telegram up -d --force-recreate telegram-bot
```

### 5. Verificar Logs

```bash
# Logs do app
docker logs allerac-one-app-1 --tail 50

# Logs do telegram bot
docker logs allerac-telegram --tail 50
```

Deve mostrar:
```
[Telegram] Starting Allerac Multi-Bot Manager with Database Hot Reload...
[Telegram] No bots configured yet. Waiting for configurations...
[Telegram] Hot reload enabled (checking every 10s)
[Telegram] Multi-Bot Manager is running
```

## Testando o Sistema

### 1. Criar Primeiro Bot

1. Acessar https://chat.allerac.ai
2. Login
3. Settings → Telegram Bot Settings
4. Add New Bot:
   - Name: "Meu Bot Teste"
   - Token: (do @BotFather)
   - Test Token (deve validar)
   - Allowed IDs: seu Telegram User ID
   - Salvar

### 2. Verificar Logs

```bash
docker logs allerac-telegram --tail 100
```

Deve mostrar (em até 10 segundos):
```
[Telegram] Configuration changes detected, reloading bots...
[Telegram] Starting bot: Meu Bot Teste
[Telegram]   - User: <seu-user-id>
[Telegram]   - Allowed IDs: <seu-telegram-id>
[Telegram] ✓ Bot "Meu Bot Teste" started successfully
[Telegram] Currently running: 1 bot(s)
```

### 3. Testar no Telegram

1. Buscar o bot pelo username
2. Enviar `/start`
3. Enviar mensagem de teste
4. Bot deve responder

### 4. Testar Desativar/Ativar

1. No UI, clicar "Disable" no bot
2. Aguardar 10 segundos
3. Logs devem mostrar: `[Telegram] ✓ Bot "Meu Bot Teste" stopped`
4. Clicar "Enable"
5. Bot deve reiniciar

## Funcionalidades

### Para Usuários

- ✅ Criar múltiplos bots pessoais
- ✅ Testar token antes de salvar
- ✅ Auto-detectar username do bot
- ✅ Controlar quais Telegram IDs podem usar
- ✅ Ativar/desativar bots instantaneamente
- ✅ Editar configurações
- ✅ Deletar bots

### Sistema

- ✅ Tokens criptografados com AES-256
- ✅ Hot reload a cada 10 segundos
- ✅ Isolamento completo por usuário
- ✅ Logs detalhados por bot
- ✅ Tratamento de erros individual por bot
- ✅ Compatibilidade com modo legacy (env vars)

## Segurança

- 🔒 Tokens criptografados no banco (AES-256)
- 🔒 Chave de criptografia em variável de ambiente
- 🔒 Validação de token via API oficial do Telegram
- 🔒 Isolamento de dados por `user_id`
- 🔒 Controle de acesso via `allowedTelegramIds`

## Backward Compatibility

O sistema ainda suporta o modo antigo via environment variables:
```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_DEFAULT_USER=...
TELEGRAM_ALLOWED_USERS=...
```

Mas o novo modo (database) tem prioridade.

## Troubleshooting

### Bot não inicia

**Verificar logs:**
```bash
docker logs allerac-telegram --tail 100
```

**Possíveis causas:**
- Token inválido → Testar token no UI
- Encryption key não configurada → Verificar .env
- Migration não rodou → Rodar manualmente
- Container não reiniciou → `docker compose --profile telegram restart telegram-bot`

### Hot reload não funciona

**Verificar:**
- Logs devem mostrar: `[Telegram] Configuration changes detected, reloading bots...`
- Se não aparecer em 10s, reiniciar container manualmente

**Force reload:**
```bash
docker compose --profile telegram restart telegram-bot
```

### Erro de criptografia

**Sintoma:**
```
Error: Invalid key length
```

**Solução:**
- Gerar nova chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Atualizar no .env
- Restart dos containers

## Próximos Passos (Opcional)

- [ ] Adicionar status "online/offline" no UI
- [ ] Webhook mode além de polling
- [ ] Notificações quando bot para
- [ ] Estatísticas de uso por bot
- [ ] Limite de bots por usuário
- [ ] Rate limiting por bot

## Conclusão

Sistema pronto para produção! Usuários agora podem:
1. Criar conta no Allerac
2. Criar bot no Telegram
3. Configurar tudo via UI
4. Usar bot com privacidade total

Sem necessidade de SSH ou acesso ao servidor. 🎉
