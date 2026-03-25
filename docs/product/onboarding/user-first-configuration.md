# User-First Configuration Wizard

> **Goal:** Every new user — including non-technical ones — gets a working, personalized Allerac in under 2 minutes, with zero friction and no manual API key hunting.

---

## The Problem

Today, a new user landing on Allerac faces a blank chat window and a silent AI that doesn't work until they:

1. Find the Settings modal
2. Understand what a GitHub token or Gemini API key is
3. Know where to get one
4. Copy-paste it correctly

For a technical user, this is 3 minutes. For a non-technical user, this is a reason to leave.

---

## The Solution: Onboarding Wizard

A 4-step wizard that appears **once**, right after the first login, when no AI provider is configured. It guides the user to a working, personalized setup before they ever type a message.

```
First login detected (no API key configured)
        ↓
Wizard opens automatically (full-screen overlay)
        ↓
Step 1: Welcome
Step 2: Connect AI (Gemini guided flow)
Step 3: About me (personal context)
Step 4: Done — chat is ready
```

The wizard is **skippable at any step** and never appears again once dismissed or completed.

---

## Step-by-Step Design

### Step 1 — Welcome

```
┌─────────────────────────────────────────────┐
│                                             │
│   👋 Welcome to Allerac, João!              │
│                                             │
│   Your private AI assistant is almost       │
│   ready. Let's set it up in 2 minutes.      │
│                                             │
│   ● Your data stays on your server          │
│   ● No subscription, no tracking            │
│   ● Works with free AI models               │
│                                             │
│              [ Let's go → ]                 │
│                                             │
│              Skip setup                     │
└─────────────────────────────────────────────┘
```

- Greets by name (from registration)
- Sets expectations: fast, private, free
- "Skip setup" exits the wizard and goes straight to chat (useful for technical users who will configure manually)

---

### Step 2 — Connect AI

The most important step. Offers Gemini as the primary path (free, zero config for users already on Google), with alternatives for advanced users.

```
┌─────────────────────────────────────────────┐
│                                             │
│   ⚡ Connect your AI                        │
│                                             │
│   The fastest way to get started is a       │
│   free Gemini key — takes 30 seconds        │
│   if you're already signed into Google.     │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │  1. Click the button below          │   │
│   │  2. Click "Create API key"          │   │
│   │  3. Copy and paste it here          │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   [ 🔑 Open Google AI Studio ↗ ]           │
│                                             │
│   Paste your key here:                      │
│   ┌─────────────────────────────────────┐   │
│   │ AIza...                             │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   ✅ Key saved!  (shown after valid paste)  │
│                                             │
│   ─── or ───────────────────────────────   │
│   I have a GitHub token    Use local Ollama │
│                                             │
│        [ ← Back ]    [ Next → ]            │
└─────────────────────────────────────────────┘
```

**Behavior:**
- "Open Google AI Studio" opens `https://aistudio.google.com/apikey` in a new tab
- Input detects paste of a key starting with `AIza` and shows instant green confirmation
- "I have a GitHub token" / "Use local Ollama" expand inline forms for those paths
- "Next" is enabled as soon as any provider is configured (or if user skips)

---

### Step 3 — About Me

Gives the AI personal context. Pre-filled with the user's name so it feels personalized from the start.

```
┌─────────────────────────────────────────────┐
│                                             │
│   🧠 Tell Allerac about yourself            │
│                                             │
│   This helps the AI give you better,        │
│   more personal answers. You can always     │
│   change this later in Settings.            │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │ My name is João.                    │   │
│   │                                     │   │
│   │ I'm a software engineer based in    │   │
│   │ Paris. I work on web products and   │   │
│   │ enjoy building side projects.       │   │
│   │                                     │   │
│   │ I prefer direct, concise answers.   │   │
│   └─────────────────────────────────────┘   │
│                                             │
│        [ ← Back ]    [ Save & next → ]     │
│                 Skip this step              │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Pre-filled with `My name is {firstName}.\n\n` + the default biographical template
- If user already has an "About me" saved, that content is shown instead
- "Skip this step" advances without saving — the template is not applied

---

### Step 4 — Done

```
┌─────────────────────────────────────────────┐
│                                             │
│   ✅ Allerac is ready for you, João!        │
│                                             │
│   You're set up with:                       │
│   ✓ Gemini AI (free tier)                  │
│   ✓ Personal context saved                  │
│                                             │
│   A few things you can do:                  │
│   · Ask anything — weather, code, ideas     │
│   · Add documents to your knowledge base    │
│   · Create skills for recurring tasks       │
│                                             │
│           [ Start chatting → ]              │
└─────────────────────────────────────────────┘
```

- Summary reflects what was actually configured
- "Start chatting" closes the wizard and focuses the chat input

---

## Trigger Conditions

The wizard appears **automatically** when all of these are true:

1. User just logged in (first session since registration, or flag cleared)
2. No API key is configured (no GitHub token, no Gemini key, no Ollama)
3. Wizard has not been previously dismissed

Stored as a user settings flag: `onboarding_completed: boolean` (default `false`).

Once the user clicks "Start chatting", "Skip setup", or completes step 4, the flag is set to `true` and the wizard never appears again.

---

## Existing Component

A `SetupWizard` component already exists at `src/app/components/setup/SetupWizard.tsx`. It currently handles post-registration flow (account creation + Ollama setup). The onboarding wizard described here is a **separate concern** — it runs post-login, not post-registration — and should be a new component, potentially reusing UI primitives from `SetupWizard`.

---

## Implementation Plan

### Phase 1 — Core wizard (Gemini + About me)
- [ ] Add `onboarding_completed` column to `user_settings` (migration)
- [ ] Create `OnboardingWizard` component (`src/app/components/onboarding/OnboardingWizard.tsx`)
- [ ] Step 1: Welcome screen with user name
- [ ] Step 2: Gemini guided flow (deep-link + paste detection) with GitHub/Ollama alternates
- [ ] Step 3: About me editor (pre-filled template)
- [ ] Step 4: Done screen
- [ ] Trigger in `page.tsx`: show wizard when no key configured and `onboarding_completed = false`
- [ ] i18n for all 3 languages (EN/PT/ES)

### Phase 2 — Polish
- [ ] Animate step transitions
- [ ] Show wizard progress (step 2 of 4)
- [ ] On step 2, poll for Ollama connection if user selects that path
- [ ] "Re-run wizard" option in Settings for users who want to reconfigure

### Phase 3 — Full OAuth (when Gemini auto-provisioning is available)
- Replace step 2's manual paste flow with "Connect with Google" one-click button
- See `docs/gemini-auto-key-roadmap.md` for the full plan and blockers

---

## Why This Matters

The gap between "user registers" and "user has a useful AI" is where most drop-offs happen. This wizard closes that gap for non-technical users — the exact audience Allerac needs to reach to grow beyond developers.

A user who completes the wizard has:
- A working AI (no blank responses)
- A personalized AI (knows their name and context)
- Confidence that setup is done

That's the foundation for a user who stays.
