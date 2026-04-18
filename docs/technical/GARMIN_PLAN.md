# Garmin Connection Resolution Plan

## Goal
Restore Garmin connection functionality today.

## Strategy - Two Mechanisms

### Phase 1: Direct Local Authentication ✓ Previously Worked
**Target:** Make it work locally like before
- Use `garminconnect` + `garth` directly
- No Cloudflare intermediary
- No IP blocking (because it's local)

**Function:** `_authenticate_direct()` in `services/health-worker/garmin.py`

**Status:** Needs investigation
- [ ] Find which version of `garminconnect` works
- [ ] Fix Python code if needed
- [ ] Test locally

---

### Phase 2: Cloudflare Worker for Azure VM
**Target:** Make it work via worker for Azure VM deployment
- Use Cloudflare worker to bypass Garmin's IP blocking
- Health-worker calls the worker and receives tokens
- Tokens are converted to session_dump

**Function:** `_authenticate_via_worker()` in `services/health-worker/garmin.py`
**Worker:** `services/garmin-auth-worker/src/index.ts`

**Status:** Never worked
- [ ] Investigate why worker never worked
- [ ] Implement if necessary

---

## Next Steps
1. Investigate correct version of `garminconnect`
2. Fix Phase 1 code
3. Test locally
4. Then tackle Phase 2
