# Autenticação - Allerac-One

Este projeto usa Supabase Authentication para gerenciar usuários.

## Configuração Inicial

### 1. Criar Usuário no Supabase

Existem duas formas de criar usuários:

#### Opção A: Via Supabase Dashboard (Recomendado)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Authentication** > **Users**
4. Clique em **Add User**
5. Configure:
   - Email: seu-email@example.com
   - Password: senha-segura
   - Auto Confirm User: ✅ (marque esta opção)
6. Clique em **Create User**

#### Opção B: Via SQL (Se quiser desabilitar verificação de email)

Execute no SQL Editor do Supabase:

```sql
-- Desabilitar confirmação de email (apenas para desenvolvimento)
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email = 'seu-email@example.com';
```

### 2. Fazer Login

1. Acesse `http://localhost:3000/chat`
2. Uma tela de login aparecerá
3. Digite o email e senha que você criou
4. Clique em "Entrar"

### 3. Configurar API Keys

Após o login, configure suas chaves de API:

1. Clique no botão **API Keys** na sidebar
2. Adicione seu **GitHub Personal Access Token**
3. (Opcional) Adicione sua **Tavily API Key** para busca web

## Políticas de Segurança (RLS)

As políticas de Row-Level Security (RLS) estão configuradas para:

- ✅ Usuários só podem ver/editar suas próprias conversas
- ✅ Usuários só podem ver/editar mensagens em suas conversas
- ✅ Configurações globais são compartilhadas entre todos os usuários

## Criar Múltiplos Usuários

Se quiser adicionar mais usuários:

1. Vá em **Authentication** > **Users** no Supabase
2. Clique em **Add User** para cada novo usuário
3. Cada usuário terá suas próprias conversas isoladas

## Logout

Para fazer logout:

1. Clique no botão **Logout** na sidebar
2. Você será redirecionado para a tela de login

## Troubleshooting

### "invalid input syntax for type uuid"
- **Causa**: Tentando usar string como UUID
- **Solução**: Já corrigido - agora usando UUID válido do Supabase Auth

### "new row violates row-level security policy"
- **Causa**: Políticas RLS estão bloqueando acesso
- **Solução**: Verifique se o usuário está autenticado corretamente

### "Failed to authenticate"
- **Causa**: Credenciais inválidas ou usuário não confirmado
- **Solução**: 
  1. Verifique email/senha no Supabase Dashboard
  2. Confirme que `email_confirmed_at` não é nulo na tabela `auth.users`

## Desenvolvimento Local

Para facilitar o desenvolvimento local, você pode:

1. Criar um usuário de teste no Supabase
2. Usar sempre as mesmas credenciais
3. As chaves de API ficam salvas no localStorage do navegador

## Segurança

⚠️ **Importante**: 
- Nunca compartilhe suas chaves de API
- Não faça commit de credenciais no repositório
- Em produção, use políticas RLS mais restritivas se necessário
- Configure SMTP no Supabase para habilitar verificação de email

## Próximos Passos

Após configurar a autenticação:

1. Configure suas API keys (GitHub + Tavily)
2. Comece a conversar com o AI
3. Faça upload de documentos (opcional)
4. Explore as funcionalidades de memória
