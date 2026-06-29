# CR010 — User Settings: Email & Display Preferences

**Status:** Open
**Origin:** Backlog (archived dev plan § 11)

## Goal

Extend the existing Settings view (which already supports password change and theme selection) with email change and display preferences.

## Scope

- Email change: form + email-confirmation flow, write to `users.email`.
- Display preferences (initial set): default landing view (Notes / Inbox / Tasks / Ideas), default sort order, density toggle.
- Persist preferences server-side so they follow the user across devices.

## Acceptance Criteria

- Email change requires current-password re-auth.
- Display preferences round-trip through reload.
- Existing theme picker (already shipped) remains untouched.

## Notes

Password change shipped 2026-04-11. Theme picker (Sapphire / Dark / Light) shipped 2026-04-18. This CR covers only the still-pending email and display-preference work.
