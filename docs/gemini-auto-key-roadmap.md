# Gemini API Key Auto-Provisioning

> **Goal:** When a new user signs up or opens settings, they click "Connect with Google" and Allerac One
> automatically provisions a Gemini API key for them — no manual steps, no API key management.

---

## Research Findings (March 2026)

### Is it technically possible?
**Yes.** The full flow works:
1. OAuth2 with `cloud-platform` scope
2. Create Cloud project via `cloudresourcemanager.googleapis.com`
3. Enable Gemini API via `serviceusage.googleapis.com`
4. Create API key via `apikeys.googleapis.com`

A project created without billing is automatically on the **free tier** — no credit card required.
This is exactly what AI Studio does internally when a user signs up.

### The blocker: OAuth scope verification
`cloud-platform` is a **restricted scope** — Google requires an app verification process before
production use with external users:
- Minimum 3–5 business days review
- Rigorous privacy policy review
- Potential annual third-party security audit (because we store user data server-side)
- Unverified apps show a prominent "This app isn't verified" warning that blocks most users

**This makes full automation impractical for now** — the verification burden is disproportionate
for a self-hosted platform at early stage.

### Free tier limits (as of Dec 2025 — Google reduced them)

| Model | RPM | RPD | TPM |
|---|---|---|---|
| Gemini 2.0 Flash | 15 | 1,500 | 1,000,000 |
| Gemini 2.5 Flash | 10 | 250 | 250,000 |
| Gemini 2.5 Pro | 5 | 100 | 250,000 |

Rate limits are **per project** — all keys in the same project share the pool.

⚠️ **Privacy note:** Free tier prompts may be used by Google to improve their products.

### Other constraints
- Max **25 Cloud projects per Google account** — if user hits this, provisioning fails
- No public API for AI Studio key creation — it's UI only
- Vertex AI (enterprise alternative) requires billing from day one, no free tier

---

## Recommended Approach: Guided Self-Provisioning

Instead of full automation, implement a **guided flow** that takes the user to AI Studio
and brings them back automatically:

```
User clicks "Get Gemini API Key"
        ↓
Opens aistudio.google.com/apikey in new tab
        ↓
User clicks "Create API key" (one click, already logged in with Google)
        ↓
User copies key and pastes back into Allerac
        ↓  (future: detect paste automatically)
Key saved, Gemini models unlocked
```

**Why this works:**
- AI Studio free tier takes ~30 seconds for a user already logged into Google
- No OAuth verification burden
- No ToS surface area
- The key belongs to the user, not Allerac
- Works today, zero implementation risk

---

## Implementation Plan

### Phase 1 — Guided flow (implement now)
- [ ] Add a "Get your free Gemini key" button next to the Google API key field in Settings
- [ ] Button opens `https://aistudio.google.com/apikey` in new tab
- [ ] Add step-by-step instructions inline (3 steps, plain language)
- [ ] Auto-detect when user pastes a key (starts with `AIza`) and show success feedback

### Phase 2 — Better UX (short term)
- [ ] After key is saved, auto-switch default model to a Gemini model
- [ ] Show current model quota/tier (free vs paid) based on key
- [ ] Add "Test my key" button that makes a quick Gemini API call

### Phase 3 — Full OAuth automation (when scale justifies it)
Only pursue this when:
- Allerac has enough users that 30-second manual setup is a measurable drop-off point
- We have capacity for Google's OAuth verification process
- We can commit to the annual security audit requirement

Implementation at that stage:
- Register Google OAuth app with `cloud-platform` scope
- Go through Google verification (3–5 days + audit if needed)
- Implement `GoogleProvisioningService` (create project → enable API → create key)
- "Connect with Google" button replaces the manual paste flow entirely

---

## Why Not Full Automation Right Now

| Factor | Status |
|---|---|
| Technically feasible | ✅ Yes |
| Free tier accessible | ✅ Yes (no billing needed) |
| OAuth verification required | ❌ Blocks production use |
| Implementation complexity | Medium-high |
| Time to implement correctly | Weeks + Google review time |
| Risk if verification rejected | All users blocked |

The guided self-provisioning approach (Phase 1) delivers **80% of the UX improvement** with
**5% of the effort**. Full automation is the right Phase 3 goal, but the wrong Phase 1 bet.

---

## Notes

- The deep-link to AI Studio is `https://aistudio.google.com/apikey` — no login friction for
  users already signed into Google (which is almost everyone)
- Gemini 2.0 Flash is the sweet spot for free tier: best RPD (1,500/day) and TPM (1M)
- Server-side fallback (`GOOGLE_API_KEY` env var) can cover users who skip this step,
  same pattern as GitHub and Tavily keys
