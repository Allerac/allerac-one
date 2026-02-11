# Plano de Internacionalização (i18n) - Allerac One

## Objetivo
Adicionar suporte a múltiplos idiomas (português e inglês) com preferência salva por usuário no banco de dados.

---

## Biblioteca Escolhida: next-intl
Recomendada para Next.js App Router. Leve, bem documentada e integração nativa.

---

## Arquivos a CRIAR

### 1. Traduções
- `src/i18n/messages/en.json` - Textos em inglês
- `src/i18n/messages/pt.json` - Textos em português

### 2. Configuração i18n
- `src/i18n/request.ts` - Configuração do next-intl

### 3. Componente
- `src/app/components/LanguageSelector.tsx` - Dropdown para trocar idioma

### 4. Migration
- `src/database/migrations/002_add_user_language.sql`
```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
```

---

## Arquivos a MODIFICAR

| Arquivo | Mudança |
|---------|---------|
| `src/app/layout.tsx` | Adicionar NextIntlClientProvider |
| `src/app/actions/user.ts` | Funções updateLanguage() e getLanguage() |
| `src/app/components/auth/UserSettingsModal.tsx` | Adicionar seletor de idioma |
| `src/app/components/layout/SidebarContent.tsx` | Usar traduções |
| `src/app/components/auth/LoginModal.tsx` | Usar traduções |
| `src/app/components/chat/ChatInput.tsx` | Usar traduções |
| `src/app/components/documents/DocumentsModal.tsx` | Usar traduções |

---

## Traduções Principais

**Sidebar**: Conversations, Configuration, API Keys, Memory Settings, User Settings, Documents, Memories, Logout

**Login**: Welcome Back, Create Account, Login, Register, Email, Password, validation messages

**Chat**: Type your message..., Attach file

**Documents**: Knowledge Base Documents, description

---

## Ordem de Execução

1. `npm install next-intl`
2. Criar migration SQL
3. Criar arquivos de tradução
4. Criar configuração i18n
5. Atualizar user actions
6. Criar LanguageSelector
7. Atualizar layout.tsx
8. Atualizar UserSettingsModal
9. Migrar textos dos componentes

---

## Verificação
1. `npm run build`
2. Testar troca de idioma
3. Verificar persistência no banco
