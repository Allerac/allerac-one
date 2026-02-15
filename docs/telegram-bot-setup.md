# Guia de Instalação do Bot do Telegram - Allerac One

Este guia explica como configurar seu próprio bot do Telegram para conectar ao Allerac One.

## Pré-requisitos

- Conta no Telegram
- Acesso ao servidor onde o Allerac está instalado (via SSH)
- Conta criada no chat.allerac.ai

## Passo 1: Criar o Bot no Telegram

1. **Abra o Telegram** e busque por `@BotFather`
2. **Inicie uma conversa** com `/start`
3. **Crie um novo bot** com o comando:
   ```
   /newbot
   ```
4. **Escolha um nome** para seu bot (ex: "Allerac da Maria")
5. **Escolha um username** (deve terminar em 'bot', ex: `allerac_maria_bot`)
6. **Copie o token** que o BotFather te enviar
   - Formato: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
   - ⚠️ **IMPORTANTE**: Guarde esse token em segurança!

## Passo 2: Descobrir seu Telegram User ID

1. No Telegram, busque por `@userinfobot`
2. Inicie conversa com `/start`
3. O bot vai te enviar seu **User ID** (um número, ex: `123456789`)
4. Anote esse número

## Passo 3: Descobrir seu Allerac User ID

1. Acesse **chat.allerac.ai**
2. Faça login com sua conta
3. Abra o **Console do navegador** (F12)
4. Digite no console:
   ```javascript
   localStorage.getItem('userId')
   ```
5. Copie o UUID retornado (ex: `0827de78-2b42-46ca-9bb0-90c9b2d55013`)

## Passo 4: Configurar Variáveis de Ambiente

1. **Conecte ao servidor** via SSH:
   ```bash
   ssh seu-usuario@seu-servidor.com
   ```

2. **Entre na pasta do Allerac**:
   ```bash
   cd ~/allerac-one
   ```

3. **Edite o arquivo .env**:
   ```bash
   nano .env
   ```

4. **Adicione/atualize estas linhas** (substitua pelos seus valores):
   ```env
   # Bot do Telegram
   TELEGRAM_BOT_TOKEN=SEU_TOKEN_DO_BOTFATHER
   TELEGRAM_ALLOWED_USERS=SEU_TELEGRAM_USER_ID
   TELEGRAM_DEFAULT_USER=SEU_ALLERAC_USER_ID
   
   # Ollama (se estiver usando modelos locais)
   OLLAMA_BASE_URL=http://ollama:11434
   ```

5. **Salve o arquivo**:
   - Aperte `Ctrl + O` para salvar
   - Aperte `Enter` para confirmar
   - Aperte `Ctrl + X` para sair

## Passo 5: Fazer Deploy do Bot

1. **Baixe as últimas atualizações**:
   ```bash
   git pull
   ```

2. **Faça o build do bot**:
   ```bash
   docker compose build telegram-bot
   ```

3. **Inicie o bot**:
   ```bash
   docker compose --profile telegram up -d
   ```

4. **Verifique se está rodando**:
   ```bash
   docker ps | grep telegram
   ```
   - Deve mostrar um container `allerac-telegram` com status `Up`

5. **Verifique os logs**:
   ```bash
   docker logs allerac-telegram --tail 50
   ```
   - Deve mostrar: `[Telegram] Bot started. Waiting for messages...`

## Passo 6: Testar o Bot

1. **Abra o Telegram** e busque pelo username do seu bot
2. **Inicie conversa** com `/start`
3. **Teste um comando**:
   ```
   /help
   ```
4. **Envie uma mensagem** normal para testar o chat

## Comandos Disponíveis

- `/start` - Iniciar o bot
- `/new` - Começar nova conversa
- `/model` - Ver/trocar modelo de IA
- `/memory` - Ver memórias recentes
- `/save` - Salvar conversa na memória
- `/correct` - Corrigir resposta da IA e memorizar
- `/help` - Mostrar ajuda

## Configurar Bot para Outro Usuário

Para configurar um bot para outra pessoa (ex: sua mãe):

### Opção A: Bot Separado (✅ Recomendado - Privacidade Total)

Cada pessoa tem seu próprio bot com conversas e memórias privadas.

**Passo a Passo:**

1. **Ela cria conta** no chat.allerac.ai
2. **Ela cria bot** no BotFather seguindo o Passo 1 deste guia
   - Nome: "Allerac da Maria"
   - Username: `allerac_maria_bot`
3. **Ela descobre** seu Telegram User ID (Passo 2)
4. **Ela descobre** seu Allerac User ID (Passo 3)

## Configurar Bot para Outro Usuário (Multi-Bot)

O Allerac suporta **múltiplos bots** rodando simultaneamente, cada um conectado a um usuário diferente com privacidade total. Isso significa que você pode ter um bot para você, outro para sua mãe, outro para um amigo, etc.

### Como Funciona

- Cada bot tem seu próprio **token** e **username**
- Cada bot é vinculado a um **usuário específico** do Allerac
- As conversas e memórias são **completamente isoladas** entre usuários
- Todos os bots rodam no **mesmo container** Docker

### Passo a Passo: Adicionar Novo Bot

