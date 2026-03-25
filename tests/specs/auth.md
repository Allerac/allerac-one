# Spec: Auth Service

**File:** `src/app/services/auth/auth.service.ts`
**Priority:** 🔴 Critical — broken auth = security breach

## What to mock
- PostgreSQL client (`src/app/clients/db.ts`) — use jest.mock, return controlled rows
- `bcrypt` — only mock in unit tests where hashing speed doesn't matter

## Test cases

### `register(email, password)`
- Creates user with hashed password (hash !== plaintext)
- Returns user object with `id` and `email`
- Throws/returns null if email already exists
- Rejects empty email or empty password

### `login(email, password)`
- Returns session token on valid credentials
- Returns null on wrong password
- Returns null on unknown email
- Session token is stored in DB with an expiry

### `validateSession(token)`
- Returns user object for a valid, non-expired token
- Returns null for unknown token
- Returns null for expired token
- Does NOT return the password hash in the user object

### `logout(token)`
- Deletes session from DB
- Subsequent `validateSession` returns null

## Notes
- Password must never be stored or returned in plaintext anywhere
- Session tokens must be unguessable (check length/entropy, not the algorithm)
