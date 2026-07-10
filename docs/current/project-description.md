# Noted — Personal Knowledge & Task Management App

> Self-hosted, Markdown-first note-taking app combining Evernote's organizational depth with Obsidian's knowledge graph model. Built for personal use first, designed to scale to multi-user collaboration.

> **Document role:** Authoritative description of the project's *current* state — what is built, how it works, the data model and APIs. Outstanding work lives in [docs/current/project-roadmap.md](docs/current/project-roadmap.md) and the [docs/cr/](docs/cr/) folder (canonical status table: [docs/cr/README.md](docs/cr/README.md)). The pre-reorg historical record of completed phases lives in [docs/archive/noted-development-plan_2026-04-25.md](docs/archive/noted-development-plan_2026-04-25.md).

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
     ├── Voice module (audio → Whisper transcription → idea)
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

### 5.0 Navigation Chrome — Activity Rail + Contextual Panel (CR026)

The desktop sidebar uses an **activity rail** + **contextual panel** pattern (VS Code / Obsidian / Linear style), implemented in [AppSidebar.vue](frontend/src/components/sidebar/AppSidebar.vue) as a thin shell wrapping [ActivityRail.vue](frontend/src/components/sidebar/ActivityRail.vue) and [ContextualPanel.vue](frontend/src/components/sidebar/ContextualPanel.vue).

- **Activity rail (48px, far left):** 8 primary icons — Notes, Tasks, Ideas, Reminders, Search, Graph, AI Assist, Vault — plus a bottom group of Trash + Settings. Route-target icons push routes; overlay icons (Reminders, AI Assist) toggle existing modals/popovers without changing the active rail item. Active item gets a left accent stripe and tinted background; tooltips show the keyboard shortcut.
- **Contextual panel (240px, right of rail):** content swaps based on `route.meta.rail`. The Notes panel hosts the previous sidebar's full content — Inbox/All filter rows, the Notebooks/stacks tree (with create/rename/drag-drop/context-menu/delete-with-confirm), and the Tags tree. Other panels (Tasks/Search/Graph/Ideas/Vault/Trash/Settings) are stubbed pending richer per-feature filter UI in follow-on slices; the architecture in place means filling them is incremental.
- **Keyboard shortcuts** ([useRailShortcuts.js](frontend/src/composables/useRailShortcuts.js)): `⌘1`–`⌘8` jump between rail items; `⌘B` toggles the panel collapsed (state persisted to `localStorage` as `noted.ui.railPanelCollapsed`). Shortcuts no-op while typing in an input/textarea/contenteditable so they don't fight the editor.
- **Theme tokens** (`--rail-bg`, `--rail-border`, `--rail-active`, `--rail-hover`) live in [theme.css](frontend/src/styles/theme.css) and are defined for Sapphire/Dark/Light so the rail can be tinted distinctly from the panel.
- **Mobile** continues to render `MobileLayout` instead of the desktop sidebar via `useMobile()`. A bottom-tab-bar adaptation of the rail is a follow-on.
- **Mobile drawer navigation:** On mobile, tapping the menu button opens `AppSidebar` as an overlay drawer. Picking **All Notes**, a notebook, or a tag from the drawer closes it automatically (route-change watch in [NotesView.vue](frontend/src/views/NotesView.vue)) and renders [MobileNotesList.vue](frontend/src/components/mobile/MobileNotesList.vue) — a header-plus-list view scoped to the chosen scope. Tapping a note opens `MobileEditor`; back returns to the list. As of v0.11.7, `/notes` (the redirect target from `/`) renders the All Notes list on mobile rather than the legacy `MobileHome` dashboard.
- **Mobile Home route + button (v0.11.8):** The dashboard now lives at a dedicated route `/home` (`name: 'Home'`). A Home icon button is present in [MobileNotesList.vue](frontend/src/components/mobile/MobileNotesList.vue) header (top-left) and [MobileLayout.vue](frontend/src/components/mobile/MobileLayout.vue) header (between Back and title); both call `router.push('/home')` so the user can hop to the dashboard from All Notes / Inbox / etc. On desktop `/home` falls through to the standard list layout (no editor pane until a note is picked).
- **Desktop list-only layout (v0.11.8):** On list-only routes (`Notes`, `NotebookNotes`, `TagNotes`, `Ideas`) the editor pane is hidden entirely and `NoteListPanel` expands to fill remaining width via an `expanded` prop (`flex: 1`, no right border) — mirroring Inbox's full-width list. The editor pane only renders for detail routes (`NoteDetail` / `IdeaDetail`); the "Select a note…" placeholder is replaced by a brief "Loading…" state during the fetch.
- **Sortable notes list columns (v0.11.13, CR030):** In expanded mode `NoteListPanel` renders as a two-column table — **Title** and **Last used** — with clickable sticky column headers that toggle sort key and direction (chevron icon marks the active column). Pinned notes always lead each sort group. Title sort uses `localeCompare` (case-insensitive); default sort remains `updated_at DESC` so the initial view matches what users saw before. Sorting is client-side over the already-fetched `notesStore.notes`. The narrow sidebar layout (when a note is open) is unchanged — still stacked title/preview/date cards in backend order. State is in-component (resets on hard navigation away from `/notes`).
- **Collapse only on detail routes (v0.11.26):** `NoteListPanel` is gated `v-if="!noteListCollapsed || !isDetailRoute"`. On a list-only route (All Notes / Notebook / Tag / Ideas) the list *is* the page, so a persisted `noted.ui.noteListCollapsed` flag is ignored and the list always renders — otherwise collapsing left the whole pane blank (no editor pane to fall back to). Collapse still hides the list on a note-detail route, where it focuses the open note.

### 5.1 Editor (Stage 1)

The core editing experience is inspired by TypeDown:

