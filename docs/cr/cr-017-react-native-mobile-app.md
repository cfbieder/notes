# CR017 — React Native Mobile App (iOS first)

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)

## Goal

Native iOS app (Android follows) for offline capture, voice notes, and reading on the go — replacing the current PWA-on-mobile path where the installed Android PWA showed degraded behaviour.

## Scope

- React Native shell consuming the existing `/api/v1/*` endpoints.
- Mirror of mobile web layout (Home grid, MobileEditor, MobileFAB, voice capture).
- Native push notifications for reminders.
- Better offline outbox than the web IndexedDB version.

## Acceptance Criteria

- iOS app available via TestFlight, hits the existing Tailscale-hosted API.
- Quick capture works offline and syncs on reconnect.
- Voice capture uses native MediaRecorder equivalent.
- Reminders fire as native push notifications.

## Notes

The "Installed Android PWA degraded" observation (saved in user memory) is the proximate motivation — native shell sidesteps the WebAPK / service-worker quirks observed in production.
