# Phase 4 — Manual Testing Guide

> Attachments, Reminders, PWA, Mobile Home Screen
> Prerequisites: Backend on port 3001, frontend on port 5173, PostgreSQL running

---

## Automated Tests

```bash
# Run Phase 4 API tests (29 tests)
node backend/tests/phase4-api.test.js
```

---

## Manual Testing Checklist

### 4.1–4.2 Attachments API + File Storage

- [ ] **Upload a text file** — Open a note → click Attachments "↑" button → select a `.txt` file → verify it appears in the attachment list
- [ ] **Upload an image** — Upload a `.png` or `.jpg` file → verify it appears in list with image icon
- [ ] **Upload a PDF** — Upload a `.pdf` file → verify it appears with document icon
- [ ] **Download/open attachment** — Click an attachment filename → verify it opens in a new tab with correct content
- [ ] **Delete attachment** — Click the trash icon on an attachment → verify it disappears from the list
- [ ] **Drag-and-drop upload** — Drag a file from your desktop into the editor area → verify the drop overlay appears → drop → verify file uploads
- [ ] **File size limit** — Try uploading a file larger than 25MB → verify it's rejected with error
- [ ] **Disallowed file type** — Try uploading a `.sh` or `.exe` file → verify it's rejected
- [ ] **Storage path** — Check `backend/uploads/` directory → verify files are stored in `{year}/{month}/{noteId}/` structure
- [ ] **Image auto-insert** — Upload an image → verify `![filename](url)` is automatically appended to the note content

### 4.3–4.4 Upload UI + Inline Rendering

- [ ] **Attachment zone visibility** — Open a note → verify "Attachments (N)" bar appears below editor
- [ ] **Expand/collapse** — Click the attachment header → verify the list toggles visibility
- [ ] **Upload progress** — Upload a file → verify "Uploading..." text briefly appears
- [ ] **Inline image in Normal Mode** — Add `![alt](/api/v1/attachments/{id})` to a note → switch to Normal Mode → verify image renders inline (if CodeMirror rendering supports it)

### 4.5–4.6 Reminders System

- [ ] **Create task with reminder** — In Tasks view, create a task with a future date → verify it works
- [ ] **Reminders panel** — Click "Reminders" in the sidebar → verify the panel opens
- [ ] **Empty state** — With no reminders set, verify "No active reminders" message shows
- [ ] **Upcoming reminders** ��� Create a task with `reminder_at` set to the future (via API: `curl -X PUT .../tasks/:id -d '{"reminder_at":"2026-04-07T10:00:00Z"}'`) → open Reminders → verify it appears under "Upcoming"
- [ ] **Overdue reminders** — Set `reminder_at` to the past → open Reminders → verify it appears under "Overdue" with red styling
- [ ] **Overdue badge** — With overdue reminders, verify the red badge count appears next to "Reminders" in sidebar
- [ ] **Click reminder** — Click a reminder item → verify it navigates to the associated note
- [ ] **Panel close** — Click X or outside the panel → verify it closes

### 4.7–4.8 PWA Manifest + Service Worker

- [ ] **Build includes manifest** — Run `cd frontend && npx vite build` → verify `dist/manifest.webmanifest` exists
- [ ] **Service worker generated** — Verify `dist/sw.js` exists after build
- [ ] **Install prompt (production)** — Deploy built files → access via HTTPS → verify browser shows "Install app" option
- [ ] **Offline shell** — After first load, turn off network → reload → verify the app shell loads (may show cached data or offline message)
- [ ] **Asset caching** — Open DevTools → Application → Service Worker → verify it's registered
- [ ] **Manifest check** — DevTools → Application → Manifest → verify name, icons, theme_color, display: standalone

### 4.9 Drag-and-Drop Notes

- [ ] **Drag note to notebook** — In the note list, drag a note → hover over a notebook in the sidebar → verify the notebook highlights with a blue dashed border
- [ ] **Drop note on notebook** — Drop the note → verify it moves to that notebook
- [ ] **Note counts update** — After dropping, verify both source and destination notebook note counts update
- [ ] **Drag to stacked notebook** — Expand a stack → drag a note to a notebook within the stack → verify it works
- [ ] **Cross-stack move** — Drag a note from one stack's notebook to another stack's notebook → verify