- **Normal Mode:** Markdown renders inline as you type. Typing `### ` followed by text immediately displays as a formatted H3. Bold, italic, code, lists, and checkboxes all render inline.
- **Source Mode:** Toggle to raw Markdown at any time. All syntax visible, no rendering.
- **Wikilinks:** Typing `[[` triggers an autocomplete dropdown of existing note titles. Selecting creates a bidirectional link.
- **Hashtags:** Typing `#` triggers tag autocomplete. Tags are stored relationally and render as styled pills in Normal Mode.
- **Checkboxes:** `- [ ]` and `- [x]` render as interactive checkboxes. Checking one updates note content.
- **Tables:** Full Markdown table support with tab-navigation between cells. GFM inline formatting (`**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[text](url)`) renders inside cells in Normal Mode via `markdown-it`'s `renderInline`.
- **Code blocks:** Syntax highlighting via CodeMirror's language packages.
- **Autosave:** Debounced autosave (500ms after last keystroke). Save indicator in toolbar.
- **Collapsible panels / focus mode:** The desktop three-pane layout supports collapsing the middle note list (`Alt+[`) and the bottom backlinks/graph/attachments stack (`Alt+]`) independently, or both at once via focus mode (`Alt+\`). Toggles are available in the editor toolbar (per-panel, when a note is open) and as a persistent Focus button in the sidebar footer. Collapsed state is persisted to `localStorage`.
- **Export as PDF (CR036):** Toolbar button (`FileDown` icon, labelled "Export as PDF") opens a print-friendly window with the note rendered as clean HTML — `markdown-it` for markdown notes, DOMPurify for HTML-format notes (CR023) — on a white background with Inter/Plus Jakarta Sans typography, proper page-break rules, and an "Exported <date>" header. Inline images load with auth tokens; wikilinks render as plain text. The browser's native print dialog produces a real, selectable-text `.pdf` via "Save as PDF" (and physical printing remains available from the same dialog); the note title is the document title, so it pre-fills the PDF filename. Available on desktop (EditorToolbar) and mobile (MobileEditor header — now passes `note.format` so HTML notes export with formatting). Same pipeline as `frontend/src/lib/printNote.js`. **HTML-note fidelity (v0.15.2):** the print window uses `sanitizeNoteHtmlSplit` with the same `.note-html` scope as the on-screen render and re-injects the note's scoped `<style>` CSS into the print `<head>`, plus `print-color-adjust: exact`, so themed HTML notes (dark backgrounds, cards, badges) export looking like they do on screen rather than as unstyled markup. (For dark themes, "Background graphics" must be enabled in the print dialog — Chrome honors `print-color-adjust` automatically.)
- **Multi-note editor tabs (CR037, desktop):** A tab strip at the top of the desktop editor pane keeps multiple notes open at once. Tabs are a thin UI over a persisted list of open note ids ([openTabs.js](frontend/src/stores/openTabs.js), `localStorage` key `noted:open-tabs`); the **active** tab is always derived from the route (`route.params.id`), not stored separately. Opening a note (list click, wikilink/backlink nav, direct URL) registers a tab; clicking a tab does a `router.push`, so the existing route watcher flushes the outgoing note's autosave before loading the incoming one — no per-tab live buffers. Closing the active tab jumps to a neighbour (or the list view when none remain); trashing or a hard 404 prunes the tab; renaming updates its label. Tabs survive reloads (malformed persisted data is ignored). Component: [EditorTabs.vue](frontend/src/components/editor/EditorTabs.vue). Desktop only — mobile keeps the single-note `MobileEditor` flow.

### 5.2 Notebooks & Stacks (Stage 1)

- **Notebooks:** Named collections of notes. Each note belongs to exactly one notebook.
- **Stacks:** Groups of notebooks (one level of nesting, matching Evernote's model).
- **Default notebook:** An "Inbox" notebook is always present and is the default for new notes. **Hidden from the sidebar Notebooks list** to avoid duplication with the top-level "Inbox" nav entry (both surface the same content). The notebook still exists in the DB and remains selectable in the notebook picker.
- **Inbox derivation (CR032):** "Inbox" is *not* a stored flag — it is derived from the note's notebook and type. The Inbox view (`/inbox` + sidebar entry) lists every non-trashed *note* (i.e. `note_type <> 'idea'`) whose `notebook_id IS NULL` or whose notebook is the user's `is_default=TRUE` notebook. Ideas are excluded explicitly because notebook-less ideas would otherwise be swept in by the NULL-notebook branch; they live in `/ideas`. Capture paths therefore only need to set (or omit) `notebook_id`; there is no companion flag to keep in sync. The list API supports `?in_inbox=true|false` as a derived filter. The earlier `notes.is_inbox` column was dropped in migration `019_drop_is_inbox.sql` after a class of drift bugs (e.g. right-click "Move to notebook" landing on Inbox without updating the flag) made the dual signal a recurring trap.
- **Sidebar:** Collapsible tree view of stacks → notebooks → (note count).
- **Drag-and-drop:** Notes can be moved between notebooks via drag-and-drop in the sidebar.
- **New Note context-aware target:** Clicking **+ New Note** while viewing a notebook (`/notebooks/:id`) creates the note inside that notebook. From any other view (All Notes, Tasks, Tags, etc.) the note falls through to the default notebook (Inbox).

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
- **Capture types:** Plain note, task/to-do, idea, or voice. Ideas are a distinct `note_type` and live in a dedicated **Ideas** section rather than the Inbox. Voice captures are recorded via MediaRecorder, transcribed via Whisper, and saved as ideas.
- **Inbox view:** A dedicated "Inbox" view shows all unallocated *note* captures in reverse chronological order. As of CR032, Inbox membership is *derived*: `note_type <> 'idea' AND (notebook_id IS NULL OR notebook.is_default = TRUE)`. Capture paths route into the Inbox by either leaving `notebook_id` NULL (Drive importer, "Send to Inbox" clipper toggle) or by assigning the user's default notebook (Quick Capture, AI Assist deep-think, file importer). Voice captures use `note_type='idea'` so they land in `/ideas` rather than Inbox. The list API exposes `?in_inbox=true|false` for the derived filter. No `is_inbox` column — the dual signal it created was the root cause of recurring drift bugs (migrations 015 and 019 are the two attempts to address this; 019 removed the column entirely).
- **Ideas view:** A dedicated **💡 Ideas** view (sidebar entry + `Alt+I` shortcut, mobile home card) for notebook-less, pre-allocation captures. Each idea can be **promoted** to a regular note in a chosen notebook, **moved to a note** (appended as a bullet to an existing note's body, source soft-deleted), **moved to a task** (creates a standalone inbox task with the idea's content, source soft-deleted), opened, or trashed — all actions available both from the Ideas list (the `→` button opens a Move popover with both options) and from the editor toolbar when viewing an idea. Ideas are first-class across the app — they appear in All Notes, Search, Graph, and Tag views, distinguished by a 💡 chip rendered from `note_type`.
- **Processing:** Each inbox item can be: converted to a full note, added as a task to an existing note, moved to a notebook, or discarded.
- **No friction:** The capture modal requires zero allocation decisions upfront.

### 5.5 Tasks & Reminders (Stage 1)

- **Inline tasks:** `- [ ]` checkboxes in any note create tasks linked to that note.
- **Due dates:** Tasks can have a due date set via a date picker inline or in the task detail panel.
- **Inline edit (CR024):** Each task row in the Tasks view exposes a pencil button (and double-click on the row) that swaps content, linked-note, and due-date into editable inputs. Enter / green check saves; Esc / X cancels. "No linked note" or empty due date clears those columns. `PUT /api/v1/tasks/:id` accepts `null` for `note_id` / `due_date` (cleared) and returns `note_title` via JOIN so the row updates immediately after relinking.
- **Reminders:** Notes and tasks can have `reminder_at` timestamps. A **ReminderPicker** dropdown (bell icon) provides quick presets (due-date-aware: "1h before due", "Morning of", "Day before"; universal: "In 1 hour", "Tomorrow 9 AM", "Next Monday 9 AM") plus custom datetime and clear. Available in the task add form, per-task rows, and the note editor toolbar.
- **Reminders panel:** Sidebar bell icon opens an overlay listing overdue (red) and upcoming reminders. Each row has **snooze** (15 min / 1 hour / Tomorrow 9 AM) and **dismiss** (clears reminder) action buttons. Click navigates to the linked note or Tasks view.
- **Reminder notifications:** 60-second background poll detects newly-due reminders and fires persistent **toast notifications** (with a two-tone chime sound) plus optional **browser Notification API** alerts. Session-deduped via `sessionStorage`.
- **Task list view:** A dedicated view shows all tasks across all notes, filterable by status (open / done) and due date.
- **Inbox tasks:** Tasks created via quick capture live in the inbox until allocated to a note.

### 5.6 Search (Stage 1)

- **Full-text search:** PostgreSQL `tsvector` full-text search across note titles and content.
- **Attachment OCR search (implemented):** Attachments have an `ocr_text` / `ocr_tsv` column; a note matches if either the note body or any of its attachments' OCR text matches the query. OCR is produced via the local LLM/OCR gateway on upload (see migration `007_attachment_ocr_search.sql`).
- **Filters:** Search results can be filtered by notebook, tag, date range, or attachment type.
- **Prefix filters (implemented):** Gmail-style search operators parsed from the query string. `from:drive` filters to Google Drive-imported notes, `is:auto-update` filters to notes with auto-update enabled. Filters can be combined with each other and with text queries. Quick-filter buttons shown below the search input; active filters appear as removable chips.
- **Keyboard-first:** Search triggered by `Ctrl+K` (command palette style). Results navigate with arrow keys.
- **Soft-delete aware:** Search excludes trashed notes (`deleted_at IS NULL`), matching the rest of the app.
- **Stage 3 — semantic search:** pgvector embeddings for "find notes similar to this concept" queries.

### 5.6.2 Keyboard Shortcuts & Help

All shortcuts are Alt-based (except `Ctrl+K` for search, matching palette convention), documented in an in-app `HelpModal` reachable via `Alt+/` or the sidebar-footer **Help** button. The Help modal also documents search filter syntax.

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Open search palette |
| `Alt+N` | Quick capture — new note |
| `Alt+I` | Quick capture — new idea |
| `Alt+V` | Quick capture — voice note |
| `Alt+[` | Toggle note list panel |
| `Alt+]` | Toggle backlinks / attachments panels |
| `Alt+\` | Focus mode — collapse both panels |
| `Alt+/` | Show help (shortcuts + search filters) |
| `Esc` | Close active modal / palette |

**Search filters** (type in search bar or Ctrl+K palette):

| Filter | Result |
|---|---|
| `from:drive` | All Google Drive-imported notes |
| `is:auto-update` | Notes with auto-update enabled |
| `from:drive is:auto-update` | Drive notes with auto-update on |
| `from:drive <text>` | Drive notes matching text query |

### 5.6.1 Note Translation (Phase 8.11, implemented)

- **Action:** Toolbar button on the note editor → modal with "From" and "To" language selectors (28 common languages) → calls `POST /api/v1/notes/:id/translate`.
- **Pipeline:** Backend reads the note content, calls `llmService.translateText` → LLM gateway `POST /translate` → appends the translation below the original under a `---` divider and `**Translated (xx → yy):**` header. Both the original and the translation remain in the note body and are full-text-searchable.
- **Truncation:** Long notes are truncated at `LLM_TRANSLATE_MAX_CHARS` (default 8000) because local LLM throughput can't generate a full Wikipedia article before the request times out. The resulting note shows a visible `_(translation truncated at N characters…)_` marker.
- **Timeouts:** nginx proxy timeouts bumped to 180s, backend `LLM_TRANSLATE_TIMEOUT_MS` 150s — both comfortably above typical translation time for the truncated payload.
- **Failure modes:** Gateway unreachable → HTTP 502 with a helpful message (note is untouched). `LLM_ENABLED=false` → HTTP 503. Empty-content note → HTTP 400.
- **Replaces earlier "translate on clip":** The web clipper originally had a translate checkbox in v0.2.0, but long-article translations exceeded the sync request window. The feature was moved to the main app in clipper v0.3.0 and backend Phase 8.11 above.

### 5.6.3 Voice Note Capture (Phase 8.10, implemented)

- **Action:** Quick Capture modal gains a 4th "Voice" tab (Note/Task/Idea/Voice), accessible via `Alt+V` or the mobile home Voice card.
- **Recording:** Uses the browser `MediaRecorder` API to record WebM/Opus natively. 5-minute max recording, enforced client-side with a visible countdown.
- **Pipeline:** On stop, the audio blob is uploaded to `POST /api/v1/notes/voice`. The backend writes the audio to a temp file, calls `llmService.transcribeAudio()` → LLM gateway `POST /transcribe` (Whisper medium, CPU int8, auto-detect language), creates an **idea** (`note_type='idea'`, notebook-less — ideas live outside the Inbox by virtue of `note_type='idea'`, regardless of notebook) with the transcription as content, and saves the audio file as an attachment on the idea.
- **Why ideas:** Voice memos are raw, unprocessed thoughts. Landing them as ideas lets the user review the transcription and use the existing Promote (→ note in a notebook) or Move-to-note (→ append to an existing note) workflows.
- **Mobile:** The MobileHome 2x3 grid includes a Voice card in slot 6 that triggers Quick Capture in voice mode.
- **Graceful degradation:** Voice tab hidden if `MediaRecorder` API unavailable (old browsers); endpoint returns 503 if `LLM_ENABLED=false`; gateway unreachable → 502.

### 5.6.4 AI Assist (Phase 8.12, implemented — desktop only)

- **Action:** Sidebar entry "AI Assist" (sparkle icon) or `Cmd/Ctrl+Shift+A` opens a centered modal. Hidden on mobile (`useMobile()` breakpoint).
- **Mode toggle (CR019):** Header has a two-segment toggle — **Quick** (default, fast tier, streams into the preview pane) and **Deep think** (heavy tier, runs in the background, lands in the inbox). Replaces the earlier per-request model dropdown. Choice persists to `localStorage` (`noted.aiAssist.mode`).
- **Dismissal:** Modal exits only via explicit button — Cancel, Generate / Send to deep think, Discard, Save as note, or Insert at cursor. `Escape`, click-outside, and the header X button are intentionally inert so accidental dismissals don't lose a typed prompt or in-flight generation. `⌘/Ctrl+Enter` triggers Generate / Send to deep think.
- **Compose stage:** Prompt textarea + `NoteMultiPicker` (fuzzy search reuses `GET /notes?search=`, results render as removable chips). Live token gauge below the picker shows `~tokens / contextWindow` (configured via `LLM_CONTEXT_WINDOW`); turns amber at 85% (`warnTokens`) and red over limit. The user can still send when over limit — the LLM gateway truncates.
- **Quick pipeline:** `POST /api/v1/ai-assist/generate { prompt, noteIds[], mode: 'quick' }` concatenates the selected notes as `# {title}\n\n{body}` blocks, builds the final prompt, and calls `llmService.generateText({ taskName: 'noted_ai_assist_quick' })`. When `LLM_TASK_ENABLED=true` (default once ocr-llm ships the task) it routes via gateway `POST /task` with the registered fallback chain; otherwise it bridges via `POST /llm/generate` using `LLM_QUICK_MODEL` (default `phi4:14b`). Returns `{ output, model, provider, sources, estimatedTokens }`. Does **not** create a note.
- **Deep-think pipeline (CR019):** `POST /api/v1/ai-assist/jobs { prompt, noteIds[], mode: 'deep' }` inserts a row into `ai_assist_jobs` with `status='pending'` and returns `{ jobId }` immediately. An in-process runner (`backend/src/services/aiAssistJobRunner.js`) marks the row `running`, fetches the input notes, optionally condenses them, calls `llmService.generateText({ taskName: 'noted_ai_assist_deep' })` (or bridges via `LLM_DEEP_MODEL`, default `qwen3.6:35b-a3b-q4_K_M`), and on success creates an `is_ai_generated=true` note in the user's default notebook (which surfaces in `/inbox` via the CR032 derivation), body = LLM output + `## Sources` wikilinks, and writes `result_note_id`. On error: `status='failed'` with `error_message`. On `DELETE /jobs/:id`: aborts via `AbortController` and sets `status='cancelled'`.
- **Concurrency:** One active deep-think job per user. A second submission while one is `pending` or `running` returns `409 { code: 'job_in_progress' }`.
- **Pending pill + completion toasts (CR019):** `aiAssistStore.startJobsPolling(60000)` runs alongside the reminders poll. Each tick calls `GET /ai-assist/jobs`; in-flight jobs render as a small pill (`AIAssistPendingPill.vue`) next to the sidebar AI Assist entry, with elapsed time and a Cancel (×) button. Newly-completed jobs trigger a sticky success toast (*"Deep-think note ready: '{title}'"* + **View** action that opens the note); newly-failed jobs trigger an error toast. Deduped via `localStorage` (`noted.aiAssist.seenJobs`, capped at 200 IDs) so dismissed toasts don't re-fire on reload or in a new browser session.
- **Restart cleanup:** On app boot (`app.js` → `aiAssistJobRunner.failOrphanedJobs()`), any rows still `pending`/`running` are marked `failed` with `error_message='Server restarted while job was running'`. The frontend surfaces them on next poll.
- **Preview stage (quick mode only):** Modal switches to a preview pane with editable title (auto-suggested: `"AI: {first line truncated to 60 chars}"`) and editable body. Body has the LLM output followed by `## Sources` with `[[wikilinks]]` to each input note. Save calls `POST /notes` with `is_ai_generated=true` and `ai_prompt` persisted; existing wikilink sync creates backlinks automatically.
- **Endpoints:** `POST /ai-assist/generate` (quick, sync, supports streaming), `POST /ai-assist/jobs` (deep, async), `GET /ai-assist/jobs?status=...`, `GET /ai-assist/jobs/:id`, `DELETE /ai-assist/jobs/:id`, `GET /ai-assist/config` (returns `{ enabled, contextWindow, warnTokens, model, quickModel, deepModel, taskRouting, condenseModel, heavyAvailable, gatewayHealth }` — `heavyAvailable` is `true | false | null` based on a best-effort `GET /health` snapshot from the gateway), `POST /ai-assist/estimate` (pure utility for the live token gauge — no LLM call).
- **Heavy-tier-offline hint:** When `heavyAvailable === false`, the modal renders an extra warn line below the deep-mode hint: *"Heavy tier is offline — deep think will fall through to the cloud model. Expect ~5–10s longer than usual."* The fallback chain (`ollama_heavy → claude → ollama_mid`) keeps deep-think working without code changes; the hint just sets expectation. Hint disappears once the gateway reports the heavy tier as `connected` again.
- **Schema:** Migration `012_ai_generated_notes.sql` adds `is_ai_generated BOOLEAN` and `ai_prompt TEXT` to `notes`. Migration `016_ai_assist_jobs.sql` adds the `ai_assist_jobs` table (status enum, prompt, note_ids[], condense, model, result_note_id, error_message, timestamps) plus partial index on active jobs.
- **Env vars:** `LLM_QUICK_MODEL` (default `phi4:14b`), `LLM_DEEP_MODEL` (default `qwen3.6:35b-a3b-q4_K_M`), `LLM_TASK_ENABLED` (defaults to `true` in `.env.dev` and `.env.prod` — flip to `false` to bridge via `/llm/generate` if the gateway tasks are removed), `LLM_GENERATE_DEEP_TIMEOUT_MS` (default 600s — separate from the 180s quick-tier timeout). All wired through `docker-compose.prod.yml`.
- **Graceful degradation:** Returns 503 when `LLM_ENABLED=false`; 502 when the gateway is unreachable on the sync path. Deep-think jobs reach `failed` status with the gateway error in `error_message`. Modal shows a "disabled" state if the config endpoint reports `enabled: false`.
- **Streaming (8.12.1, quick mode only):** When `stream: true` is sent on `/generate`, the route hijacks the reply and writes NDJSON chunks (`{chunk: "..."}`) followed by a final `{done: true, sources, model, ...}` line. Frontend reads the response body as a `ReadableStream` and appends tokens to the preview as they arrive. `X-Accel-Buffering: no` keeps nginx from buffering the stream.
- **Prompt history (8.12.1):** Last 20 prompts persist to localStorage (`noted.aiAssist.history`). Dropdown under the prompt textarea — click to refill. Dedupes on insertion; "Clear history" action wipes the list.
- **Condense sources (8.12.1):** Optional checkbox. When on, the backend runs each selected note through a fast model (`LLM_CONDENSE_MODEL`, default `phi4:14b`) with a "3-5 bullets" prompt before assembling the main prompt. Trades latency for fitting more notes in the context window. Best-effort: per-note failures fall back to the original content. Available for both quick and deep modes.
- **Insert at cursor (8.12.1, quick mode only):** When the modal is opened while a note is open in the editor, the preview stage shows a second action button alongside "Save as note." Clicking it inserts the AI output into the open note at the current cursor position via the editor's exposed `insertAtCursor()`. `NotesView.vue` registers/unregisters the CodeMirrorEditor handle into `aiAssistStore.editor`, so the modal knows whether an editor is available. Not relevant for deep-think since the result lands asynchronously in the inbox.

### 5.7 File Attachments (Stage 1)

- **Supported types:** Images (PNG, JPG, GIF, WebP, SVG), PDFs, and common document types (DOCX, XLSX, TXT).
- **Inline images:** Images render inline in Normal Mode when a markdown `![](...)` reference exists in the note body. The `AttachmentZone` component also shows an always-on thumbnail grid for every image attachment (rendered above the collapsible file list) regardless of whether the body references them — so uploads, clipper screenshots, and Drive imports all display a preview even when no markdown reference exists.
- **SVG on dark themes:** SVGs authored for light backgrounds often use dark ink and disappear on the dark editor. Both the editor's `ImageWidget` and the `AttachmentZone` preview grid give a white backing (with padding) to image references whose alt/filename ends in `.svg` or whose `mime_type` is `image/svg+xml`. Other image types keep the transparent theme background.
- **PDF preview:** PDFs show a thumbnail; clicking opens in a panel or browser tab.
- **Inline PDF embed (CR031):** Obsidian-style `![[filename.pdf]]` syntax renders a PDF attachment as an inline `<iframe>` (browser-native PDF viewer, ~640 px tall, full editor width) in Normal Mode. Filename match is case-insensitive against the current note's attachments. Source Mode shows the raw syntax. Unknown filenames render as a red dashed "broken embed" indicator. The wikilink regex uses a negative lookbehind `(?<!!)` so `![[…]]` is processed exclusively by `pdfEmbedRenderPlugin` and never mis-classified as a note link. Iframe auth uses the existing `?token=<jwt>` shim (same as inline images), and the iframe `src` appends `#toolbar=0&navpanes=0&scrollbar=0` (PDF Open Parameters) so the embedded viewer's filename bar, page-nav, and zoom controls are hidden and the page sits flush against the editor. Works on the mobile editor too (both `NotesView` and `MobileEditor` thread `attachmentMap` into `CodeMirrorEditor`); however, Android Chrome has no built-in inline PDF viewer, so the iframe may render blank or trigger a download on Android — desktop Chrome renders fully inline. Requires `X-Frame-Options: SAMEORIGIN` (not `DENY`) in `nginx/noted.conf` so the iframe can frame the same-origin attachment endpoint.
- **Insert into document (CR031):** Each attachment row in `AttachmentZone` has a corner-down-left **Insert** button (between the size and the trash icon) that drops type-appropriate markdown at the cursor — `![filename](url)` for images, `![[filename]]` for PDFs, `[filename](url)` for everything else.
- **Storage:** Files stored on VM filesystem in a structured directory (`/attachments/{year}/{month}/{note_id}/`).
- **Metadata:** File size, type, and original filename stored in `attachments` table.
- **Upload:** Drag-and-drop into note body, via toolbar button, or paste from clipboard (Win+Shift+S / screenshot tools). Pasted images are uploaded as attachments and the markdown reference is inserted at the current cursor position in the editor.

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
- **Client token handling ([api/client.js](frontend/src/api/client.js)):** The access token lives in a module variable, set by login/refresh. On cold start the API client gates the first protected request on a single proactive `/auth/refresh` (4s-bounded so a stalled refresh can't re-introduce the iPad-offline hang) instead of firing before the token exists — this fixed a v0.11.25 401 storm where the session-hint fast-path rendered the shell and components fetched before the background refresh landed. Concurrent `/auth/refresh` calls are coalesced onto one in-flight request, and a 401 transparently triggers refresh-and-retry once. On a *genuine* refresh rejection (expired/invalid refresh token, vs. an offline network failure which keeps the session), the client dispatches `noted:session-expired`; `App.vue` clears local state via `authStore.expireSession()`, toasts, and routes to `/login` (idempotent — v0.11.27).
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
- **Auto-update:** Per-note toggle (visible only on Drive-imported notes). When enabled, the poller detects Drive file modifications (via `modifiedTime`) and overwrites the note content, preserving tags, folder assignment, and wikilinks. Auto-update files remain in the import folder (not moved to Processed) so future changes are detected. Migration: `010_note_auto_update.sql`.
- **HTML imports:** `.html` / `.htm` files (or `text/html` MIME) are imported as first-class **HTML-format notes** (CR023) — content read into the note body, title pulled from the `<title>` tag (falling back to the filename), body normalized to strip `<head>`/`<meta>` boilerplate while preserving `<head>` `<style>` blocks, and `format='html'` set so the note renders via DOMPurify. Shares the exact title/body normalization with the manual uploader via `backend/src/utils/htmlImport.js`. (Before this, Drive-imported HTML fell through to the binary-attachment path below and showed only the `"Imported from Google Drive: ..."` placeholder.) Wikilink sync is skipped for HTML notes (parser is markdown-only).
- **Markdown/text imports:** `.md` / `.txt` (or `text/plain` / `text/markdown`) are imported as `format='markdown'` notes with the raw content as the body.
- **Image imports:** When a Drive file's MIME type starts with `image/` (including `image/svg+xml`), the importer appends a markdown image reference (`![filename](/api/v1/attachments/{id})`) to the note body after saving the attachment, so the image renders inline in Normal Mode and travels with exports/prints. Non-image binaries (PDFs, Office docs, etc.) remain attachment-only with the `"Imported from Google Drive: ..."` placeholder text.
- **Reconnect notice at startup (CR034):** When the Drive token expires/revokes, the poller pauses sync and sets `auth_error` (surfaced as `needsReconnect` by `GET /integrations/google-drive/status`). On app load, `App.vue` fetches integration status and — if reconnect is needed — shows a non-blocking sticky warning toast with a **Reconnect** action that routes to Settings. A persistent amber dot on the Settings activity-rail icon (`ActivityRail.vue`) survives toast dismissal so the prompt stays discoverable. Both indicators auto-clear when a successful scan/reconnect flips `needsReconnect` back to false.
- **Code:** `backend/src/services/driveImporter.js`, `backend/src/services/drivePoller.js`, `backend/src/routes/integrations.js`, `backend/src/utils/htmlImport.js` (shared HTML title/body normalization, also used by `backend/src/routes/import.js`), `frontend/src/views/SettingsView.vue`, `frontend/src/App.vue`, `frontend/src/components/sidebar/ActivityRail.vue`.

### 5.14 Offline Quick Capture (implemented)

- **IndexedDB outbox:** Quick-capture submissions while offline (or mid-request failure) are enqueued in an IndexedDB outbox (`frontend/src/lib/offlineOutbox.js`) and replayed when the network returns.
- **Idempotent replay:** Each outbox entry carries a client-generated UUID (`client_id`). The backend `notes` table has a unique index on `(user_id, client_id)` (migration `006_offline_client_id.sql`) so replayed captures cannot create duplicates.
- **UX:** Quick capture modal surfaces pending-outbox state and replay progress.
- **PWA status:** Works reliably in a Chrome tab; installed Android PWA support is degraded and de-prioritized.
- **Update prompt:** `vite-plugin-pwa` is configured with `registerType: 'prompt'` (see [vite.config.js](frontend/vite.config.js)). When a new service worker is waiting, `main.js` calls `registerSW({ onNeedRefresh })` and surfaces a sticky toast ("A new version of Noted is available." + **Reload** action) via the toasts store. Clicking Reload calls `updateSW(true)` which triggers `skipWaiting` + `clientsClaim` and refreshes the page onto the new bundle.

### 5.14a Per-Note Offline Checkout (CR027, implemented)

Soft-sync offline editing of existing notes. Use case: take notes with you on a plane, edit them, and check in when you're back online. Single-user model — no server-enforced locks.

- **Selection:** Per-note **Offline** button in the editor toolbar. Each checked-out note is cached in a `checkouts` IndexedDB store inside the existing `noted-offline` database (DB version bumped 1 → 2; outbox store untouched).
- **Editing while checked out:** [`stores/notes.js`](frontend/src/stores/notes.js) intercepts `updateNote()` — if a checkout exists for the note, edits write to the local IDB copy and flip `dirty=1`; no PATCH to the server. Edits to uncheckouted notes still autosave through the existing 500 ms debounce. Reads (`fetchNote()`) return the local IDB snapshot directly for checked-out notes — no server fetch on the hot path (post-v0.11.10), since iPad Safari leaves `navigator.onLine === true` in Airplane mode and the previous best-effort server `GET` hung ~30 s before failing. Users who want fresh metadata use the **Refresh offline copy** toolbar button explicitly.
- **Check-in:** `POST /api/v1/notes/:id/checkin` with `{ base_version, title, content, notebook_id, tag_ids }`. The server compares `base_version` to the row's current `updated_at` (ISO-string equality). Match → applies the update, returns the new row. Mismatch → returns **409** with `{ error: 'checkin_conflict', data: { server: { … } } }` and does not touch the row. Conflict resolution is then a client-side decision; "Keep local" and "Hand-merge" simply re-POST with `base_version` set to the just-returned `server.updated_at` (no separate force flag).
- **Auto-sync:** [`App.vue`](frontend/src/App.vue) listens for `window.online` and triggers `checkoutSync.flush()` ([`frontend/src/lib/checkoutSync.js`](frontend/src/lib/checkoutSync.js)), which iterates all dirty checkouts. Manual **Check in now** button in the toolbar and an OfflinePanel **Check in all** action call the same flush.
- **Conflict modal:** [`CheckinConflictModal.vue`](frontend/src/components/ui/CheckinConflictModal.vue) shows a two-pane line-diff of local vs. server. Three actions: **Keep local** (forced overwrite), **Keep server** (discard local, re-create checkout from server payload), **Hand-merge** (editable textarea with server reference, save as forced overwrite).
- **Editor banner:** [`CheckoutBanner.vue`](frontend/src/components/ui/CheckoutBanner.vue) appears above the editor toolbar when the active note is checked out — shows clean / dirty / offline / conflict states.
- **Offline view:** New `/offline` route (lazy-loaded [`OfflineView.vue`](frontend/src/views/OfflineView.vue)) plus an "Offline" contextual panel ([`OfflinePanel.vue`](frontend/src/components/sidebar/panels/OfflinePanel.vue)) listing checked-out notes split into Dirty / Clean sections. Reachable from: the desktop activity rail's **Offline** icon (between Vault and Trash, only when `checkoutCount > 0`); a new **Offline (n)** nav row in [`NotesPanel`](frontend/src/components/sidebar/panels/NotesPanel.vue) above Inbox/All Notes; and a **Offline (n)** tile in [`MobileHome`](frontend/src/components/mobile/MobileHome.vue)'s dashboard grid. All three surfaces show a dirty-count badge.
- **List indicators:** Checked-out notes show a `CloudDownload` icon next to their title in [`NoteListPanel`](frontend/src/components/ui/NoteListPanel.vue), [`MobileNotesList`](frontend/src/components/mobile/MobileNotesList.vue), [`InboxView`](frontend/src/views/InboxView.vue) (mobile + desktop layouts). Icon tints `accent-warn` when the local copy has unsaved edits. Backed by reactive `cachedNoteIds` / `dirtyNoteIds` Sets in [`lib/checkouts.js`](frontend/src/lib/checkouts.js).
- **Offline-fallback notes list:** `notesStore.fetchNotes()` catches `OfflineError` and synthesizes a notes list from local checkouts so "All Notes" doesn't render empty when the user is offline. A small "offline cache only" chip appears in the list header to make the fallback obvious. `App.vue`'s `online` listener re-fetches the real list when the network returns.
- **Offline-only navigation safety:** `notesStore.fetchNote()` returns a `_unavailableOffline` sentinel instead of throwing when offline + no local checkout. `MobileEditor.loadNote` and `NotesView.loadNote` try/catch + fall back to a direct `getCheckout()` read; if there's genuinely no local data, they render a friendly "Not available offline. Reconnect to load this note." markdown stub. `authStore.init()` fast-paths the router shell via the `noted.hasSession` `localStorage` hint and refreshes in the background, so a slow / hung `auth/refresh` (iPad Safari `navigator.onLine === true` in Airplane mode) never leaves the user staring at a blank themed page.
- **Storage persistence:** First successful checkout requests `navigator.storage.persist()` so the browser is less likely to evict the cache under pressure. The OfflinePanel footer reports the actual persistence state.
- **Wikilinks while offline:** Links to non-checked-out notes still render but click-through fails when offline; v1 does not visually grey them out (refinement deferred).
- **Inline images:** v1 caches markdown source + metadata only. Images are still loaded from the live attachment URL — they render normally online and show as broken when offline. Blob caching of inline images is deferred to a follow-on so the editor's image renderer changes can land in isolation.
- **Tests:** Backend integration tests in [`backend/tests/cr027-checkout.test.js`](backend/tests/cr027-checkout.test.js) cover auth, clean apply, conflict 409, forced overwrite, missing/deleted note, wikilink resync, and required-field validation (20 assertions, all passing). Frontend unit-test scaffolding for `checkouts.js` and `checkoutSync.js` is described in [CR027 §13.1](docs/cr/cr-027-offline-note-checkout.md) but the `vitest` test script + `fake-indexeddb` dep are not yet added — manual walkthrough in §13.2 of the CR is the v1 regression spec.

### 5.15 Settings (implemented)

- **Settings view (`/settings`):** Theme picker (Sapphire Slate / Dark / Light), password change, Google Drive integration config/scan, account-level preferences, and a **System Status** card at the bottom.
- **Theme picker:** Three palettes selectable via a card grid with live swatch previews. Selection persists to `localStorage` (`noted.ui.theme`) and is applied before Vue mounts via `applyTheme()` in `main.js`. See §13 for the palette definitions.
- **System Status:** Single-card dashboard backed by `GET /api/v1/system/stats`. Reports storage (attachments size, DB size, filesystem total/free with a colour-coded usage bar), content counts (notes / ideas / trashed / tasks / attachments / OCR'd / tags), server info (app version, Node, env, uptime, RSS), integration health (LLM gateway reachable + model count, Google Drive connection), and backup status (last backup timestamp + size + count from `BACKUP_DIR`). Fetched once on mount with a manual Refresh button — no polling. Component: [SystemStatusCard.vue](frontend/src/components/ui/SystemStatusCard.vue).

### 5.16 Note Export & API Tokens (implemented)

- **Download button:** Editor toolbar button triggers a browser download of the current note as a `.md` file (filename derived from title).
- **Export API:** `GET /api/v1/notes/export/:title` returns raw markdown by note title (`Content-Type: text/markdown`). Supports authentication via Bearer header or `?token=` query param for curl/script usage.
- **Long-lived API tokens:** `POST /api/v1/auth/token` creates a `noted_`-prefixed token (SHA-256 hashed in DB, shown once on creation). `GET /api/v1/auth/tokens` lists tokens (without values). `DELETE /api/v1/auth/token/:id` revokes a token. Optional expiry via `expires_in_days`. Tokens work anywhere JWTs do (Bearer header).
- **Script workflow:** Users create a token via the API, then use `curl -H "Authorization: Bearer noted_..."` or `?token=noted_...` in shell scripts (e.g. `getDocs.sh`) to pull notes from remote machines over Tailscale.
- **Code:** `backend/src/routes/export.js`, `backend/src/routes/auth.js` (token endpoints), `backend/src/plugins/auth.js` (token verification), `backend/migrations/011_api_tokens.sql`.

### 5.17 Encrypted Vault (CR020 + CR021 + CR029 + CR033 + CR035, implemented)

Client-side, zero-knowledge vault for passwords, keys, credit cards, and bank accounts, with optional biometric unlock per device. Server stores opaque ciphertext only — the master password and derived key never leave the browser. Reachable via the sidebar (lock-key icon) or `/vault`.

- **Crypto:** Argon2id (m=64 MiB, t=3, p=1) → 32-byte AES-256-GCM key. Per-entry payload is JSON-encoded then encrypted with a fresh 12-byte IV. A small known-plaintext "verifier" ciphertext lets the client check the master password without involving the server.
- **Entry types (CR029):** `password` ({name, username, password, url, notes}), `key` ({name, password (=key payload), notes}), `card` ({name, card_number, expiration, cvv, notes}), `bank` ({name, account_number, routing_number, swift_bic, notes}). The `type` discriminator lives inside the encrypted blob; the server has no awareness of which type a row carries. Adding new types is a purely client-side change — no schema migration.
- **Grouping (CR033):** Every entry carries an optional free-text `group` field (stored inside the encrypted record like every other field). Within a type tab, entries that share a group name render under a `.group-header` (name + count pill); named groups sort alphabetically and ungrouped entries trail in an "Ungrouped" bucket. When nothing in the active tab has a group, the list renders flat exactly as before. The entry modal's Group input autocompletes from group names already used for that type. No backend/schema change.
- **Lifecycle:** First visit prompts for master-password setup (with explicit "no recovery" warning). Subsequent visits prompt for unlock. Unlocked state holds the master key in a JS module closure (not Pinia state, never localStorage). Auto-locks after 15 minutes of vault inactivity; a manual lock button is always visible. Navigating to other routes does NOT lock the vault — only the idle timer or the manual button do.
- **Entries UI:** Tab-style segmented control switches between the four types. Searchable list (client-side filter on decrypted name + the type's primary identifier) with copy-to-clipboard buttons that auto-clear the clipboard after 30 s. Password generator uses `crypto.getRandomValues`. Per-row reveal toggle. List rows show two type-specific quick-copy buttons: Password → User + Pass; Key → Key; Card → CVV + Number; Bank → Routing + Acct.
- **API:** `/api/v1/vault/meta` (GET/POST) for KDF salt/params and verifier ciphertext; `/api/v1/vault/entries` (GET/POST/PUT/DELETE) for opaque ciphertext blobs; `PUT /api/v1/vault/rotate` for atomic master-password rotation (re-encrypted entries posted alongside new metadata in a single transaction). BYTEA fields are exchanged as base64 in JSON.
- **Settings:** "Change Vault Password" card in Settings (visible only when a vault exists) takes current + new + confirm passwords, derives both keys client-side, decrypts every entry with the old key, re-encrypts with the new key, and posts the bundle to `/vault/rotate`. The server never sees either password.
- **Biometric unlock (CR021):** opt-in per device. Settings → "Biometric Vault Unlock" card prompts for the current vault password, runs the WebAuthn enrollment ceremony with the PRF extension, wraps the raw 32-byte master key under the PRF secret (AES-256-GCM), and stores `{credentialId, prfSalt, wrappedKey, wrappedIv}` in `localStorage["noted.vaultBiometric"]`. The wrap secret lives in the OS secure enclave / TPM and never leaves the authenticator. On the lock screen, a "Use biometric unlock" button appears above the password form when a wrapped key is present for this device. Master-password rotation auto-clears the wrapped key (since it'd no longer unwrap correctly); a stale wrap (e.g. password rotated elsewhere) is detected by the verifier check after unwrap and auto-cleared. Password unlock remains the always-available fallback. Browsers without WebAuthn / PRF (Firefox in some configurations) simply don't show the option.
- **Emergency export (CR035):** "Export" button in the unlocked vault header produces a single **self-decrypting HTML file** (`noted-vault-emergency-YYYY-MM-DD.html`) the user can save offline and open in any browser with no Noted app and no installed tools. The file embeds only ciphertext; opening it prompts for an **export passphrase** (separate from the master password, chosen at export time, never stored), derives a key in-browser, and renders all entries grouped by type with a filter + Print/Save-as-PDF. Crypto is native WebCrypto only — PBKDF2-HMAC-SHA-256 (600 000 iters, 16-byte salt) + AES-256-GCM (12-byte IV) — so the file carries no Argon2 wasm dependency. Runs entirely client-side from the already-unlocked vault; no backend/API/schema change. Undecryptable stubs are dropped and only type-relevant fields are exported.
- **Storage:** Tables `vault_meta` and `vault_entries` (UUID `user_id`, `bytea ciphertext`, `bytea iv`). No plaintext metadata is stored anywhere on the server. Biometric wrapped-key blobs live in browser `localStorage` only — the server has no awareness of biometric enrollment.
- **Code:** `backend/migrations/017_vault.sql`, `backend/src/routes/vault.js`, `backend/tests/phase12-vault.test.js` (26 assertions including a server-side plaintext-leak check), `frontend/src/lib/vaultCrypto.js`, `frontend/src/lib/vaultExport.js` (CR035 emergency export), `frontend/src/lib/biometricUnlock.js`, `frontend/src/stores/vault.js`, `frontend/src/views/VaultView.vue`, `frontend/src/views/SettingsView.vue`, `frontend/src/components/ui/VaultEntryModal.vue`, `frontend/src/components/ui/VaultExportModal.vue` (CR035). Dependency: `hash-wasm` (Argon2id).

### 5.18 HTML-Format Notes (CR023, implemented)

Per-note format flag (`markdown` | `html`) so users can keep richly-formatted documents (multi-column layouts, inline SVG, styled callouts, exported web pages) as first-class notes alongside the existing markdown experience.

- **Storage:** `notes.format TEXT NOT NULL DEFAULT 'markdown' CHECK (format IN ('markdown','html'))`. Body is stored verbatim — sanitization runs on render, not on store, so the policy is upgradable without re-encoding existing notes.
- **Creation:** "New Note" in the sidebar is a split-button — the main label creates a Markdown note (current default); the caret offers `Markdown` / `HTML` / `Import file…`. The chosen format is remembered for the session only.
- **Import:** `POST /api/v1/notes/import` accepts `.md`, `.markdown`, `.txt`, `.html`, `.htm` (multipart, JWT-authed, server-side MIME sniff via filename extension first then header). For full HTML documents (`<html><head><body>…`), only the body content is stored so the source view doesn't show `<head>`/`<meta>` boilerplate. Title precedence: explicit override → `<title>` tag (HTML only) → filename → `"Untitled"`. Size cap matches the existing attachment cap (`MAX_FILE_SIZE`, default 25 MiB).
- **Rendering:** HTML notes default to a sanitized read view (`<article class="note-html">`) with an "Edit source" toolbar button that swaps in CodeMirror in plain-text mode. Sanitization uses DOMPurify with `<style>` allowed-but-scoped (per-note container prefix prevents uploaded CSS from bleeding into the app shell), `<svg>` allowed, and `<script>`/`<iframe>`/`<object>`/`<embed>`/inline `on*` handlers/`javascript:` URIs all blocked.
- **Editor:** `CodeMirrorEditor` accepts a `format` prop. For `format='html'`, the markdown language plugin and all markdown-specific extensions (`markdownRendering`, `wikilinkRendering`, `wikilinkAutocomplete`, `tableKeymap`) are skipped — plain-source editing only.
- **Export as PDF / download:** Export as PDF (CR036) branches on format — HTML notes go through DOMPurify and are written into the print window directly (markdown notes still use markdown-it). Download exports `.html` for HTML notes with `text/html` MIME.
- **Search:** Snippets for HTML notes have raw markup stripped client-side (preserving `<mark>` highlight wrappers from `ts_headline`) before being injected via `v-html`.
- **List badge:** Note list shows a small `HTML` badge next to the title for `format='html'` rows.
- **v1 limitations (deferred):** No wikilinks/backlinks/graph/AI Assist for HTML notes (the wikilink parser is markdown-only; AI Assist prompts assume markdown). HTML tags pollute `content_tsv` slightly — acceptable tradeoff for v1. No format conversion (markdown ↔ html) on existing notes. No WYSIWYG editor.
- **Code:** `backend/migrations/018_note_format.sql`, `backend/src/routes/import.js`, `backend/src/routes/notes.js` (format field), `backend/tests/phase13-html-notes.test.js` (23 assertions), `frontend/src/lib/htmlSanitize.js`, `frontend/src/components/ui/ImportNoteModal.vue`, `frontend/src/views/NotesView.vue` (read-mode branch), `frontend/src/components/editor/CodeMirrorEditor.vue` (format prop). Dependency: `dompurify`.

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

-- Notes (migrations 001, 002 soft-delete, 006 offline client_id, 008 clipper source_url, 010 auto_update)
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
  auto_update BOOLEAN NOT NULL DEFAULT FALSE,     -- Auto-update from Google Drive (migration 010)
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
  auth_error     TEXT,                           -- migration 013: last OAuth failure (e.g. invalid_grant)
  auth_error_at  TIMESTAMPTZ,                    -- when auth_error was recorded; cleared on successful reconnect
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

-- Long-lived API tokens for script/CLI access (migration 011)
CREATE TABLE api_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL,                      -- SHA-256 of the noted_xxx token
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted vault (CR020) — strict zero-knowledge: server only stores ciphertext.
-- Master password / derived key never leave the client.
CREATE TABLE vault_meta (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kdf_salt             BYTEA NOT NULL,             -- random per-user, generated on setup
  kdf_params           JSONB NOT NULL,             -- {algo: 'argon2id', m, t, p}
  verifier_ciphertext  BYTEA NOT NULL,             -- AES-GCM("vault-v1-ok") — used to check master password
  verifier_iv          BYTEA NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vault_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext  BYTEA NOT NULL,                       -- AES-256-GCM of JSON {name, username, password, url, notes}
  iv          BYTEA NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX vault_entries_user_idx ON vault_entries (user_id, updated_at DESC);
```

---

## 7. API Design

All endpoints are prefixed with `/api/v1`. JWT token required in `Authorization: Bearer <token>` header (or long-lived API token with `noted_` prefix) for all routes except auth.

### Auth

```
POST   /api/v1/auth/login          Body: { username, password }
POST   /api/v1/auth/refresh         Uses httpOnly refresh token cookie
POST   /api/v1/auth/logout
POST   /api/v1/auth/token           Body: { name, expires_in_days? } — create API token (returns token once)
GET    /api/v1/auth/tokens          List API tokens (name, last_used, expires_at)
DELETE /api/v1/auth/token/:id       Revoke an API token
```

### Notes

```
GET    /api/v1/notes                Query: notebook_id, tag_id, search, in_inbox, note_type, limit, offset (excludes trashed). Rows carry a 300-char content PREVIEW, not the full body (v0.11.23 perf — list payload ~10x smaller); the editor loads full content via GET /:id.
POST   /api/v1/notes                Body: { title, content, notebook_id, tag_ids, client_id? }
GET    /api/v1/notes/:id
PUT    /api/v1/notes/:id            Body: { title, content, notebook_id, tag_ids, pinned, auto_update }
POST   /api/v1/notes/:id/checkin    CR027 — body: { base_version, title?, content?, notebook_id?, tag_ids? }. Optimistic concurrency: 200 on match, 409 (error: checkin_conflict, data.server: <full row>) on mismatch.
DELETE /api/v1/notes/:id            Soft delete — sets deleted_at
GET    /api/v1/notes/export/:title  Raw markdown by title (text/markdown, supports ?token= for scripts)
GET    /api/v1/notes/trash          Lists soft-deleted notes for the user
POST   /api/v1/notes/:id/restore    Clears deleted_at
DELETE /api/v1/notes/:id?hard=true  Permanent delete (removes row + attachments on disk)
GET    /api/v1/notes/:id/backlinks  Returns notes linking to this note
GET    /api/v1/notes/:id/graph      Returns local graph data (nodes + edges, 1 degree)
POST   /api/v1/notes/voice          Multipart audio upload → transcribe via Whisper → create idea + attachment
POST   /api/v1/notes/:id/promote        Body: { notebook_id } — flip idea → note (409 if not idea)
POST   /api/v1/notes/:id/merge-into     Body: { target_note_id } — append idea content as bullet to target, soft-delete source
POST   /api/v1/notes/:id/convert-to-task  Convert an idea to a standalone task (note_id=null), soft-delete source (409 if not idea)
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
PUT    /api/v1/tasks/:id            Body: { content?, is_done?, note_id?, due_date?, reminder_at? }
                                    note_id / due_date / reminder_at accept null to clear.
                                    Response includes joined note_title.
DELETE /api/v1/tasks/:id
GET    /api/v1/tasks/inbox          All tasks with note_id = NULL
```

### Reminders

```
GET    /api/v1/reminders            All reminders (overdue, upcoming, dismissed)
GET    /api/v1/reminders/due        Reminders due now (for polling)
PUT    /api/v1/reminders/:id/snooze Body: { type, snooze_until }
PUT    /api/v1/reminders/:id/dismiss Body: { type }
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

### Vault (CR020)

All bytea fields are exchanged as base64 strings in JSON.

```
GET    /api/v1/vault/meta              KDF salt/params + verifier ciphertext, or 404 if not initialised
POST   /api/v1/vault/meta              Body: { kdf_salt, kdf_params, verifier_ciphertext, verifier_iv }
                                        409 if already initialised. KDF must be argon2id.

GET    /api/v1/vault/entries           List of { id, ciphertext, iv, created_at, updated_at }
POST   /api/v1/vault/entries           Body: { ciphertext, iv } — 409 until vault is initialised
PUT    /api/v1/vault/entries/:id       Body: { ciphertext, iv }
DELETE /api/v1/vault/entries/:id

PUT    /api/v1/vault/rotate            Body: { kdf_salt, kdf_params, verifier_ciphertext, verifier_iv,
                                                entries: [{ id, ciphertext, iv }, ...] }
                                        Atomic master-password rotation. The submitted entry-id set
                                        must match the existing set exactly (409 otherwise);
                                        meta + every entry update in a single transaction.
```

> **Security note:** `GET /attachments/:id` currently accepts the JWT access token as a query-string parameter so `<img>` / `<iframe>` tags can render attachments inline without custom headers. This leaks the token into browser history, proxy logs, referrer headers, and any screenshot of the URL bar. This should either be replaced with short-lived signed attachment URLs (opaque token distinct from the JWT) or with cookie-based auth for this endpoint. *(Open issue — see §9 Backlog.)*

### Search

```
GET    /api/v1/search               Query: q, notebook_id, tag_id, from, to, from_drive, auto_update
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

### AI Assist (Phase 8.12 + 8.12.1)

```
GET    /api/v1/ai-assist/config             { enabled, contextWindow, warnTokens, model, condenseModel }
GET    /api/v1/ai-assist/models             Returns array of model names from the gateway
POST   /api/v1/ai-assist/estimate           Body: { prompt?, noteIds? }
                                            Returns { estimatedTokens, characters, contextWindow }
POST   /api/v1/ai-assist/generate           Body: { prompt, noteIds?, model?, condense?, stream? }
                                            Default: JSON { output, model, sources, estimatedTokens, condensed }
                                            stream=true: NDJSON chunks ({chunk:"..."}) then a final
                                            {done:true, model, sources, ...} line.
                                            Does NOT create a note — frontend previews then calls POST /notes.
```

### System

```
GET    /api/v1/system/stats          Dashboard for the Settings page —
                                     storage (attachments/db/disk), content counts,
                                     server (version, uptime, memory), integrations
                                     (LLM gateway, Drive), and backup status.
                                     Single round-trip; per-collector failures degrade to nulls.
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
├── SearchView.vue
└── HelpModal.vue (keyboard shortcuts + search filters reference, Alt+/)
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
useUIStore          — sidebar state, active view, editor mode (normal/source),
                      noteListCollapsed / contextPanelsCollapsed (persisted to
                      localStorage), focus-mode toggle, help-modal visibility
useAIAssistStore    — AI Assist modal isOpen + last prompt (persisted to localStorage)
```

---

## 9. Development Stages

> **Note:** See [docs/current/project-roadmap.md](docs/current/project-roadmap.md) and the [docs/cr/](docs/cr/) folder for the authoritative, in-progress tracker. This section is a high-level snapshot.

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
- [x] Voice note capture (Phase 8.10) — Quick Capture Voice tab, MediaRecorder → Whisper transcription → idea + audio attachment

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
├── docs/
│   ├── documentation-standard.md   # Docs conventions (portable)
│   ├── current/
│   │   ├── status.md               # Mandatory session-start read
│   │   ├── project-description.md  # This file (full current state)
│   │   └── project-roadmap.md      # Planned / in-progress work
│   ├── cr/                         # Change Requests + README.md index (canonical status)
│   ├── guides/                     # Runbooks + stable how-tos (key-files, deployment, API)
│   └── archive/                    # Stale / historical material
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

*Last updated: 2026-04-19*
*Status: Stages 1–2 shipped and deployed to production. Phase 7 (Web Clipper & OCR) complete. Phase 8.10 (voice capture) and 8.11 (note translate) shipped. Next up: remaining Phase 8 tasks (pgvector, semantic search, summarization, task extraction, "ask my notes").*

---

## 13. UI Design System — Themes

The app ships with **three selectable themes**, chosen in Settings → Appearance. `Sapphire Slate` (default) is the signature brand theme; `Dark` and `Light` are neutral alternates for users who prefer a plainer palette. All three are defined as CSS custom-property sets under `:root[data-theme="..."]` in `frontend/src/styles/theme.css` — no rebuild needed to switch.

- **Sapphire Slate (default):** deep navy + amber accents ("Sapphire Slate")
- **Dark:** neutral charcoal dark mode
- **Light:** neutral light mode

All UI components (including CodeMirror's editor theme and the D3 graph renderers) read colors from the same shared variables, so each theme is complete and consistent end-to-end. The D3 graphs subscribe to a `noted:theme-change` window event and re-render SVG strokes/fills on theme flip.

### Signature theme: Sapphire Slate

Deep navy palette with high-contrast amber/orange accents for CTA elements. It balances the focus-friendly qualities of dark mode with the readability of a lighter navy base — avoiding the harshness of pure-black dark themes while remaining easy on the eyes for long writing sessions.

> **Design character:** Corporate yet modern. Clean, thin-stroke iconography. Minimal decoration. Depth created through layered navy backgrounds, not gradients or shadows.

---

### 13.1 Color Palette (CSS Custom Properties)

The full palette lives in `frontend/src/styles/theme.css`, with each theme defined as a separate `:root[data-theme="..."]` selector. Sapphire is the `:root` default.

**Shared token set (defined per-theme):**

| Token | Purpose |
|---|---|
| `--bg-main` / `--bg-sidebar` / `--bg-card` | Three-tier depth hierarchy |
| `--text-primary` / `--text-secondary` / `--text-muted` | Text colors |
| `--accent-primary` / `--accent-hover` / `--accent-warn` / `--accent-success` | Links, hover, CTA, success states |
| `--status-error` / `--status-warning` / `--status-success` + `-bg` variants | Semantic status colors + soft badge backgrounds |
| `--border-subtle` / `--border-strong` | Dividers |
| `--overlay-modal` | Modal scrim color |
| `--selection-bg` / `--hover-bg` | Editor selection + list-item hover |
| `--shadow-sm` / `--shadow-md` | Elevation |
| `--on-accent-warn` | Text color to pair with the amber CTA (dark on amber in sapphire/dark; white on deep-amber in light) |

**Sapphire (default):**

```css
:root, :root[data-theme="sapphire"] {
  --bg-main: #1a3a6d;  --bg-sidebar: #102a50;  --bg-card: #244a85;
  --text-primary: #ffffff;  --text-secondary: #c4d9ff;  --text-muted: #6b8dbb;
  --accent-primary: #3a86ff;  --accent-warn: #ff9f1c;  --accent-success: #4cc9f0;
  /* ...status, overlays, shadows — see theme.css for the full set */
}
```

**Dark** uses a neutral charcoal base (`--bg-main: #1e1e1e`) with a slightly desaturated blue primary (`#5b9dff`).

**Light** flips to white-on-dark-text (`--bg-main: #ffffff`, `--text-primary: #1a1a1a`) with a saturated blue primary (`#2563eb`) and desaturated status colors tuned for contrast on light backgrounds.

> **Contrast note:** `--text-secondary` in Sapphire is `#c4d9ff` (not the originally-proposed `#a0c4ff`) to ensure WCAG AA compliance (4.5:1 ratio) against `--bg-card`. Always verify contrast when placing secondary text on card backgrounds, especially in Light mode where the soft backgrounds are near-white.

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
