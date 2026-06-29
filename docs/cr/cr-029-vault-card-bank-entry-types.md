# CR029 — Vault: Credit Card & Bank Account entry types

**Status:** Completed (v0.11.12)
**Depends on:** CR020 (Encrypted Password & Key Vault)

## Summary

Extend the encrypted vault to support two additional entry types beyond `password` and `key`:

- **Credit Card** — Card Name, Card Number, Expiration Date, Security Code (CVV), Comments
- **Bank Account** — Account Name, Account Number / IBAN, Routing Number, SWIFT / BIC Code, Comments

The server remains strictly zero-knowledge — all field shapes live in the AES-256-GCM ciphertext blob the client posts to `/api/v1/vault/entries`. No backend, schema, or migration changes are needed.

## Scope

### Frontend changes only

| File | Change |
|------|--------|
| `frontend/src/stores/vault.js` | Extend `normaliseRecord()` to recognise `type: 'card'` and `type: 'bank'` and persist only the fields relevant to each type. |
| `frontend/src/components/ui/VaultEntryModal.vue` | Type selector grows from 2 to 4 buttons (Password / Key / Card / Bank). Per-type field rendering: card → number + expiration + CVV + comments; bank → account # + routing + SWIFT/BIC + comments. Reuse the existing reveal/copy field-action pattern for sensitive fields. |
| `frontend/src/views/VaultView.vue` | Replace the `<select>` dropdown with a tab-style segmented control (4 tabs). Per-type list rows show a masked identifier + 2 type-specific quick-copy buttons. Per-type empty states. |

### Type-specific JSON shapes (inside the encrypted blob)

```
password: { type: 'password', name, username, password, url, notes }
key:      { type: 'key',      name, password, notes }
card:     { type: 'card',     name, card_number, expiration, cvv, notes }
bank:     { type: 'bank',     name, account_number, routing_number, swift_bic, notes }
```

`notes` is the underlying storage field for what the UI labels as either "Notes" (password/key) or "Comments" (card/bank).

### List-row UX per type

| Type | Masked column | Primary copy | Secondary copy |
|------|---------------|--------------|----------------|
| password | password | Pass | User (if username) |
| key | key | Key | — |
| card | card_number | Number | CVV |
| bank | account_number | Acct | Routing |

Routing number, SWIFT/BIC, and expiration are not treated as secrets — they are shown unmasked in the modal and accessible from the edit modal only (not on the list row, beyond the secondary copy button for routing).

Eye toggle on each row reveals the masked identifier for that row.

### Non-scope

- No card brand inference (Visa/MC/Amex) — fields are opaque strings.
- No input masks or validation — plain text inputs.
- No type migration for existing entries (none would have `card`/`bank` type).
- No new backend route or schema change.

## Acceptance

- Can create, edit, and delete Credit Card and Bank Account entries.
- Tab-style selector switches between all four types.
- Existing password/key entries are unaffected.
- Sensitive fields (card_number, cvv, account_number) are masked by default in both the modal and the list, with reveal/copy actions.
- Comments persist correctly across save → reload → unlock cycles.
- Filter search matches name plus the primary identifier per type.

## Notes

Master-password rotation (`changePassword()` in the vault store) already iterates over every encrypted blob and re-encrypts it, so it works unchanged for the new types — the records are opaque JSON to the rotation code.
