# PROJECT_DESCRIPTION.md

# Noted — Personal Knowledge & Task Management App

> Self-hosted, Markdown-first note-taking app combining Evernote's organizational depth with Obsidian's knowledge graph model. Built for personal use first, designed to scale to multi-user collaboration.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Philosophy](#2-core-philosophy)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Feature Specification](#5-feature-specification)
6. [Data Model](#6-data-model)
7. [API Design](#7-api-design)
8. [Frontend Structure](#8-frontend-structure)
9. [Development Stages](#9-development-stages)
10. [Folder Structure](#10-folder-structure)
11. [Development Workflow](#11-development-workflow)
12. [Non-Goals](#12-non-goals)

---

## 1. Project Overview

**App name:** Noted (working title)
**Type:** Self-hosted web application with PWA support
**Primary user:** Single user (personal), multi-user in later stages
**Hosting:** Self-hosted on KVM VM, accessed remotely via Tailscale
**Development approach:** Claude Code AI-assisted, steady pace alongside other projects

### Problem Statement

Existing tools force a choice: Evernote gives you organization and capture but weak linking; Obsidian gives you a powerful knowledge graph but no structured task management or quick capture. This app combines:

- Evernote's hierarchical notebooks, tags, reminders, web clipper, and file attachments
- Obsidian's bidirectional wikilinks, graph view, and Markdown-first editing
- A GTD-style inbox for frictionless capture with deferred organization
- A tag system that doubles as a concept-linking layer (bridging both paradigms)

---

## 2. Core Philosophy

### Capture first, organize later

A global quick-capture inbox lets ideas, tasks, and notes land instantly without breaking flow. Items are processed and allocated to projects/notes asynchronously.

### Markdown-first, always

Notes are stored as Markdown. The editor renders inline (TypeDown-style Normal Mode) but raw source is always one toggle away (Source Mode). No proprietary format lock-in.

### Tags as a knowledge graph

Tags are not just labels — they are first-class concept nodes. Both `[[wikilinks]]` and `#tags` create edges in the graph, giving two complementary ways to connect knowledge across the notebook hierarchy.

### Self-hosted, privacy-first

All data lives on a personal VM. No third-party cloud. Tailscale provides encrypted remote access without exposing ports. The architecture is designed so migration to another host is trivial (standard PostgreSQL + file storage).

### Designed to scale

Single-user now, but auth, data model, and API are architected for multi-user from day one. Adding a second user should not require rearchitecting.

---

## 3. Tech Stack

### Frontend

| Layer      | Choice                                | Rationale                                         |
| ---------- | ------------------------------------- | ------------------------------------------------- |
| Framework  | Vue.js 3 (Composition API)            | Readable reactivity model, strong ecosystem       |
| Build tool | Vite                                  | Fast HMR, excellent Vue support                   |
| Editor     | CodeMirror 6                          | Extensible, supports inline Markdown rendering    |
| Graph view | D3.js (force-directed)                | Industry standard for interactive graph rendering |
| PWA        | Vite PWA plugin                       | Service worker, manifest, offline shell           |
| Styling    | CSS custom properties + scoped styles | No heavy UI framework overhead                    |

### Backend

| Layer        | Choice                                 | Rationale                                       |
| ------------ | -------------------------------------- | ----------------------------------------------- |
| Runtime      | Node.js (LTS)                          | Full-stack JS coherence with Vue frontend       |
| Framework    | Fastify                                | Fast, low overhead, excellent plugin ecosystem  |
| Auth         | JWT (jsonwebtoken / jose)              | Stateless, scales naturally to multi-user       |
| File storage | Local filesystem (VM)                  | Simple for self-hosted; S3-compatible API later |
| Search       | PostgreSQL full-text search (tsvector) | Built-in, no extra service in Stage 1           |

### Database

| Layer        | Choice             | Rationale                                          |
| ------------ | ------------------ | -------------------------------------------------- |
| Primary DB   | PostgreSQL 16      | Relational model suits graph queries (tags, links) |
| Note content | TEXT column (raw Markdown) | Markdown-first, no proprietary encoding     |
| Full-text    | `tsvector` generated columns on notes and attachments | Native Postgres FTS, no extra service |
| Future AI    | pgvector extension | Semantic search without a separate vector DB       |
| Migrations   | Forward-only numbered SQL files in `backend/migrations/` (custom runner in `backend/src/utils/migrate.js`) | Simple, auditable, no ORM coupling |

### Infrastructure

| Layer           | Choice                                 |
| --------------- | -------------------------------------- |
| Host            | KVM VM (Gigabyte X570 / Ryzen 9 5950X) |
| Remote access   | Tailscale                              |
| Process manager | PM2                                    |
| Reverse proxy   | Nginx (SSL termination)                |
| Backups         | pg_dump + cron to backup directory     |

---

## 4. Architecture Overview

```
Browser / PWA
     │
     ▼
  Vue.js 3 SPA  ──── CodeMirror 6 (editor)
     │                D3.js (graph view)
     │                Offline outbox (IndexedDB) for quick capture
     │ HTTP/REST
     ▼
  Fastify API (Node.js)
     │
     ├── Auth module (JWT + refresh)
     ├── Notes module (+ soft delete / trash)
     ├── Notebooks module
     ├── Tags module
     ├── Links module (wikilinks graph)
     ├── Tasks / Inbox module
     ├── Search module (notes + attachment OCR)
     ├── Attachments module (+ OCR via LLM gateway)
     ├── Reminders module
     └── Integrations module (Google Drive import)
     │
     ▼
  PostgreSQL
     ├── notes (TEXT content, tsvector, deleted_at, client_id)
     ├── notebooks
     ├── tags
     ├── note_tags (junction)
     ├── note_links (bidirectional)
     ├── tasks (inbox + allocated)
     ├── attachments (+ ocr_text, ocr_tsv)
     ├── integrations + import_history (OAuth config + Drive import log)
     └── users
```

All components run on the same VM. Tailscale handles encrypted access from any device.

---

## 5. Feature Specification

### 5.1 Editor (Stage 1)

The core editing experience is inspired by TypeDown:

- **Normal Mode:** Markdown renders inline as you type. Typing `### ` followed by text immediately displays as a formatted H3. Bold, italic, code, lists, and checkboxes all render inline.
- **Source Mode:** Toggle to raw Markdown at any time. All syntax visible, no rendering.
- **Wikilinks:** Typing `[[` triggers an autocomplete dropdown of existing note titles. Selecting creates a bidirectional link.
- **Hashtags:** Typing `#` triggers tag autocomplete. Tags are stored relationally and render as styled pills in Normal Mode.
- **Checkboxes:** `- [ ]` and `- [x]` render as interactive checkboxes. Checking one updates note content.
- **Tables:** Full Markdown table support with tab-navigation between cells.
- **Code blocks:** Syntax highlighting via CodeMirror's language packages.
- **Autosave:** Debounced autosave (500ms after last keystroke). Save indicator in toolbar.

### 5.2 Notebooks & Stacks (Stage 1)

- **Notebooks:** Named collections of notes. Each note belongs to exactly one notebook.
- **Stacks:** Groups of notebooks (one level of nesting, matching Evernote's model).
- **Default notebook:** An "Inbox" notebook is always present and is the default for new notes.
- **Sidebar:** Collapsible tree view of stacks → notebooks → (note count).
- **Drag-and-drop:** Notes can be moved between notebooks via drag-and-drop in the sidebar.

### 5.3 Tags (Stage 1 + Stage 2)

Tags serve a dual purpose:

**Stage 1 — organizational labels:**

- Notes can have multiple tags.
- Tag browser in sidebar shows all tags with note counts.
- Clicking a tag filters the note list to tagged notes.
- Tags are stored in a dedicated `tags` table (not as inline text) for reliable querying.

**Stage 2 — concept graph nodes:**

- Tags become nodes in the graph view alongside notes.
- A tag node connects all notes that share it, visualizing concept clusters.
- Combined with `[[wikilinks]]`, this creates a rich, dual-layer knowledge graph.

### 5.4 Quick Capture Inbox (Stage 1)

A GTD-inspired frictionless capture system:

- **Global capture shortcut:** Keyboard shortcut (e.g., `Ctrl+Shift+N`) opens a floating capture modal from anywhere in the app.
- **Capture types:** Plain note, task/to-do, or idea. Ideas are a distinct `note_type` and live in a dedicated **Ideas** section rather than the Inbox.
- **Inbox view:** A dedicated "Inbox" view shows all unallocated *note* captures in reverse chronological order.
- **Ideas view:** A dedicated **💡 Ideas** view (sidebar entry + `Alt+I` shortcut, mobile home card) for notebook-less, pre-allocation captures. Each idea can be **promoted** to a regular note in a chosen notebook, **moved to a note** (appended as a bullet to an existing note's body, source soft-deleted), opened, or trashed — all actions available both from the Ideas list and from the editor toolbar when viewing an idea. Ideas are first-class across the app — they appear in All Notes, Search, Graph, and Tag views, distinguished by a 💡 chip rendered from `note_type`.
- **Processing:** Each inbox item can be: converted to a full note, added as a task to an existing note, moved to a notebook, or discarded.
- **No friction:** The capture modal requires zero allocation decisions upfront.

### 5.5 Tasks & Reminders (Stage 1)

- **Inline tasks:** `- [ ]` checkboxes in any note create tasks linked to that note.
- **Due dates:** Tasks can have a due date set via a date picker inline or in the task detail panel.
- **Reminders:** Notes and tasks can have reminders that surface in a Reminders panel.
- **Task list view:** A dedicated view shows all tasks across all notes, filterable by status (open / done) and due date.
- **Inbox tasks:** Tasks created via quick capture live in the inbox until allocated to a note.

### 5.6 Search (Stage 1)

- **Full-text search:** PostgreSQL `tsvector` full-text search across note titles and content.
- **Attachment OCR search (implemented):** Attachments have an `ocr_text` / `ocr_tsv` column; a note matches if either the note body or any of its attachments' OCR text matches the query. OCR is produced via the local LLM/OCR gateway on upload (see migration `007_attachment_ocr_search.sql`).
- **Filters:** Search results can be filtered by notebook, tag, date range, or attachment type.
- **Keyboard-first:** Search triggered by `Ctrl+K` (command palette style). Results navigate with arrow keys.
- **Soft-delete aware:** Search excludes trashed notes (`deleted_at IS NULL`), matching the rest of the app.
- **Stage 3 — semantic search:** pgvector embeddings for "find notes similar to this concept" queries.

### 5.6.1 Note Translation (Phase 8.11, implemented)

- **Action:** Toolbar button on the note editor → modal with "From" and "To" language selectors (28 common languages) → calls `POST /api/v1/notes/:id/translate`.
- **Pipeline:** Backend reads the note content, calls `llmService.translateText` → LLM gateway `POST /translate` → appends the translation below the original under a `---` divider and `**Translated (xx → yy):**` header. Both the original and the translation remain in the note body and are full-text-searchable.
- **Truncation:** Long notes are truncated at `LLM_TRANSLATE_MAX_CHARS` (default 8000) because local LLM throughput can't generate a full Wikipedia article before the request times out. The resulting note shows a visible `_(translation truncated at N characters…)_` marker.
- **Timeouts:** nginx proxy timeouts bumped to 180s, backend `LLM_TRANSLATE_TIMEOUT_MS` 150s — both comfortably above typical translation time for the truncated payload.
- **Failure modes:** Gateway unreachable → HTTP 502 with a helpful message (note is untouched). `LLM_ENABLED=false` → HTTP 503. Empty-content note → HTTP 400.
- **Replaces earlier "translate on clip":** The web clipper originally had a translate checkbox in v0.2.0, but long-article translations exceeded the sync request window. The feature was moved to the main app in clipper v0.3.0 and backend Phase 8.11 above.

### 5.7 File Attachments (Stage 1)

- **Supported types:** Images (PNG, JPG, GIF, WebP), PDFs, and common document types (DOCX, XLSX, TXT).
- **Inline images:** Images render inline in Normal Mode.
- **PDF preview:** PDFs show a thumbnail; clicking opens in a panel or browser tab.
- **Storage:** Files stored on VM filesystem in a structured directory (`/attachments/{year}/{month}/{note_id}/`).
- **Metadata:** File size, type, and original filename stored in `attachments` table.
- **Upload:** Drag-and-drop into note body or via toolbar button.

### 5.8 Bidirectional Links & Backlinks (Stage 2)

- **Wikilinks:** `[[Note Title]]` creates a link from the current note to the target note.
- **Auto-linking:** When a note title is typed in `[[...]]`, it resolves to the note's UUID internally (survives renames).
- **Backlinks panel:** A collapsible panel in the note view lists all notes that link to the current note, with context snippets.
- **Unlinked mentions:** Panel also shows notes that mention the current note's title without a wikilink (Obsidian-style).
- **Broken links:** Links to deleted notes are visually flagged. User can reassign or remove.

### 5.9 Graph View (Stage 2)

- **Force-directed graph:** D3.js renders all notes and tags as nodes, with links and tag relationships as edges.
- **Node types:** Note nodes (circular), tag nodes (smaller, distinct color), notebook clusters (background grouping).
- **Interactions:** Click a node to open the note. Hover to see the note title and connection count. Drag to reposition.
- **Filters:** Toggle visibility of tag nodes, orphan notes, or specific notebooks.
- **Local graph:** Each note view has a miniature local graph showing only that note's direct connections (1 degree).

### 5.10 Web Clipper (Stage 2, implemented)

- **Browser extension:** Chrome Manifest V3 extension lives in `clipper/`. Unpacked-loadable for dev pointing at `http://localhost:3001/api/v1`; same bundle works against the production Tailscale host by changing the API base URL in the options page.
- **Clip modes:** `article` (Readability.js → Turndown Markdown), `selection` (selection HTML → Markdown, falls back to plain text), `screenshot` (`chrome.tabs.captureVisibleTab` → PNG data URL → attachment), and `link` (URL + title only).
- **Auth:** Username/password in the options page; extension stores `accessToken` + `refreshToken` in `chrome.storage.local` and auto-refreshes on 401. Future work (Phase 8) replaces this with personal API tokens.
- **API:** `POST /api/v1/clips` creates the note (with `source_url` tracked via migration 008). Screenshot clips also create an attachment, which automatically flows through the existing OCR pipeline (§5.7) so screenshotted text is searchable.
- **Destination:** Notebook picker, comma-separated tag input (tags upserted on the fly), and a "send to inbox" toggle. Selecting no notebook defaults to inbox.
- **Context menu:** Right-click a selection → "Clip selection to Noted" posts a selection clip directly without opening the popup.
- **Translate** is **not** part of the clipper anymore (removed in v0.3.0). It lives on the main app as a per-note toolbar action — see §5.6.1 below.
- **CORS:** Backend allows `chrome-extension://<id>` origins in addition to the configured web origin.
- **Tests:** `backend/tests/phase7-clips.test.js` covers all four modes, validation errors, auth, and search integration.

### 5.11 Authentication (Stage 1)

- **JWT-based:** Access token (short-lived, 15 min) + refresh token (long-lived, 30 days, stored in httpOnly cookie).
- **Login page:** Username + password. bcrypt password hashing.
- **Protected routes:** All API endpoints require valid JWT. Frontend redirects to login on 401.
- **Multi-user ready:** `users` table exists from day one. All data rows include `user_id` foreign key.

### 5.12 Trash / Soft Delete (implemented)

- **Soft delete:** `DELETE /api/v1/notes/:id` sets `deleted_at` rather than removing the row (see `backend/migrations/002_soft_delete.sql`).
- **Trash view:** `/trash` route lists soft-deleted notes with restore and permanent-delete actions.
- **Exclusion from app surfaces:** Notes list, graph, backlinks, link resolution, and search all filter on `deleted_at IS NULL`. Trashed notes appear as broken links in wikilink resolution.
- **Restore:** Clears `deleted_at`. Permanent delete hard-removes the row and its attachments on disk.

### 5.13 Google Drive Import (implemented)

- **OAuth integration:** User authorizes Google Drive via the Settings page. Credentials are stored server-side.
- **Folder targeting:** User selects one or more Drive folders; markdown and supported file types are imported as notes/attachments.
- **Polling:** `drivePoller` runs on an interval and imports new/changed files idempotently.
- **Manual scan:** A "Scan now" action in Settings triggers an immediate sync.
- **Code:** `backend/src/services/driveImporter.js`, `backend/src/services/drivePoller.js`, `backend/src/routes/integrations.js`, `frontend/src/views/SettingsView.vue`.

### 5.14 Offline Quick Capture (implemented)

- **IndexedDB outbox:** Quick-capture submissions while offline (or mid-request failure) are enqueued in an IndexedDB outbox (`frontend/src/lib/offlineOutbox.js`) and replayed when the network returns.
- **Idempotent replay:** Each outbox entry carries a client-generated UUID (`client_id`). The backend `notes` table has a unique index on `(user_id, client_id)` (migration `006_offline_client_id.sql`) so replayed captures cannot create duplicates.
- **UX:** Quick capture modal surfaces pending-outbox state and replay progress.
- **PWA status:** Works reliably in a Chrome tab; installed Android PWA support is degraded and de-prioritized.

### 5.15 Settings (implemented)

- **Settings view (`/settings`):** Password change, Google Drive integration config/scan, and account-level preferences.

---

## 6. Data Model

### Core Tables

```sql
-- Users (multi-user ready from day 1)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Notebooks
CREATE TABLE notebooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  stack_id    UUID REFERENCES stacks(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Stacks (groups of notebooks)
CREATE TABLE stacks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Notes (migrations 001, 002 soft-delete, 006 offline client_id, 008 clipper source_url)
CREATE TABLE notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  content     TEXT NOT NULL DEFAULT '',           -- Raw Markdown
  content_tsv TSVECTOR GENERATED ALWAYS AS (
                to_tsvector('english', title || ' ' || content)
              ) STORED,                           -- Full-text search index
  is_inbox    BOOLEAN DEFAULT FALSE,              -- Quick capture items
  pinned      BOOLEAN DEFAULT FALSE,
  client_id   UUID,                               -- Idempotency for offline outbox replay
  source_url  TEXT,                               -- Origin URL for web-clipper notes (migration 008)
  deleted_at  TIMESTAMPTZ,                        -- Soft delete / trash (NULL = live)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, client_id)
);
CREATE INDEX notes_tsv_idx ON notes USING GIN(content_tsv);
CREATE INDEX notes_user_live_idx ON notes(user_id) WHERE deleted_at IS NULL;

-- Tags
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,                               -- Optional hex color
  UNIQUE(user_id, name)
);

-- Note <-> Tag junction
CREATE TABLE note_tags (
  note_id     UUID REFERENCES notes(id) ON DELETE CASCADE,
  tag_id      UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- Bidirectional links between notes (wikilinks)
CREATE TABLE note_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  context_snippet TEXT,                           -- Surrounding text for backlinks panel
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_note_id, target_note_id)
);

-- Tasks (inbox + allocated)
CREATE TABLE tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  note_id     UUID REFERENCES notes(id) ON DELETE SET NULL,  -- NULL = inbox
  content     TEXT NOT NULL,
  is_done     BOOLEAN DEFAULT FALSE,
  due_date    DATE,
  reminder_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- File attachments (migration 007 adds OCR search columns)
CREATE TABLE attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      UUID REFERENCES notes(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  storage_path TEXT NOT NULL,                     -- Relative path on filesystem
  ocr_text     TEXT,                              -- Extracted text (images, PDFs) via LLM/OCR gateway
  ocr_tsv      TSVECTOR,                          -- Generated FTS index over ocr_text (migration 007)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX attachments_ocr_tsv_idx ON attachments USING GIN(ocr_tsv);

-- Integrations (migration 004) — generic per-provider OAuth/config store.
-- Currently used by Google Drive; schema is provider-agnostic so future
-- integrations (e.g. Dropbox, Notion import) can reuse it.
CREATE TABLE integrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL,                  -- e.g. 'google_drive'
  access_token   TEXT,
  refresh_token  TEXT,
  token_expiry   TIMESTAMPTZ,
  config         JSONB NOT NULL DEFAULT '{}',    -- folder IDs, target notebook, poll interval
  enabled        BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Per-file import log — provides idempotency for the Drive poller
-- (drive_file_id is checked before creating a note) and a user-facing history.
CREATE TABLE import_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id  UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  drive_file_id   TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  mime_type       TEXT,
  note_id         UUID REFERENCES notes(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'success',
  error_message   TEXT,
  imported_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX import_history_user_idx       ON import_history(user_id);
CREATE INDEX import_history_drive_file_idx ON import_history(drive_file_id);
CREATE INDEX import_history_imported_at_idx ON import_history(imported_at DESC);
```

---

## 7. API Design

All endpoints are prefixed with `/api/v1`. JWT token required in `Authorization: Bearer <token>` header for all routes except auth.

### Auth

```
POST   /api/v1/auth/login          Body: { username, password }
POST   /api/v1/auth/refresh         Uses httpOnly refresh token cookie
POST   /api/v1/auth/logout
```

### Notes

```
GET    /api/v1/notes                Query: notebook_id, tag_id, search, is_inbox, limit, offset (excludes trashed)
POST   /api/v1/notes                Body: { title, content, notebook_id, tag_ids, client_id? }
GET    /api/v1/notes/:id
PUT    /api/v1/notes/:id            Body: { title, content, notebook_id, tag_ids, pinned }
DELETE /api/v1/notes/:id            Soft delete — sets deleted_at
GET    /api/v1/notes/trash          Lists soft-deleted notes for the user
POST   /api/v1/notes/:id/restore    Clears deleted_at
DELETE /api/v1/notes/:id?hard=true  Permanent delete (removes row + attachments on disk)
GET    /api/v1/notes/:id/backlinks  Returns notes linking to this note
GET    /api/v1/notes/:id/graph      Returns local graph data (nodes + edges, 1 degree)
```

`client_id` on `POST /notes` supports the offline outbox: replays with the same `(user_id, client_id)` resolve to the existing note instead of creating a duplicate.

### Notebooks & Stacks

```
GET    /api/v1/notebooks
POST   /api/v1/notebooks            Body: { name, stack_id }
PUT    /api/v1/notebooks/:id
DELETE /api/v1/notebooks/:id
GET    /api/v1/stacks
POST   /api/v1/stacks               Body: { name }
PUT    /api/v1/stacks/:id
DELETE /api/v1/stacks/:id
```

### Tags

```
GET    /api/v1/tags                 Returns all tags with note counts
POST   /api/v1/tags                 Body: { name, color }
PUT    /api/v1/tags/:id
DELETE /api/v1/tags/:id
```

### Tasks

```
GET    /api/v1/tasks                Query: note_id, is_done, due_before, due_after
POST   /api/v1/tasks                Body: { content, note_id, due_date, reminder_at }
PUT    /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
GET    /api/v1/tasks/inbox          All tasks with note_id = NULL
```

### Graph

```
GET    /api/v1/graph                Full graph: all notes, tags, and edges for user
```

### Attachments

```
POST   /api/v1/notes/:id/attachments  Multipart form upload (triggers async OCR)
GET    /api/v1/attachments/:id        Streams file (accepts bearer token via ?token= for inline rendering)
DELETE /api/v1/attachments/:id
```

> **Security note:** `GET /attachments/:id` currently accepts the JWT access token as a query-string parameter so `<img>` / `<iframe>` tags can render attachments inline without custom headers. This leaks the token into browser history, proxy logs, referrer headers, and any screenshot of the URL bar. This should either be replaced with short-lived signed attachment URLs (opaque token distinct from the JWT) or with cookie-based auth for this endpoint. *(Open issue — see §9 Backlog.)*

### Search

```
GET    /api/v1/search               Query: q, notebook_id, tag_id, from, to
                                    Matches on notes.content_tsv OR attachments.ocr_tsv
                                    Filters deleted_at IS NULL
```

### Web Clipper (Phase 7)

```
POST   /api/v1/clips                Body: { url, title?, content?, mode, notebook_id?,
                                             tag_names?, send_to_inbox?, screenshot_data_url? }
                                    mode ∈ { article, selection, screenshot, link }
                                    Creates a note with source_url set. In screenshot mode,
                                    also attaches the image and queues OCR automatically.
```

### Integrations — Google Drive

```
GET    /api/v1/integrations/drive/auth      Start OAuth flow
GET    /api/v1/integrations/drive/callback  OAuth callback
GET    /api/v1/integrations/drive/config    Current folder selection + status
PUT    /api/v1/integrations/drive/config    Update selected folders / target notebook
POST   /api/v1/integrations/drive/scan      Trigger immediate import scan
DELETE /api/v1/integrations/drive           Disconnect integration
```

---

## 8. Frontend Structure

### Views

- `/` → Redirect to `/notes`
- `/login` → Login page
- `/notes` → Note list + editor (three-pane layout: sidebar | list | editor)
- `/notes/:id` → Opens specific note in editor
- `/inbox` → Quick capture inbox view
- `/tasks` → All tasks view
- `/tags/:name` → Notes filtered by tag
- `/notebooks/:id` → Notes filtered by notebook
- `/graph` → Full graph view
- `/search` → Search results
- `/trash` → Soft-deleted notes (restore / permanent delete)
- `/settings` → Password change, Google Drive integration, account preferences

### Component Hierarchy

```
App.vue
├── AppSidebar.vue
│   ├── SidebarStacks.vue (stacks → notebooks tree)
│   ├── SidebarTags.vue
│   └── SidebarQuickCapture.vue (floating modal trigger)
├── NoteListPanel.vue
│   └── NoteListItem.vue
├── NoteEditor.vue
│   ├── EditorToolbar.vue
│   ├── CodeMirrorEditor.vue (core editor)
│   ├── AttachmentZone.vue
│   └── BacklinksPanel.vue
├── GraphView.vue (D3.js)
├── InboxView.vue
├── TasksView.vue
└── SearchView.vue
```

### State Management (Pinia)

```
useNotesStore       — note list, current note, CRUD operations
useNotebooksStore   — notebooks and stacks
useTagsStore        — tags with counts
useTasksStore       — tasks and inbox
useSearchStore      — search query and results
useGraphStore       — graph nodes and edges
useAuthStore        — JWT tokens, user session
useUIStore          — sidebar state, active view, editor mode (normal/source)
```

---

## 9. Development Stages

> **Note:** See `Documentation/DEVELOPMENT_PLAN.md` for the authoritative, in-progress tracker. This section is a high-level snapshot.

### Stage 1 — Web App MVP ✅ (shipped)

- [x] Project scaffold (monorepo: `/frontend`, `/backend`)
- [x] PostgreSQL schema + forward-only SQL migrations (custom runner)
- [x] Fastify API with JWT auth (access + refresh)
- [x] Vue.js SPA with Vite
- [x] CodeMirror 6 editor (Normal Mode + Source Mode toggle)
- [x] Notebooks & stacks CRUD + sidebar tree
- [x] Tags CRUD + tag browser
- [x] Full-text search (PostgreSQL tsvector)
- [x] Quick capture inbox modal (global shortcut)
- [x] Tasks panel (inline checkboxes + task list view)
- [x] Reminders (due dates + reminder timestamps)
- [x] File attachment upload + inline image rendering
- [x] PWA manifest + service worker (offline shell)
- [x] Nginx reverse proxy + Tailscale access (production deployed)
- [x] Soft delete / Trash view (migration 002)
- [x] Offline quick-capture outbox with idempotent replay (migration 006)

### Stage 2 — Knowledge Graph ✅ (shipped)

- [x] Bidirectional wikilink parsing + `note_links` table population
- [x] Wikilink autocomplete in editor
- [x] Backlinks panel in note view
- [x] Unlinked mentions detection
- [x] D3.js force-directed graph view (full + local)
- [x] Tag nodes in graph (concept clustering)
- [x] OCR for PDF/image attachments via local LLM/OCR gateway
- [x] OCR text included in full-text search index (migration 007)
- [x] Google Drive import integration (OAuth, polling, manual scan)
- [x] Web clipper browser extension (Chrome MV3) — article / selection / screenshot / link modes, Phase 7.1–7.3
- [x] Note translation (Phase 8.11) — toolbar action, appends translated block, 28 languages via LLM gateway

### Backlog / Known Issues

- **[Medium] Attachment bearer token in query string.** `GET /api/v1/attachments/:id?token=…` accepts the JWT via query string for inline rendering. Replace with short-lived signed URLs (opaque token, separate from JWT) or cookie-based auth on that endpoint only.
- **[Low] Installed Android PWA offline capture is degraded.** Works in a browser tab; investigation paused by decision.

### Stage 3 — Collaboration & AI (Future)

**Goal:** Extend to multi-user and add AI-powered features.

Deliverables:

- [ ] Multi-user workspaces (shared notebooks)
- [ ] Role-based access control (viewer / editor / admin)
- [ ] pgvector semantic search (local embeddings via LLM gateway — Phase 8.2/8.3)
- [ ] AI summarization of notes (local LLM via gateway — Phase 8.7)
- [ ] Smart tag suggestions (Phase 8.5)
- [ ] Electron desktop app wrapper
- [ ] React Native mobile app (iOS first)

---

## 10. Folder Structure

```
noted/
├── frontend/                    # Vue.js SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── CodeMirrorEditor.vue
│   │   │   │   ├── EditorToolbar.vue
│   │   │   │   └── BacklinksPanel.vue
│   │   │   ├── sidebar/
│   │   │   ├── graph/
│   │   │   └── ui/              # Generic UI components
│   │   ├── views/
│   │   ├── stores/              # Pinia stores
│   │   ├── composables/         # Vue composables
│   │   ├── lib/
│   │   │   ├── codemirror/      # CM6 extensions and config
│   │   │   └── graph/           # D3.js graph utilities
│   │   ├── router/
│   │   ├── api/                 # API client (fetch wrappers)
│   │   └── App.vue
│   ├── public/
│   │   └── manifest.json        # PWA manifest
│   ├── vite.config.js
│   └── package.json
│
├── backend/                     # Fastify API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── notes.js
│   │   │   ├── notebooks.js
│   │   │   ├── tags.js
│   │   │   ├── tasks.js
│   │   │   ├── attachments.js
│   │   │   ├── search.js
│   │   │   └── graph.js
│   │   ├── plugins/
│   │   │   ├── auth.js          # JWT plugin
│   │   │   ├── db.js            # PostgreSQL pool
│   │   │   └── multipart.js     # File upload
│   │   ├── services/
│   │   │   ├── linkParser.js    # Wikilink extraction
│   │   │   ├── searchService.js
│   │   │   └── graphService.js
│   │   └── app.js
│   ├── migrations/              # Numbered raw-SQL migration files (001_*, 002_*, …)
│   └── package.json
│
├── db/
│   └── seeds/                   # Development seed data
│
├── attachments/                 # File storage (gitignored)
│   └── {year}/{month}/{note_id}/
│
├── nginx/
│   └── noted.conf
│
├── CLAUDE.md                    # Claude Code project context
├── PROJECT_DESCRIPTION.md       # This file
└── docker-compose.yml           # Optional: local dev environment
```

---

## 11. Development Workflow

### Environment Setup

```bash
# Backend
cd backend && npm install
npm run migrate                 # Apply forward-only SQL migrations
npm run dev                     # Fastify dev server (port 3001, nodemon)

# Frontend
cd frontend && npm install
npm run dev                     # Vite dev server (port 5173)
```

### Environment Variables

**Backend `.env`:**

```
DATABASE_URL=postgresql://user:password@localhost:5432/noted
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<different-strong-secret>
ATTACHMENT_DIR=/path/to/attachments
PORT=3001
NODE_ENV=development
```

**Frontend `.env`:**

```
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

### Claude Code Integration

A `CLAUDE.md` file in the project root provides Claude Code with persistent context including:

- Tech stack decisions and rationale
- Naming conventions (camelCase JS, snake_case DB columns)
- API response format standards
- State management patterns
- Key files and their responsibilities
- Current stage and open tasks

### Git Workflow

- `main` — stable, deployed to VM
- `dev` — active development
- Feature branches: `feature/graph-view`, `feature/web-clipper`, etc.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)

### Deployment (VM)

```bash
# Backend
pm2 start backend/src/app.js --name noted-api

# Frontend (build + serve via Nginx)
cd frontend && npm run build
# Nginx serves /dist, proxies /api to port 3001
```

---

## 12. Non-Goals

The following are explicitly out of scope and will not be built:

- **Real-time collaborative editing** (Stage 3 only)
- **Native mobile app** (Stage 3 only — PWA covers mobile in Stage 1)
- **Third-party cloud sync** (self-hosted only by design)
- **Plugin system / extensibility API** (not planned)
- **Calendar integration** (reminders are internal only)
- **Email-to-note** (web clipper covers this use case)
- **Public note sharing** (private by design in Stage 1–2)
- **Whiteboard / canvas mode** (Obsidian Canvas not planned)
- **Daily notes** (quick capture inbox serves this function)

---

*Last updated: 2026-04-14*
*Status: Stages 1–2 shipped and deployed to production. Phase 7 (Web Clipper & OCR) complete; Phase 7.7 rescoped to the note-level translate action (Phase 8.11, also complete). Next up: remaining Phase 8 tasks (pgvector, semantic search, summarization, task extraction, "ask my notes", audio capture).*

---

## 13. UI Design System — "Sapphire Slate" Theme

The app uses a custom **Sapphire Slate** theme: a deep navy palette with high-contrast amber/orange accents for CTA elements. It balances the focus-friendly qualities of dark mode with the readability of a lighter navy base — avoiding the harshness of pure-black dark themes while remaining easy on the eyes for long writing sessions.

> **Design character:** Corporate yet modern. Clean, thin-stroke iconography. Minimal decoration. Depth created through layered navy backgrounds, not gradients or shadows.

---

### 13.1 Color Palette (CSS Custom Properties)

Add to your global CSS or `src/styles/theme.css`:

```css
:root {
  /* Backgrounds — three-tier depth hierarchy */
  --bg-main:    #1a3a6d;   /* Main app background */
  --bg-sidebar: #102a50;   /* Sidebar (darkest layer) */
  --bg-card:    #244a85;   /* Cards / containers (lightest layer) */

  /* Text */
  --text-primary:   #ffffff;   /* Primary headers and body */
  --text-secondary: #c4d9ff;   /* Muted labels / descriptions (adjusted for WCAG AA contrast) */
  --text-muted:     #6b8dbb;   /* Disabled / background text */

  /* Accents & Interaction */
  --accent-primary: #3a86ff;   /* Active links, buttons, focus rings */
  --accent-warn:    #ff9f1c;   /* High priority indicators / primary CTA buttons */
  --accent-success: #4cc9f0;   /* Progress bars, checkmarks, success states */

  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.1);

  /* Shadows — use on static containers only, not on the editor wrapper */
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

> **Contrast note:** `--text-secondary` has been adjusted from `#a0c4ff` to `#c4d9ff` to ensure WCAG AA compliance (4.5:1 ratio) against `--bg-card`. Always verify contrast when placing secondary text on card backgrounds.

---

### 13.2 Layout & Component Styles

```css
/* Base */
body {
  font-family: 'Inter', sans-serif;
  background-color: var(--bg-main);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

/* Sidebar */
.sidebar {
  background-color: var(--bg-sidebar);
  width: 260px;
  height: 100vh;
  padding: 24px 16px;
  border-right: 1px solid var(--border-subtle);
}

/* Cards / containers */
.card {
  background-color: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
}

/* Status badges */
.status-badge-high {
  background-color: rgba(255, 159, 28, 0.2);
  color: var(--accent-warn);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge-done {
  background-color: rgba(76, 201, 240, 0.15);
  color: var(--accent-success);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

/* Primary CTA button (amber) */
.btn-primary {
  background-color: var(--accent-warn);
  color: #1a1a1a;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.btn-primary:hover { opacity: 0.88; }

/* Secondary button (outlined) */
.btn-secondary {
  background-color: transparent;
  color: var(--accent-primary);
  border: 1px solid var(--accent-primary);
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.btn-secondary:hover { background-color: rgba(58, 134, 255, 0.1); }
```

---

### 13.3 Typography

| Role          | Font                                | Notes                                                             |
| ------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Body / UI     | **Inter** (Google Fonts)            | Designed for screen readability; standard for productivity apps   |
| Headings      | **Plus Jakarta Sans**               | Slightly rounder than Inter; adds warmth without being decorative |
| Code / editor | **JetBrains Mono** or **Fira Code** | Monospace for Source Mode and code blocks                         |

```css
/* Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap');

h1, h2, h3 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 600;
  color: var(--text-primary);
}

.editor-source-mode {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}
```

---

### 13.4 Icon Library

**Primary: Lucide Icons** *(strongly recommended)*

Clean, consistent, thin-stroke SVG icons. The Vue ecosystem has first-class support via `lucide-vue-next`.

```bash
npm install lucide-vue-next
```

```vue
<script setup>
import { FileText, Tag, Search, Inbox } from 'lucide-vue-next'
</script>

<template>
  <FileText :size="18" />
  <Tag :size="18" />
</template>
```

**Secondary: Phosphor Icons** — if duotone style is needed for illustration-weight icons (onboarding, empty states). The "Duotone" weight suits the Sapphire palette particularly well.

---

### 13.5 Illustrations & Empty States

For empty states ("No notes yet", "Inbox is clear") and onboarding screens:

| Resource                    | Usage                               | Notes                                                                 |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| **unDraw** (undraw.co)      | Empty states, feature illustrations | Set accent hex to `#3a86ff` — all illustrations update to match theme |
| **Humaaans** (humaaans.com) | Onboarding, welcome screens         | Mix-and-match people illustrations; fits tech/productivity aesthetic  |

Keep illustrations small and purposeful — one per empty state, no decorative use in populated views.

---

### 13.6 Three-Pane Layout Sketch

```
┌─────────────┬──────────────────┬────────────────────────────────┐
│  SIDEBAR    │   NOTE LIST      │   EDITOR                       │
│  #102a50    │   #1a3a6d        │   #1a3a6d                      │
│             │                  │                                │
│  Stacks     │  [Note title]    │  # Note Title                  │
│  Notebooks  │  tag · 2h ago    │                                │
│  Tags       │  ─────────────   │  Start writing in Markdown...  │
│  ─────────  │  [Note title]    │                                │
│  Inbox  (3) │  tag · yesterday │                                │
│  Tasks      │                  │  [[Link to another note]]      │
│             │                  │  #concept-tag                  │
│  [+ New]    │                  │  - [ ] Task item               │
└─────────────┴──────────────────┴────────────────────────────────┘
  260px           280px                  flex: 1
```

Background tiers create depth: sidebar (darkest) → list + editor (mid) → cards/modals (lightest). No gradients needed.

---

### 13.7 CodeMirror 6 Theme Integration

The editor must match the Sapphire Slate palette. Create a custom CodeMirror theme:

```javascript
// src/lib/codemirror/sapphireTheme.js
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const sapphireTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1a3a6d',
    color: '#ffffff',
    fontFamily: "'Inter', sans-serif",
    fontSize: '15px',
  },
  '.cm-content': { caretColor: '#ff9f1c' },
  '.cm-cursor': { borderLeftColor: '#ff9f1c' },
  '.cm-activeLine': { backgroundColor: 'rgba(58, 134, 255, 0.08)' },
  '.cm-selectionBackground': { backgroundColor: 'rgba(58, 134, 255, 0.25)' },
  '.cm-gutters': { backgroundColor: '#102a50', borderRight: '1px solid rgba(255,255,255,0.1)' },
})

export const sapphireHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.heading,   color: '#ffffff', fontWeight: '600' },
  { tag: tags.emphasis,  fontStyle: 'italic', color: '#c4d9ff' },
  { tag: tags.strong,    fontWeight: '700', color: '#ffffff' },
  { tag: tags.link,      color: '#3a86ff' },
  { tag: tags.url,       color: '#3a86ff', textDecoration: 'underline' },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', monospace", color: '#4cc9f0' },
  { tag: tags.comment,   color: '#6b8dbb', fontStyle: 'italic' },
]))
```
