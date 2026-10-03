# Status

> Session snapshot — the one doc to read first. Everything else is read on demand.
> This file links onward; it does not restate facts. Ship dates/versions live only
> in the [CR index](docs/cr/README.md).

**Project:** Noted — self-hosted, Markdown-first personal knowledge & task app
(Vue 3 + Fastify + PostgreSQL). Full description: [project-description.md](docs/current/project-description.md).

**Current version:** v0.24.0 · **Live:** `https://noted.example.com`
(containers `noted-db`, `noted-api`, `noted-web`).

## Recently shipped
See the [CR index](docs/cr/README.md) for the authoritative list. Latest headlines:
- v0.24.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase C complete**: a chapter's **Passages** tab and a Key Passages section in the export; search finds highlights and filters by `is:source` / `ch:3`; clipper **v0.6.0** highlights text on a live page (reload the extension). Plus a search-snippet escaping fix and a Refresh button on the Research page
- v0.23.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **highlights**: select text in a source to highlight it with a meaning, chapter and comment; highlights re-anchor after text changes (fuzzy, or kept as unanchored). Plus **Fetch text**, which captures a source's article from its URL
- v0.22.2 — upload limit set to 25 MB everywhere (`MAX_FILE_SIZE` mapped in prod; Drive imports 10 → 25 MB)
- v0.22.1 — security patch: AI citation metadata refuses values planted beside an injected instruction (from ocr-llm's probe); notes attach only your own tags. Plus prod `LLM_*` settings mapped
- v0.22.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase A3**: PDF sources (upload, text layer, Open PDF), AI-filled citations ("Fill with AI", flagged until verified), clipper v0.5.0 (PDF tabs + page snapshots). Reload the extension
- v0.21.0 — **Node 22 LTS** runtime (Node 20 was end-of-life; needed for the PDF.js security fix); [CR039](docs/cr/cr-039-research-sources-highlights.md) A3 **Fetch details** (paste a URL in New source and the citation fills in); owner-QA fixes (local AI provider setting mapped on prod, provider form validation and styling, clearer clipper login error)
- v0.20.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase A2**: the web clipper (extension v0.4.0) can **save a page as a research source**, with citation metadata read from the page, editable before saving, a chapter picker, and duplicate detection. Reload the extension to pick it up
- v0.19.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase B**: per-chapter and whole-book Chicago reference export — **Copy for Word** (italics survive the paste) and **.md** download, with bold `[field?]` placeholders for missing citation data. With A1, this is the research layer's first usable release
- v0.18.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase A1**: research sources, books and chapters — a Research rail item (once a book exists), a source library and chapter views, a read-only Reader view for sources, and Settings → Research. Plus a dependency fix: `npm audit` clean in both apps (`bcrypt` 6 removes the critical `tar` advisory)
- v0.17.1 — fix: [CR038](docs/cr/cr-038-pluggable-ai-providers.md) `AI_KEYS_ENC_KEY` now reaches the prod container, so saving a Claude / OpenAI / local provider key works on production; new CI guard 7 fails the build when any prod secret is left unmapped in `docker-compose.prod.yml`. Plus [CR039](docs/cr/cr-039-research-sources-highlights.md) (research sources, highlights & chapter references) drafted, reviewed and approved for Phase A1
- v0.17.0 — [CR038](docs/cr/cr-038-pluggable-ai-providers.md) **Phase 1**: pluggable AI providers for text generation (Claude / OpenAI / local endpoint), with encrypted key storage and SSRF-guarded settings — AI is usable without the self-hosted gateway. Plus a fix for a live gateway-identity defect: `OCR_LLM_CLIENT_KEY` was undocumented in both env templates, so any deploy configured from them got `401` on every AI call
- v0.16.3 — fix: editor clicks landed on the wrong line in notes containing `---` horizontal rules (unmeasured CSS margins on line decorations desynced CodeMirror's height map); plus CI + mechanical convention guards ([.github/workflows/ci.yml](.github/workflows/ci.yml), [scripts/ci-guards.sh](scripts/ci-guards.sh))
- v0.16.2 — fix: [CR037](docs/cr/cr-037-multi-note-editor-tabs.md) list-route tab strip no longer collapses to zero height when the note list loads (flex-shrink bug — strip flashed then vanished on open)
- v0.16.1 — fix: [CR037](docs/cr/cr-037-multi-note-editor-tabs.md) tab strip now renders on the list route, so restored tabs are visible on app open (were hidden until a note was opened)
- v0.16.0 — [CR037](docs/cr/cr-037-multi-note-editor-tabs.md): multi-note editor tabs on desktop (keep several notes open, persisted across reloads)
- v0.15.2 — fix: HTML notes now export to PDF with their own styling (CR036 fidelity fix)
- v0.15.1 — fix: Google Drive `.html` imports now render as HTML notes (were placeholder-only)
- [CR036](docs/cr/cr-036-export-note-as-pdf.md) — Export note as PDF (relabelled print flow, markdown + HTML) (v0.15.0)

## In progress / next
- [CR038](docs/cr/cr-038-pluggable-ai-providers.md) — Pluggable AI providers (**in progress**): still open: `translateText` and `/system/stats` are gateway-only, `generateTextStream` is not cancellable, and no path has been verified against a real cloud key. Phases 2 (OCR) and 3 (transcription) not started
- [CR039](docs/cr/cr-039-research-sources-highlights.md) — Research sources (**in progress**): A1, B, A2 and A3 shipped. **Phase C (web highlights) shipped.** Next is D (PDF highlights, paired with [CR025](docs/cr/cr-025-pdf-document-management.md) — PDF document management), then E (after [CR001](docs/cr/cr-001-pgvector-embeddings.md) — pgvector embeddings). The ocr-llm handoff `noted-source-metadata-task` is closed (task live, routed via `/task`)
- [CR026](docs/cr/cr-026-activity-rail-navigation.md) — Activity rail + contextual panel navigation (**in progress**)
- [CR025](docs/cr/cr-025-pdf-document-management.md) — PDF document management (open)
- **Phase 8 — LLM intelligence:** foundation [CR001](docs/cr/cr-001-pgvector-embeddings.md)
  (pgvector + embeddings) unblocks semantic search, related notes, NL query.
  Full roadmap: [project-roadmap.md](docs/current/project-roadmap.md).

## Where things live
- **Conventions, tech stack, dev/prod commands:** [CLAUDE.md](CLAUDE.md)
- **Key source files map:** [docs/guides/key-files.md](docs/guides/key-files.md)
- **Deploy / ops runbooks:** [docs/guides/deployment.md](docs/guides/deployment.md)
- **Docs conventions:** [docs/documentation-standard.md](docs/documentation-standard.md)
- **Secret names + locations (never values):** [docs/current/secrets-inventory.md](docs/current/secrets-inventory.md)
- **Agent layer** (rules, skills, reviewers, reference playbooks — gitignored, synced from the private starter pack v1.9.4): `.claude/` — see `.claude/rules/README.md`, `.claude/agents/README.md`, `.claude/reference/README.md`
- **Integrated LLM/OCR service:** separate `ocr-llm/` repo — see CLAUDE.md
