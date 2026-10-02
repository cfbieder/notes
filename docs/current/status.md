# Status

> Session snapshot — the one doc to read first. Everything else is read on demand.
> This file links onward; it does not restate facts. Ship dates/versions live only
> in the [CR index](docs/cr/README.md).

**Project:** Noted — self-hosted, Markdown-first personal knowledge & task app
(Vue 3 + Fastify + PostgreSQL). Full description: [project-description.md](docs/current/project-description.md).

**Current version:** v0.17.1 · **Live:** `https://noted.example.com`
(containers `noted-db`, `noted-api`, `noted-web`).

## Recently shipped
See the [CR index](docs/cr/README.md) for the authoritative list. Latest headlines:
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
