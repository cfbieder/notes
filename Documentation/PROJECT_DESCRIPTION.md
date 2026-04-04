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
| Primary DB   | PostgreSQL         | Relational model suits graph queries (tags, links) |
| Note content | JSONB column       | Flexible schema for evolving note structure        |
| Future AI    | pgvector extension | Semantic search without a separate vector DB       |
| Migrations   | node-pg-migrate    | Version-controlled schema evolution                |

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
     │ HTTP/REST
     ▼
  Fastify API (Node.js)
     │
     ├── Auth module (JWT)
     ├── Notes module
     ├── Notebooks module
     ├── Tags module
     ├── Links module (wikilinks graph)
     ├── Tasks / Inbox module
     ├── Search module
     ├── Attachments module
     └── Reminders module
     │
     ▼
  PostgreSQL
     ├── notes (JSONB content)
     ├── notebooks
     ├── tags
     ├── note_tags (junction)
     ├── note_links (bidirectional)
     ├── tasks (inbox + allocated)
     ├── attachments
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
- **Capture types:** Plain note, task/to-do, or idea.
- **Inbox view:** A dedicated "Inbox" view shows all unallocated captures in reverse chronological order.
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
- **Filters:** Search results can be filtered by notebook, tag, date range, or attachment type.
- **Keyboard-first:** Search triggered by `Ctrl+K` (command palette style). Results navigate with arrow keys.
- **Stage 2 — PDF/image search:** OCR extracted text stored alongside attachments, included in full-text index.
- **Stage 3 — semantic search:** pgvector embeddings for "find notes similar to this concept" queries.

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

### 5.10 Web Clipper (Stage 2)

- **Browser extension:** Chrome/Firefox extension captures the current page.
- **Clip modes:** Full page, article text only, selected text, or screenshot.
- **Destination:** Choose notebook and tags at clip time, or send to inbox for later processing.
- **Content:** Stores original URL, clip timestamp, and cleaned article content (using Readability.js).

### 5.11 Authentication (Stage 1)

- **JWT-based:** Access token (short-lived, 15 min) + refresh token (long-lived, 30 days, stored in httpOnly cookie).
- **Login page:** Username + password. bcrypt password hashing.
- **Protected routes:** All API endpoints require valid JWT. Frontend redirects to login on 401.
- **Multi-user ready:** `users` table exists from day one. All data rows include `user_id` foreign key.

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

-- Notes
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
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX notes_tsv_idx ON notes USING GIN(content_tsv);

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

-- File attachments
CREATE TABLE attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     UUID REFERENCES notes(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  storage_path TEXT NOT NULL,                     -- Relative path on filesystem
  ocr_text    TEXT,                              -- Stage 2: extracted text for search
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
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
GET    /api/v1/notes                Query: notebook_id, tag_id, search, is_inbox, limit, offset
POST   /api/v1/notes                Body: { title, content, notebook_id, tag_ids }
GET    /api/v1/notes/:id
PUT    /api/v1/notes/:id            Body: { title, content, notebook_id, tag_ids, pinned }
DELETE /api/v1/notes/:id
GET    /api/v1/notes/:id/backlinks  Returns notes linking to this note
GET    /api/v1/notes/:id/graph      Returns local graph data (nodes + edges, 1 degree)
```

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
POST   /api/v1/notes/:id/attachments  Multipart form upload
GET    /api/v1/attachments/:id        Streams file
DELETE /api/v1/attachments/:id
```

### Search

```
GET    /api/v1/search               Query: q, notebook_id, tag_id, from, to
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

### Stage 1 — Web App MVP (Target: Weeks 1–10)

**Goal:** A fully functional personal note-taking app accessible via browser and PWA.

Deliverables:

- [ ] Project scaffold (monorepo: `/frontend`, `/backend`, `/db`)
- [ ] PostgreSQL schema + migrations (node-pg-migrate)
- [ ] Fastify API with JWT auth
- [ ] Vue.js SPA with Vite
- [ ] CodeMirror 6 editor (Normal Mode + Source Mode toggle)
- [ ] Notebooks & stacks CRUD + sidebar tree
- [ ] Tags CRUD + tag browser
- [ ] Full-text search (PostgreSQL tsvector)
- [ ] Quick capture inbox modal (global shortcut)
- [ ] Tasks panel (inline checkboxes + task list view)
- [ ] Reminders (due dates + reminder timestamps)
- [ ] File attachment upload + inline image rendering
- [ ] PWA manifest + service worker (offline shell)
- [ ] Nginx reverse proxy + Tailscale access
- [ ] PM2 process management

### Stage 2 — Knowledge Graph (Target: Weeks 11–20)

**Goal:** Elevate notes from a collection to a connected knowledge base.

Deliverables:

- [ ] Bidirectional wikilink parsing + `note_links` table population
- [ ] Wikilink autocomplete in editor
- [ ] Backlinks panel in note view
- [ ] Unlinked mentions detection
- [ ] D3.js force-directed graph view (full + local)
- [ ] Tag nodes in graph (concept clustering)
- [ ] Web clipper browser extension (Chrome first)
- [ ] OCR for PDF/image attachments (Tesseract.js or pytesseract microservice)
- [ ] OCR text included in full-text search index

### Stage 3 — Collaboration & AI (Future)

**Goal:** Extend to multi-user and add AI-powered features.

Deliverables:

- [ ] Multi-user workspaces (shared notebooks)
- [ ] Role-based access control (viewer / editor / admin)
- [ ] pgvector semantic search (embedding model via Python microservice)
- [ ] AI summarization of notes (Claude API integration)
- [ ] Smart tag suggestions
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
│   ├── migrations/              # node-pg-migrate files
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
npm run migrate:up              # Run DB migrations
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

*Last updated: April 2026*
*Status: Pre-development — Stage 1 specification complete*

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
│  Inbox  (3) │  tag · yesterday │  [[Link to another note]]      │
│  Tasks      │                  │  #concept-tag                  │
│             │                  │  - [ ] Task item               │
│  [+ New]    │                  │                                │
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
