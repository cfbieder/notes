# CR016 — Electron Desktop App Wrapper

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)

## Goal

Ship Noted as a native-feeling desktop app via Electron, hosting the existing Vue SPA.

## Scope

- Electron shell pointing at the production Tailscale URL (or a local backend in offline-first mode — TBD).
- Native window chrome, system tray icon, OS-level Quick Capture shortcut.
- Auto-update via electron-updater.
- Build pipelines for macOS (.dmg), Windows (.exe), Linux (.AppImage / .deb).

## Acceptance Criteria

- App launches, signs in, and behaves identically to the web SPA.
- Global shortcut opens Quick Capture from anywhere on the OS.
- Updates roll out via signed releases.

## Open Questions

- Bundle a local backend, or always require connectivity to the self-hosted server?
- Code signing certs (Apple Developer, Authenticode) — cost vs. user friction.
