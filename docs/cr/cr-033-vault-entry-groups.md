# CR033 — Vault: Optional Grouping Headers for Entries

**Status:** Completed

## Problem

Within each vault type tab (Passwords / Keys / Cards / Bank) entries render as one
flat alphabetical list. A user with many credentials has no way to cluster related
ones (e.g. "Work", "Personal", "Servers") under a common header.

## Scope

Add an **optional, free-text group** to every vault entry. Entries that share a
group name render together under a group header within their type tab. Entries
with no group fall into a trailing "Ungrouped" bucket. When nothing in the active
tab has a group, the list renders flat exactly as before (no visual change).

Because the vault is zero-knowledge, `group` lives **inside the encrypted record**
like every other field — no backend, migration, API, or schema change.

## Implementation

- **`frontend/src/stores/vault.js`** — `normaliseRecord()` now persists a trimmed
  `group` field for all four entry types (and on the undecryptable stub). It is
  encrypted/decrypted with the rest of the record.
- **`frontend/src/components/ui/VaultEntryModal.vue`** — new shared **Group**
  input (after Name, all types) with a `<datalist>` of existing group names for
  the entry's type, fed by a new `existingGroups` prop. Included in the save
  payload's `base`.
- **`frontend/src/views/VaultView.vue`** —
  - `groupedEntries` computed buckets `filteredEntries` by group; named groups
    sort alphabetically, ungrouped trails last. `hasNamedGroup` gates header
    rendering so a group-less tab stays flat.
  - `groupsForType` computed supplies the modal's autocomplete suggestions
    (keyed off the editing entry's type on edit, the active tab on create).
  - List template renders one `<section>` per group with a `.group-header`
    (name + count pill).
- **`frontend/src/lib/vaultExport.js`** — `stripEntry()` keeps `group` so the
  emergency-export HTML carries it.

## Acceptance

- Adding a group to an entry makes a header appear; clearing it returns the entry
  to "Ungrouped".
- Group autocomplete suggests names already used within the same type.
- A tab with no grouped entries looks identical to the pre-CR UI.
- Groups survive lock/unlock (they are part of the ciphertext) and emergency export.
- No backend/migration/API change; `npx vite build` clean.
