# Allerac One — UX/UI Reference

## Overview

Allerac One is a private-first AI agent platform. The interface is designed to feel like a modern AI chat application — clean, minimal, and focused on the conversation. It is fully responsive, supporting desktop, tablet, and mobile browsers, and ships with dark/light theme support and three-language internationalization (English, Portuguese, Spanish).

---

## Design System

### Colors

The UI uses a dark-first palette based on Tailwind CSS gray scale, with purple and blue as primary accent colors.

| Role | Dark mode | Light mode |
|---|---|---|
| App background | `gray-900` | `white` |
| Sidebar background | `gray-900` | — |
| Surface (cards, modals) | `gray-800` | `white` |
| Surface elevated | `gray-700` | `gray-50` / `gray-100` |
| Border | `gray-700` / `gray-800` | `gray-200` |
| Primary text | `gray-100` | `gray-900` |
| Secondary text | `gray-400` | `gray-500` / `gray-600` |
| Accent (primary) | `purple-500` / `purple-600` | `purple-600` |
| Accent (info) | `blue-500` / `blue-600` | `blue-500` |
| Danger | `red-400` / `red-600` | `red-600` |
| Success | `green-400` | `green-600` |

### Typography

- **Font:** System font stack (Tailwind default)
- **Base size:** `text-sm` (14px) for most UI elements
- **Headings in modals:** `text-base` to `text-xl`, `font-semibold` or `font-bold`
- **Section labels:** `text-xs uppercase text-gray-400`
- **Chat messages:** Rendered as Markdown via `prose` plugin, with explicit color overrides for light mode compatibility

### Spacing & Radius

- Buttons and inputs: `rounded-lg`
- Modals: `rounded-lg` (desktop), `rounded-t-2xl` (mobile bottom-sheet)
- Standard padding: `p-3` / `p-4` / `p-6` depending on context
- Gap between items: `gap-2` / `gap-3`

### Theming

The theme is toggled by the user and persisted to `localStorage` under the key `chatTheme`. The root `div` switches between `bg-gray-900` (dark) and `bg-white` (light). Most components receive an `isDarkMode: boolean` prop and apply conditional Tailwind classes accordingly.

---

## Layout Structure

```
+---------------------------+----------------------------------+
|                           |  ChatHeader (transparent)        |
|  Sidebar                  +----------------------------------+
|  (desktop: fixed left,    |                                  |
|   mobile: drawer overlay) |  ChatMessages (scrollable)       |
|                           |                                  |
|  - Header (logo + toggle) |                                  |
|  - Conversations list     +----------------------------------+
|  - Bottom navigation      |  ChatInput (pinned bottom)       |
|                           |                                  |
+---------------------------+----------------------------------+
```

### Responsive Breakpoint

The layout pivots at the `lg` breakpoint (1024px):

- **`< lg` (mobile/tablet):** Sidebar is hidden by default. A hamburger button in the chat header opens it as a full-height overlay drawer with a dark backdrop. The sidebar always shows a ✕ close button.
- **`≥ lg` (desktop):** Sidebar is always visible on the left. It can be collapsed to icon-only mode (`w-20`) or expanded (`w-64`). The hamburger becomes a toggle button.

---

## Components

### Sidebar

**Files:** `SidebarDesktop.tsx`, `SidebarMobile.tsx`, `SidebarContent.tsx`

The sidebar is split into three parts:

1. **Header** — Transparent background, matches the chat header height. Shows the "Allerac" wordmark and a toggle/close button. On desktop, the button collapses the sidebar; on mobile, it closes the drawer.

2. **Conversations list** — Scrollable list of past conversations, sorted by pinned first, then by most recent. Each item shows:
   - A pin icon (gray) when pinned, or a chat bubble icon otherwise
   - Conversation title (truncated)
   - A 3-dot menu button (always visible) revealing:
     - **Pin / Unpin** — toggles pinned state and re-sorts the list
     - **Rename** — replaces the title with an inline text input; confirmed with Enter or blur, cancelled with Escape
     - **Delete** — removes the conversation and its messages

3. **Bottom navigation** — Fixed at the bottom, separated by a top border. Flat list of icon+label buttons (or icon-only when collapsed):
   - **Consciousness** — opens the system prompt / memory settings modal
   - **Knowledge** — opens the document knowledge base modal
   - **Memories** — opens saved AI memories modal
   - **Skills** — opens the skills library
   - **Tasks** — opens the scheduled jobs modal
   - **Configuration** — opens the system dashboard

---

### Chat Header

**File:** `ChatHeader.tsx`

Transparent header (no background color, no border), sitting above the chat area. Uses the same padding and height as the sidebar header for visual alignment.