1. **O novo usuário cria conta** no chat.allerac.ai
2. **O novo usuário cria bot** no BotFather seguindo o Passo 1 deste guia
   - Nome: "Allerac da Maria"
   - Username: `allerac_maria_bot`
3. **O novo usuário descobre** seu Telegram User ID (Passo 2)
4. **O novo usuário descobre** seu Allerac User ID (Passo 3)

### Configurar no Servidor

1. **Conecte ao servidor** via SSH:
   ```bash
   ssh seu-usuario@seu-servidor.com
   cd ~/allerac-one
   ```

2. **Crie o arquivo de configuração** (se não existir):
   ```bash
   cp telegram-bots.example.json telegram-bots.json
   ```

3. **Edite o arquivo de configuração**:
   ```bash
   nano telegram-bots.json
   ```

4. **Adicione o novo bot** à lista:
   ```json
   {
     "bots": [
       {
         "name": "Meu Bot",
         "token": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
         "alleracUserId": "0827de78-2b42-46ca-9bb0-90c9b2d55013",
         "allowedTelegramIds": [123456789],
         "enabled": true
       },
       {
         "name": "Bot da Maria",
         "token": "9876543210:ZYXwvuTSRqponMLKjihGFEdcba",
         "alleracUserId": "f3d2c1b0-8765-4321-ab12-cd34ef567890",
         "allowedTelegramIds": [987654321],
         "enabled": true
       }
     ]
   }
   ```

5. **Salve o arquivo** (Ctrl+O, Enter, Ctrl+X)

6. **Reinicie o container**:
   ```bash
   docker compose --profile telegram restart telegram-bot
   ```

7. **Verifique os logs**:
   ```bash
   docker logs allerac-telegram --tail 100
   ```
   - Deve mostrar mensagens de startup para cada bot
   - Ex: `[Telegram] Starting bot: Meu Bot`
   - Ex: `[Telegram] Bot 'Meu Bot' started successfully`

### Testar o Novo Bot

1. O novo usuário abre o Telegram e busca pelo username do bot dele
2. Envia `/start`
3. Testa com uma mensagem

### Desativar um Bot Temporariamente

Para desativar um bot sem remover a configuração:

```json
{
  "name": "Bot da Maria",
  "enabled": false,  // ← Mude para false
  ...
}
```

Depois reinicie o container:
```bash
docker compose --profile telegram restart telegram-bot
```

### Remover um Bot

1. Remova a configuração do bot de `telegram-bots.json`
2. Reinicie o container
3. (Opcional) Revogue o token no BotFather se não for mais usar

### Notas de Segurança

- ⚠️ **Nunca commite** `telegram-bots.json` no Git (já está no .gitignore)
- 🔒 Os tokens são **credenciais sensíveis** - trate como senhas
- 👥 Cada bot só responde aos `allowedTelegramIds` configurados
- 🗄️ O banco de dados já isola dados por `user_id` - sem risco de vazamento

## Solução de Problemas

### Bot não responde

1. **Verifique os logs**:
   ```bash
   docker logs allerac-telegram --tail 100
   ```

2. **Verifique se está rodando**:
   ```bash
   docker ps -a | grep telegram
   ```
   - Se mostrar "Restarting" ou "Exited", há um erro

3. **Reinicie o bot**:
   ```bash
   docker compose --profile telegram restart telegram-bot
   ```

### Erro "Access denied"

- Verifique se seu `TELEGRAM_ALLOWED_USERS` está correto
- Verifique se não há espaços extras no `.env`

### Erro "Failed to load settings"

- Verifique se o `TELEGRAM_DEFAULT_USER` está correto
- Verifique se o usuário existe no banco de dados:
  ```bash
  docker exec allerac-one-db-1 psql -U postgres -d allerac -c "SELECT id, email FROM users;"
  ```

### Bot trava ou não responde a algumas mensagens

- **Reinicie o container**:
  ```bash
  docker compose --profile telegram restart telegram-bot
  ```
- Verifique se há erros nos logs relacionados ao Ollama ou rate limits

## Próximos Passos

Após configurar o bot:

1. **Configure tokens no chat.allerac.ai**:
   - Settings → Token Configuration
   - Adicione GitHub Token (para modelos cloud)
   - Adicione Tavily API Key (para web search)

2. **Faça upload de documentos**:
   - Documents → Upload PDFs
   - O bot vai ter acesso aos mesmos documentos

3. **Configure System Prompt**:
   - Settings → Memory Settings
   - Personalize como a IA deve responder

4. **Teste as funcionalidades**:
   - Converse normalmente
   - Use `/save` para criar memórias
   - Use `/correct` para ensinar preferências
   - Use `/model` para trocar entre modelos

## Recursos Adicionais

- **Documentação completa**: `/docs`
- **Business Plan**: `/docs/business-plan.md`
- **Arquitetura**: `/docs/projects-and-products.md`
- **GitHub**: https://github.com/Allerac/allerac-one

## Suporte

Se encontrar problemas:
1. Verifique os logs primeiro
2. Consulte a seção "Solução de Problemas"
3. Crie uma issue no GitHub com os logs relevantes
