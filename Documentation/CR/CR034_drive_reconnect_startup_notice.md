# CR034 — Google Drive Reconnect Notice at App Startup

Status: Completed

## Problem

When the Google Drive OAuth token expires or is revoked, the poller pauses
sync and sets `auth_error` on the integration. The only place this surfaced
was the "Reconnect required" banner inside the Settings → Google Drive Import
card. A user who never opens Settings has no way to learn that their imports
have silently stopped — the app gives no app-wide signal.

## Goal

Tell the user, app-wide, that Drive sync is paused and needs re-authorization —
without a blocking modal, and in a way that remains discoverable after the
initial nudge is dismissed.

## Scope (implemented)

- **Startup toast** — On app load (gated on `authStore.isAuthenticated`),
  `App.vue` calls `integrationsStore.fetchStatus()` and, if
  `googleDrive.needsReconnect` is true, shows a sticky (`duration: 0`) warning
  toast: _"Google Drive sync is paused — reconnect required."_ with a
  **Reconnect** action button that routes to `/settings`. Wrapped in try/catch
  so a failed status check (e.g. offline) never nags.
- **Persistent nav dot** — `ActivityRail.vue` renders a small amber dot
  (`badge-dot badge-warning`) on the Settings icon whenever
  `googleDrive.needsReconnect` is true. This survives toast dismissal so the
  reminder stays visible until the user actually reconnects.
- **Auto-clear** — Both indicators read from the shared `integrations` store,
  whose `scanNow()` / reconnect flow already flips `needsReconnect` back to
  false on success, so no extra teardown is needed.
- `fetchStatus()` now runs once at startup regardless of which view is open;
  previously it was only called from the Settings view.

## Out of scope

- Re-showing suppression across reloads within the same paused period (the
  toast reappears each app load while reconnect is still pending — intentional;
  it is a real unresolved problem). A session-storage "shown this session"
  guard could be added later if it proves noisy.
- Any backend change — detection already exists (`auth_error` →
  `needsReconnect` via `GET /integrations/google-drive/status`).

## Acceptance

- With an expired/revoked Drive token, opening the app shows the sticky toast;
  clicking **Reconnect** lands on Settings.
- The Settings activity-rail icon shows an amber dot while reconnect is pending
  and clears after a successful reconnect/scan.
- With no Drive connection (or a healthy one), no toast and no dot appear.

## Touched files

- `frontend/src/App.vue` — startup `checkDriveReconnect()` + toast.
- `frontend/src/components/sidebar/ActivityRail.vue` — warning dot on Settings.
