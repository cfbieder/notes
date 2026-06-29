# CR035 — Vault Emergency Export (self-decrypting HTML)

> Renumbered from CR030 (duplicate number) during the 2026-06-28 docs migration to the documentation standard.

**Status:** Completed (2026-06-19)
**Severity:** Feature (security-sensitive)
**Origin:** User request, 2026-06-19 — "export all vault info into a key-encrypted file I can save on my computer and open in an emergency if I can't access this app."

## Problem

The vault (CR020) is strictly zero-knowledge: if the Noted app/server is ever unreachable (outage, lost device, decommissioned instance), there is no way to read your stored passwords, keys, cards, or bank details. CR020 listed "Export / import (encrypted .json file)" as out of scope. The user wants a durable, offline-readable emergency copy that does **not** depend on the Noted app being available.

## Design Decisions (locked)

Confirmed with the user on 2026-06-19:

1. **Format: self-decrypting HTML.** A single `.html` file that opens in any browser, fully offline, with no Noted app and no installed tools (no `openssl`/`gpg`/`age`). It embeds only ciphertext plus a small vanilla-JS decrypt+render routine. Rejected alternatives: an encrypted blob needing a CLI tool (assumes tooling + remembered command in an emergency); plain encrypted JSON (only re-importable into Noted — fails the "open without the app" goal).
2. **Passphrase: separate export passphrase, chosen at export time.** Decoupled from the vault master password so the file can use native WebCrypto only (no bundled Argon2 wasm → tiny, auditable file) and so a backup isn't invalidated by master-password rotation. The passphrase is never stored.
3. **Client-only.** The already-unlocked vault holds decrypted records in memory; the entire export runs in the browser. **No backend changes, no new API, no DB changes.**

## Crypto Spec

Intentionally distinct from the vault's Argon2id master key (keeps the exported file dependency-free):

- **KDF:** PBKDF2-HMAC-SHA-256, 600 000 iterations, 16-byte random salt.
- **Encrypt:** AES-256-GCM, 12-byte random IV.
- **Payload:** JSON `{ version, exportedAt, entries: [...] }` where each entry keeps only `type`, `name`, and the fields relevant to its type (`password`/`key`/`card`/`bank`). Server/in-memory bookkeeping fields (`id`, `created_at`, `updated_at`) are stripped; undecryptable stubs are dropped.
- **Bundle baked into the HTML:** `{ v, kdf:{name,hash,iterations,salt}, iv, ciphertext, count, exportedAt }` (base64), embedded in a `<script type="application/json">` tag. The embedded decrypt routine re-derives the key from the same params.

## Frontend

- `frontend/src/lib/vaultExport.js` — `buildEmergencyExportHtml(entries, passphrase, exportedAtISO)` encrypts and returns the standalone HTML string; `downloadHtml(html, filename)` triggers a Blob download. The HTML template contains the decrypt + render UI (passphrase gate → searchable entry list → Print/Save-as-PDF + Lock).
- `frontend/src/components/ui/VaultExportModal.vue` — passphrase + confirm + acknowledgement modal (min 8 chars). Disabled when the vault is empty.
- `frontend/src/views/VaultView.vue` — "Export" button in the unlocked header (disabled when no entries); `doExport(passphrase)` builds the file and downloads it as `noted-vault-emergency-YYYY-MM-DD.html`.

## Security Requirements

- The generated file contains **only** ciphertext — no plaintext secret bytes (verified by test).
- The export passphrase is never persisted (no localStorage/sessionStorage) and never sent to the server.
- Export only available while the vault is unlocked (decrypted records are needed to build the file).
- The modal carries an explicit warning: the passphrase is the only protection, it's separate from the master password, and forgetting it makes the file unreadable.
- Generated randomness (salt, IV) uses `crypto.getRandomValues`.

## Acceptance Criteria

- From an unlocked vault, "Export" → enter a passphrase → an `.html` file downloads.
- Opening the file in a browser with no network and no Noted prompts for the passphrase and, on the correct passphrase, renders all entries grouped by type with all fields; wrong passphrase shows an error.
- The file works offline and standalone; it can be filtered and printed / saved as PDF from inside the page.
- Inspecting the file shows no plaintext secrets; an undecryptable vault stub is excluded; type-specific fields carry no orphan data.
- No backend, API, or schema change.

## Implementation Notes (shipped 2026-06-19)

- Roundtrip + leak verified: encrypt via `buildEmergencyExportHtml`, decrypt with the embedded params — 4/5 sample entries decrypt (undecryptable stub dropped), card record has no orphan `url`, ciphertext file contains neither the sample key nor the sample card number, wrong passphrase rejected.
- `npm run build` passes.
- No new dependencies (native WebCrypto only).

## Out of Scope (potential follow-up)

- Re-import of the exported file back into Noted (this export is read-only / human-facing).
- Scheduled / automatic periodic exports.
- Encrypted JSON export aimed at machine round-tripping between Noted instances.
