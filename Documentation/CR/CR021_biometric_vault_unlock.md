# CR021 — Biometric Vault Unlock (WebAuthn PRF)

**Status:** Completed (shipped in v0.11.14)
**Severity:** Feature (security-sensitive)
**Origin:** User question on CR020 follow-up, 2026-05-01

## Shipped Implementation

- **Crypto:** Raw 32-byte master key derived (Argon2id, same params as CR020) at enrollment time, wrapped under the PRF secret via AES-256-GCM, stored as base64 in `localStorage` under key `noted.vaultBiometric` alongside `credentialId`, `prfSalt`, and `wrappedIv`.
- **Lock screen:** when a wrapped key exists for this device, the `/vault` lock screen shows a prominent "Use biometric unlock" button above the password form. The password form remains visible and usable — biometric is purely a shortcut.
- **Settings:** "Biometric Vault Unlock" card under Vault settings (visible only when a vault exists). Toggle to enable (prompts for current vault password → verifier check → WebAuthn enrollment ceremony) or remove. Shows a hint when no platform authenticator is configured in the OS.
- **Master-password rotation:** clears the locally-stored wrapped key, since the old key won't unwrap anymore. User re-enrolls if they want biometric back on this device.
- **Stale-key handling:** if the unwrapped key fails the verifier check (e.g. master password was rotated on another device since enrollment), the wrapped key is auto-cleared and the user is told to re-enroll via password.
- **Code:** `frontend/src/lib/biometricUnlock.js` (new — WebAuthn enrollment / unlock ceremony + localStorage management), `frontend/src/lib/vaultCrypto.js` (extended with `deriveRawKey`, `importMasterKey`, `wrapBytes`, `unwrapBytes` for the biometric wrap flow), `frontend/src/stores/vault.js` (`enrollBiometric` / `unlockWithBiometric` / `disableBiometric` actions + auto-clear on rotation), `frontend/src/views/VaultView.vue` (lock-screen button), `frontend/src/views/SettingsView.vue` (enrollment card).

## Problem

The vault (CR020) requires typing the master password every unlock. On devices with platform authenticators (Touch ID, Windows Hello, Android fingerprint) we can offer a one-tap biometric unlock without breaking the zero-knowledge model — but only on browsers that support the WebAuthn **PRF extension**.

Plain WebAuthn signs a challenge — useful for *authenticating* but not for producing a key. The PRF extension makes the authenticator return a stable per-credential 32-byte secret on each successful biometric tap, which we can use to wrap a copy of the vault master key. The master password remains the source of truth; biometric is an optional, per-device shortcut.

## Approach

### Enrollment (one-time, in Settings)

1. User clicks "Enable biometric unlock on this device" in Settings → Vault.
2. Prompt for current vault password.
3. Derive master key from password + existing salt (same as normal unlock).
4. Verify against `vault_meta.verifier_ciphertext`. Reject if wrong.
5. Call `navigator.credentials.create({ publicKey: { ...rp, ...user, extensions: { prf: { eval: { first: <random salt> } } } } })`.
6. Pull `extensions.prf.results.first` from the response — that's a 32-byte secret.
7. Encrypt the master key with `AES-GCM(prfSecret, masterKey)` → `wrappedKey + iv`.
8. Store in **localStorage** (per device): `{ credentialId, prfSalt, wrappedKey, wrappedIv, vaultUserId }`.

### Unlock (per session)

1. On `/vault` lock screen: if `localStorage` has a credential for this user, show a "Use fingerprint" button.
2. Click → `navigator.credentials.get({ publicKey: { allowCredentials: [credentialId], extensions: { prf: { eval: { first: prfSalt } } } } })`.
3. Browser prompts for biometric.
4. On success, pull `extensions.prf.results.first` → re-derive the wrap key.
5. Decrypt `wrappedKey` → master key in memory.
6. Run normal unlock flow from there (load entries, start idle timer).

### Disable

- Settings button "Remove biometric unlock from this device" → wipe the localStorage entry. The credential itself can stay registered with the OS (harmless without the wrapped key).
- Changing the master password (CR020 rotation) **must invalidate** any existing wrapped keys, since the master key changes. Simplest: clear the localStorage entry on rotation; user re-enrolls if they want biometric back.

### Fallback

Master password is **always** mandatory. Biometric is a shortcut, not a replacement. Reasons: device loss, browser-data clearing, OS authenticator failures, cross-device access.

## Decisions Locked

1. **Scope:** Opt-in per device via Settings toggle (not auto-prompt on first unlock).
2. **Fallback:** Password remains primary and mandatory. Biometric is purely additive.
3. **On password rotation (CR020):** clear stored biometric credential — user re-enrolls.

## Open Questions for Implementation

- **WebAuthn user identity:** what to use as the `user.id`? The vault is currently keyed off `auth.user.id`. Using that ties the credential to the Noted user — fine.
- **RP ID:** for production this is `noted.tail413695.ts.net`. For dev (`localhost:5173`) WebAuthn permits localhost. Worth verifying both work before committing.
- **Multiple credentials per device:** keep it simple — one credential per `(user, browser-storage)`. Re-enrolling overwrites.
- **iOS limitations:** Safari's PRF support landed in 18; iOS WebKit may have quirks worth testing.
- **Should the lock screen detect "no PRF support" gracefully?** Yes — feature-detect via `navigator.credentials.get(...).then(r => r.getClientExtensionResults().prf)` on a probe call, or simply show the button only when localStorage has an entry (since enrollment already verified PRF works on this browser).

## Browser / Platform Support (snapshot, 2026-05-01)

| Platform | Authenticator | PRF support |
|----------|---------------|-------------|
| Chrome / Edge (Win/Mac/Android) | Windows Hello, Touch ID, Android fingerprint | Yes (132+) |
| Safari (macOS / iOS) | Touch ID / Face ID | Yes (Safari 18+) |
| Firefox | Platform authenticators | Partial / landing — re-check at build time |

If a browser lacks PRF, enrollment fails with a specific error and the button stays hidden. No regression for users who never enroll.

## Threat-Model Notes

- **localStorage compromise:** the wrapped key is encrypted with the PRF secret, which is held in the secure enclave / TPM and never leaves the authenticator. An attacker with localStorage access cannot unwrap without a successful biometric tap on the device.
- **XSS:** an attacker injecting JS *can* call `credentials.get()` on the user's behalf if the user is present at the device. Mitigation: same-origin policy + CSP. Not different from any other web-secret-handling app.
- **Malicious browser extension:** can read localStorage *and* trigger biometric prompts the user might confirm absent-mindedly. This is a real risk unique to the web platform — document it in the enrollment prompt.
- **Password-strength bypass:** since password remains primary, biometric never *weakens* the vault. It just moves the attack target from "guess the password" to "compromise the device" — which is generally harder, but is a different threat.

## Out of Scope (for whenever this is built)

- Cross-device sync of biometric enrollment (would require server-side credential storage and a different threat model).
- Hardware security key support (FIDO2 USB / NFC keys) — same WebAuthn API, but different UX expectations; treat as a follow-up CR.
- Replacing the master password entirely (would change the threat model — see CR020 rationale).

## Pre-Implementation Checklist

When this CR is picked up:
- [ ] Verify Firefox PRF status; if still flagged, document as a known limitation.
- [ ] Verify dev (`localhost:5173`) and prod (`noted.tail413695.ts.net`) RP IDs both work.
- [ ] Decide on copy for the enrollment warning (XSS / malicious-extension caveat).
- [ ] Add a test plan that doesn't require a real authenticator (mock the credentials API in vitest).