**Left side:**
- Hamburger button (mobile only) — opens/closes the sidebar
- **Conversation title** — when a conversation is active, shows its title (truncated with `…` at `max-w-[40vw]` on mobile, `260px` on desktop). When no conversation is active, shows the "Allerac" wordmark.

**Right side (icon buttons):**
- **Save to Memory** — only shown when a conversation is active. Bookmark icon; filled and green when already saved, outlined otherwise.
- **Theme toggle** — sun (dark mode) / moon (light mode)
- **New Chat** — pencil/compose icon; starts a fresh conversation
- **User avatar** — circular button with the user's initials; opens the User Settings modal

---

### Chat Messages

**File:** `ChatMessages.tsx`

The main scrollable area rendering the conversation history.

**User messages:** Right-aligned bubble with `bg-blue-600` (dark) or `bg-blue-500` (light), white text. Supports plain text and image attachments (displayed inline above the text).

**Assistant messages:** Left-aligned, no bubble background. Content rendered as Markdown (`react-markdown` + `remark-gfm` + `prose` plugin). Code blocks get syntax highlighting.

**Thinking indicator:** While the assistant is generating a response, the agent avatar displays an animated spinning conic-gradient ring (rainbow colors, 2s rotation) around it. This animation is embedded in the avatar itself, not a separate element.

**Message actions menu:** Each assistant message has a 3-dot button (appears on hover on desktop, always visible on mobile). The menu contains:
- **Teach** — opens the Teach modal (formerly "Correct & Memorize") pre-filled with the message content
- **Copy** — copies the message text to clipboard

**Active skill badge:** When a skill is active in the conversation, a small badge appears above the input area indicating the active skill name.

---

### Chat Input

**File:** `ChatInput.tsx`

Pinned to the bottom of the chat area. On mobile it respects `safe-area-inset-bottom` for devices with home indicators.

**Structure (left to right):**
1. **Attachment button (`+`)** — opens a small dropdown above with two options:
   - **Image** — triggers the hidden file input for image uploads
   - **Document** — opens the Knowledge Base modal
2. **Skills button** — lightning bolt icon; shows the active skill name if one is selected. Opens a dropdown listing available skills with activate/deactivate options.
3. **Text area** — auto-resizing, multi-line. `Enter` sends, `Shift+Enter` inserts a newline.
4. **Model selector** — shows the current model icon/name; opens a dropdown to switch AI provider/model.
5. **Send button** — arrow icon; disabled when input is empty or while sending.

**Image attachments:** Selected images are shown as thumbnail previews above the input row, each with a ✕ remove button.

---

### Teach Modal (CorrectAndMemorize)

**File:** `CorrectAndMemorize.tsx`

A bottom-sheet modal on mobile, centered on desktop. Purpose: let the user correct an AI response and save the correction as a persistent memory.

**Structure:**
- **Header:** Purple-to-pink gradient icon, "Teach" title, ✕ close button
- **AI response preview:** First 200 characters of the message, in a muted card
- **Correction input:** Free text field — "How should it be?"
- **Importance dropdown:** `🔵 Low` / `🟡 Medium` / `🔴 High` — maps to numeric values 1/5/10 in the database
- **Emotion dropdown:** `😡 Frustrated` / `😐 Neutral` / `🥰 Happy` — maps to -1/0/1
- **Actions:** "Save to Memory" (primary, purple) and "Cancel"

On success, shows a green confirmation message and auto-closes after 2.5 seconds. No `autoFocus` on the input to avoid mobile keyboard resizing the viewport.

---

### Modals — General Pattern

All modals share a consistent pattern:

```
fixed inset-0 bg-black/50 backdrop-blur-sm   ← backdrop
  └── panel (backdrop-blur-md, shadow-xl)
        ├── Mobile: bottom-sheet (rounded-t-2xl, drag indicator pill)
        └── Desktop: centered card (sm:rounded-lg, sm:max-w-lg)
              ├── Header: gradient icon + title + ✕ button
              ├── Content: space-y-4 cards/fields
              └── Actions: primary button + cancel
```

Clicking the backdrop closes the modal. `Escape` key also closes it.

---

### User Settings Modal

**File:** `UserSettingsModal.tsx`

Centered modal (not bottom-sheet). Contains:
- User avatar (initials from email), display name, email address
- Language selector dropdown (EN / PT / ES) — persisted via cookie
- **Telegram Bot Settings** button — blue, opens the Telegram modal
- **Logout** button — red tinted, at the bottom

---

### Configuration Modal (System Dashboard)

**File:** `SystemDashboard.tsx`

Two-tab modal:

