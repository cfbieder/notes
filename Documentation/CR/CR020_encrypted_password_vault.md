# CR020 — Encrypted Password & Key Vault

**Status:** Completed (2026-04-30)
**Severity:** Feature (security-sensitive)
**Origin:** User request, 2026-04-30

## Problem

Noted has no first-class place to store credentials and secrets (passwords, API keys, recovery codes). Users currently either keep them in plaintext notes (server can read them; they appear in backups, the LLM gateway, and any future search index) or in a separate password manager (context-switch). We want a built-in vault that is genuinely zero-knowledge — the server never sees plaintext, and a full server/database/backup compromise leaks no secrets.

## Design Decisions (locked)

Captured from the design conversation on 2026-04-30:

1. **Encryption model: client-side, zero-knowledge.** All vault content is encrypted in the browser. The server only ever stores opaque ciphertext. Lost master password = unrecoverable data; this is intentional and matches the threat model.
2. **Master password: separate from login password.** Decoupled so the auth system (password / future passkey / future SSO) can evolve without re-encrypting the vault.
3. **KDF: Argon2id** (via `hash-wasm` or `argon2-browser`). Memory-hard, modern standard. Not PBKDF2.
4. **Auto-lock: 15-min idle timeout + manual lock button.** No lock-on-tab-hide. Idle timer resets on any vault read/write. Configurable timeout deferred to a follow-up CR if needed.
5. **Structure: dedicated vault with structured entries.** Fixed fields per entry: `name`, `username`, `password`, `url`, `notes`. Custom UI with copy-to-clipboard buttons and masked password display — not the markdown editor. The free-form `notes` field handles the "extra context" cases (recovery codes, security questions).

## Crypto Spec

### Key derivation
- **Algorithm:** Argon2id
- **Parameters:** memory = 64 MiB, iterations = 3, parallelism = 1 (tune for ~500ms on a typical laptop; benchmark during implementation)
- **Salt:** 16 random bytes per user, generated on vault setup, stored server-side in `vault_meta.kdf_salt`
- **Output:** 32-byte master key (held in memory only — Pinia store, never persisted to localStorage/sessionStorage)

### Encryption
- **Algorithm:** AES-256-GCM (WebCrypto `SubtleCrypto`)
- **Nonce:** 12 random bytes per encryption, stored alongside ciphertext
- **AAD:** none in v1. (The original draft proposed binding to entry `id`, but the client doesn't know the id at create time and a two-phase create added complexity for a small marginal benefit. AES-GCM's auth tag already protects integrity within a row; cross-row swap protection is left to v2 if it becomes load-bearing.)
- **Per-entry payload:** JSON `{name, username, password, url, notes}` → UTF-8 bytes → encrypt → store `{ciphertext, iv}` as `bytea` columns

### Verification token
- On vault setup, encrypt a known plaintext (e.g. `"vault-v1-ok"`) with the master key and store ciphertext+iv in `vault_meta.verifier_ciphertext` / `verifier_iv`.
- On unlock, derive key from entered password + stored salt, attempt to decrypt the verifier. Success → unlock. Failure → "wrong password" without revealing whether vault exists.

## Data Model

New tables (forward-only migration):

```sql
CREATE TABLE vault_meta (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kdf_salt             BYTEA NOT NULL,
  kdf_params           JSONB NOT NULL,        -- {algo: 'argon2id', m: 65536, t: 3, p: 1}
  verifier_ciphertext  BYTEA NOT NULL,
  verifier_iv          BYTEA NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vault_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext  BYTEA NOT NULL,
  iv          BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vault_entries_user_idx ON vault_entries (user_id, updated_at DESC);
```

No plaintext metadata (not even `name`) lives server-side — this is strict zero-knowledge. Sorting/filtering happens client-side after decrypting the list.

## API

All routes under `/api/v1/vault/`, JWT-auth required (vault password is *additionally* required client-side; server never sees it).

- `GET    /vault/meta`              → `{ kdf_salt, kdf_params, verifier_ciphertext, verifier_iv }` or `404` if not set up
- `POST   /vault/meta`              → set up vault (body: `{ kdf_salt, kdf_params, verifier_ciphertext, verifier_iv }`); rejects if already exists
- `GET    /vault/entries`           → list `[{ id, ciphertext, iv, updated_at }]`
- `POST   /vault/entries`           → create (body: `{ ciphertext, iv }`)
- `PUT    /vault/entries/:id`       → update (body: `{ ciphertext, iv }`)
- `DELETE /vault/entries/:id`       → delete
- `PUT    /vault/rotate`            → atomic master-password rotation (body: `{ kdf_salt, kdf_params, verifier_ciphertext, verifier_iv, entries: [{id, ciphertext, iv}, ...] }`). Server enforces that the submitted entry-id set matches the existing set exactly; the meta + every entry are updated in a single transaction.

## Frontend

- New route `/vault` and sidebar entry (lock icon when locked, unlock icon when unlocked)
- New Pinia store `frontend/src/stores/vault.js`:
  - State: `isSetUp`, `isUnlocked`, `masterKey` (in-memory only), `entries` (decrypted), `idleTimer`
  - Actions: `setup(password)`, `unlock(password)`, `lock()`, `createEntry(data)`, `updateEntry(id, data)`, `deleteEntry(id)`
  - Idle timer resets on every action; on expiry calls `lock()` which zeroes `masterKey` and `entries`