### 4.10 Mobile FAB Button

- [ ] **Visibility** — Resize browser to < 768px → verify a round orange "+" button appears bottom-right
- [ ] **Hidden on desktop** — Resize to > 768px → verify the FAB is hidden
- [ ] **Tap/click** — Click the FAB → verify Quick Capture modal opens
- [ ] **On all views** — Navigate to Tasks, Inbox, Search views on mobile → verify FAB is present

### 4.11 Quick Capture Type Differentiation

- [ ] **Note capture** — Open Quick Capture (Alt+N) → select "Note" → type text → capture → verify it goes to inbox as a regular note
- [ ] **Task capture** — Select "Task" → type text → capture → verify it appears in Tasks view
- [ ] **Idea capture** — Select "Idea" → type text → capture → verify the note title is prefixed with "💡" and content starts with a blockquote
- [ ] **Idea in inbox** — After capturing an idea, go to Inbox → verify the idea note is there with the lightbulb prefix

### 4.12 Mobile Home Screen

- [ ] **Breakpoint activation** — Resize browser to < 768px → verify the mobile home screen appears (not the three-pane layout)
- [ ] **Desktop at > 768px** — Resize above 768px → verify the three-pane layout restores
- [ ] **App title** — Verify "Noted" title appears at top of mobile home
- [ ] **Hamburger menu** — Tap the hamburger icon → verify the sidebar slides in from the left as an overlay
- [ ] **Sidebar overlay close** — Tap outside the sidebar → verify it closes
- [ ] **Quick Note hero card** — Verify the full-width amber "Quick Note" card is at the top
- [ ] **Tap Quick Note** — Tap it → verify Quick Capture modal opens
- [ ] **Tasks card** — Verify Tasks card shows with open task count badge
- [ ] **Tap Tasks** — Tap it → verify navigates to /tasks
- [ ] **Inbox card** — Verify Inbox card shows with unprocessed count badge
- [ ] **Tap Inbox** — Tap → verify navigates to /inbox
- [ ] **Search card** — Tap → verify navigates to /search
- [ ] **Recent notes (collapsed)** — Verify "Recent (N)" header is visible, collapsed by default
- [ ] **Expand recent notes** — Tap the header → verify last 5 notes by `updated_at` appear
- [ ] **Tap a recent note** — Tap a note → verify it opens in the full-screen mobile editor
- [ ] **Mobile editor: back button** — In mobile editor, tap the back arrow → verify it returns to previous screen
- [ ] **Mobile editor: Source/Normal toggle** — Tap the S/N toggle → verify editor mode switches
- [ ] **Mobile editor: title editing** — Tap the title → edit → verify autosave works
- [ ] **Mobile editor: content editing** — Type in editor → verify autosave indicator works
- [ ] **Mobile editor: attachments** — Verify attachment zone appears at bottom of mobile editor

### Cross-Cutting Concerns

- [ ] **No regressions on desktop** — Full desktop E2E (login, create note, edit, search, tags, inbox, tasks, trash) still works
- [ ] **Auth guard on new endpoints** — Try accessing `/api/v1/attachments/:id` without token → verify 401
- [ ] **Auth guard on reminders** — Try `/api/v1/reminders` without token → verify 401
- [ ] **Error states** — Stop the backend → verify frontend degrades gracefully on mobile and desktop

---

## Test Environment

| Component | URL |
|-----------|-----|
| Frontend (dev) | http://localhost:5173 |
| Frontend (Tailscale) | http://100.119.240.123:5173 |
| Backend | http://localhost:3001 |
| Health check | http://localhost:3001/health |

**Dev credentials:** `dev` / `password123`

**Mobile testing:** Use Chrome DevTools → Device Toolbar (Ctrl+Shift+M) to simulate mobile viewports. Recommended: iPhone 14 (390x844), Pixel 7 (412x915).