**System tab:**
- Real-time system metrics: hostname, platform, uptime, CPU load, memory usage
- Database connection status
- AI models list (cloud + local), with Ollama model download support
- Update checker: current vs. latest version with one-click update preparation

**API Keys tab:**
- GitHub Token input (required for cloud AI models and embeddings)
- Tavily API Key input (for web search)
- Telegram Bot Token input
- Save button with inline success/error feedback

---

### Consciousness Modal (Memory Settings)

**File:** `MemorySettingsModal.tsx`

Allows the user to edit the system prompt that is prepended to every conversation. Textarea with save/cancel actions.

---

### Knowledge Modal (Documents)

**File:** `DocumentsModal.tsx`

Manage documents in the RAG knowledge base. Users can upload files (PDF, TXT, etc.) which are chunked, embedded, and stored in pgvector for semantic search during conversations.

---

### Memories Modal

**File:** `MemoriesModal.tsx`

View and delete saved AI memories — conversation summaries and user corrections (from the Teach feature) that persist across conversations to give the AI long-term context.

---

### Skills Library

**File:** `SkillsLibrary.tsx`

Browse and manage AI skills — pre-configured system prompt personas (e.g., "Code Reviewer", "Writing Assistant"). Skills can be activated per-conversation from both this modal and the chat input toolbar.

---

### Tasks Modal (Scheduled Jobs)

**File:** `ScheduledJobsModal.tsx`

Create and manage cron-based automated prompts. Each job has a name, prompt, cron expression (with preset shortcuts: hourly, daily, weekly, monthly, or custom), delivery channels (e.g., Telegram), and enabled/disabled toggle.

---

### Telegram Bot Settings

**File:** `TelegramBotSettings.tsx`

Full-page modal for managing personal Telegram bot configurations. Users can add multiple bots (each with their own BotFather token), set allowed Telegram User IDs for access control, enable/disable bots, and test tokens inline. Includes step-by-step setup instructions.

---

### Login & Setup

**Files:** `LoginModal.tsx`, `SetupWizard.tsx`

**Login modal:** Centered card with email/password fields, toggle between Login and Register. Inline field validation.

**Setup wizard:** Full-screen 4-step flow shown only on first run:
1. Create admin account
2. Choose language
3. Configure AI model (test connection)
4. Setup complete

---

## Internationalization

All user-facing strings are externalized via `next-intl`. Translation files live in `src/i18n/messages/`:

| File | Language |
|---|---|
| `en.json` | English |
| `pt.json` | Portuguese |
| `es.json` | Spanish |

Language preference is stored in a `locale` cookie and applied at the Next.js middleware level. The language selector in User Settings updates the cookie and reloads with the new locale.

**Namespaces:**

| Namespace | Used by |
|---|---|
| `sidebar` | Sidebar navigation and conversation menu |
| `chat` | ChatInput, ChatHeader |
| `system` | ChatHeader tooltips, SystemDashboard |
| `userSettings` | UserSettingsModal |
| `telegram` | TelegramBotSettings |
| `documents` | DocumentsModal |
| `memory` | Memory-related modals |
| `scheduledJobs` | TasksModal |
| `setup` | SetupWizard |
| `login` | LoginModal |
| `common` | Shared labels (Save, Cancel, Close) |

---

## Interaction Patterns

### Conversation Management
- **New chat:** Header button or navigating away from all conversations
- **Load conversation:** Click item in sidebar list
- **Pin/Unpin:** 3-dot menu → Pin — pinned items float to the top
- **Rename:** 3-dot menu → Rename — inline input replaces title; Enter saves, Escape cancels
- **Delete:** 3-dot menu → Delete — immediate, no confirmation dialog

### Message Flow
1. User types in ChatInput and presses Enter (or Send button)
2. Message appears immediately in the messages list
3. Thinking ring animation appears on the agent avatar
4. Response streams in token by token
5. Conversation is saved to the database automatically

### Memory Flow
- After a conversation reaches sufficient length, the system can generate a summary
- User can manually trigger "Save to Memory" from the chat header bookmark button
- User can correct AI responses via the "Teach" option in the message menu
- Memories are retrieved automatically in future conversations via semantic search

---

## Accessibility Notes

- All interactive elements have `title` attributes (translated) for screen readers and tooltip display
- Focus management: modals trap focus; Escape closes them
- Keyboard navigation: Enter submits forms and inline rename; Shift+Enter in chat creates a new line
- Touch-friendly: 3-dot menus are always visible (no hover-only patterns), minimum tap targets of 44×44px on action buttons
- Safe area support: `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` applied to header padding and input area padding for iPhone notch/home bar compatibility