- New views:
  - `VaultSetupView.vue` — first-time master password creation (with confirmation + strength meter + explicit "no recovery" warning)
  - `VaultUnlockView.vue` — master password prompt
  - `VaultView.vue` — entry list (search box does client-side filter on decrypted names), "Add entry" button, manual lock button
  - `VaultEntryModal.vue` — create/edit form with masked password field, reveal toggle, copy-to-clipboard buttons, generate-password helper
- New crypto module `frontend/src/lib/vaultCrypto.js`:
  - `deriveKey(password, salt, params)` — Argon2id via `hash-wasm`
  - `encryptEntry(key, plaintextObj, entryId)` — AES-GCM with id as AAD
  - `decryptEntry(key, ciphertext, iv, entryId)`
  - `encryptVerifier(key)` / `verifyPassword(key, ct, iv)`

## Security Requirements

- Master key MUST live only in the Pinia store memory; never written to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
- Master password MUST never be sent to the server. Backend has no endpoint that accepts it.
- All vault entry payloads MUST go through `vaultCrypto.js` — no plaintext `name`/`url`/etc. ever crosses the network or hits the database.
- Vault routes MUST NOT be touched by the LLM service, web clipper ingest path, search indexer, or backup-aware code paths beyond raw row dumping.
- Clipboard auto-clear: when the user clicks "copy password," clear the clipboard 30 s later (best-effort; document the limitation).
- Generated passwords use `crypto.getRandomValues`, not `Math.random`.
- Idle timeout fires whether or not the vault tab is focused (use `setTimeout`, reset on every store action).
- Manual "Lock vault" button is always visible when unlocked.
- Vault entries excluded from the existing markdown editor pipeline entirely — no CodeMirror, no wikilink parser, no autocomplete, no autosave plugin touches plaintext.

## Acceptance Criteria

- A user with no existing vault sees a setup flow on first visit to `/vault`, creates a master password, and the vault is initialised on the server with KDF salt + verifier.
- Wrong master password on unlock shows "incorrect password" without distinguishing from "vault not set up."
- Entries can be created, edited, deleted, and listed; sort/filter on `name` works client-side.
- Copy-to-clipboard buttons work for username, password, URL; password is masked by default with a reveal toggle.
- After 15 minutes of no vault activity, the vault auto-locks (master key wiped, entries cleared from memory, re-prompt required).
- Manual "Lock" button immediately locks the vault.
- Tab hide/show does NOT lock the vault.
- Inspecting the database directly shows only `bytea` ciphertext — no plaintext names, usernames, passwords, or URLs anywhere.
- A backup tarball restored to a fresh environment yields a vault that requires the master password to read; the master password is not in the backup.
- Tests cover: setup, wrong password rejection, encrypt/decrypt roundtrip, AAD-bound ciphertext rejects swap attack, idle timeout fires, manual lock fires, ciphertext stored in DB does not contain any plaintext field bytes.

## Implementation Notes (shipped 2026-04-30)

- **Migration:** `backend/migrations/017_vault.sql` (uses UUID for `user_id`, not INTEGER as the original draft suggested).
- **Backend routes:** `backend/src/routes/vault.js` — `/api/v1/vault/{meta,entries}` with base64-encoded BYTEA on the wire.
- **Backend tests:** `backend/tests/phase12-vault.test.js` — 26 assertions covering setup, KDF rejection, base64 validation, encrypt/decrypt roundtrip, server-side plaintext leak check, update/delete flow, and field size limits. The test provisions a dedicated `vault-test-user` directly via SQL (no public registration endpoint exists).
- **Frontend crypto:** `frontend/src/lib/vaultCrypto.js` — Argon2id via `hash-wasm`, AES-256-GCM via WebCrypto.
- **Frontend store:** `frontend/src/stores/vault.js` — master key held in module closure (not Pinia state) to avoid leaking it through DevTools; 15-min idle timer; `lock()` wipes the key.
- **Frontend view:** `frontend/src/views/VaultView.vue` handles all three sub-states (setup / locked / unlocked) plus the entry list. Entry create/edit uses `frontend/src/components/ui/VaultEntryModal.vue`.
- **Sidebar entry:** Lock-key icon between Reminders and Trash.
- **Lock policy:** 15-min idle timeout + manual lock button only. The vault stays unlocked when navigating to other routes (notes, tasks, etc.) — only the idle timer or the explicit lock button clears the master key. Tab hide also does not lock.

## Out of Scope (potential follow-up CRs)

- Export / import (encrypted `.json` file)
- Multi-device sync conflict UX (last-write-wins is fine for v1)
- Sharing vault entries between users (would require per-entry asymmetric crypto)
- Browser autofill / clipper integration
- Mobile/Electron native vault unlock via OS keychain
- Hardware-backed key (WebAuthn PRF extension) as alternative unlock factor
- Configurable idle timeout in Settings
