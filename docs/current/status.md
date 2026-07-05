# Status

> Session snapshot — the one doc to read first. Everything else is read on demand.
> This file links onward; it does not restate facts. Ship dates/versions live only
> in the [CR index](docs/cr/README.md).

**Project:** Noted — self-hosted, Markdown-first personal knowledge & task app
(Vue 3 + Fastify + PostgreSQL). Full description: [project-description.md](docs/current/project-description.md).

**Current version:** v0.15.0 · **Live:** `https://noted.tail413695.ts.net`
(containers `noted-db`, `noted-api`, `noted-web`).

## Recently shipped
See the [CR index](docs/cr/README.md) for the authoritative list. Latest headlines:
- [CR036](docs/cr/cr-036-export-note-as-pdf.md) — Export note as PDF (relabelled print flow, markdown + HTML) (v0.15.0)
- [CR034](docs/cr/cr-034-drive-reconnect-startup-notice.md) — Google Drive reconnect notice at app startup (v0.14.0)
- [CR033](docs/cr/cr-033-vault-entry-groups.md) — Vault entry grouping headers (v0.13.0)

## In progress / next
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
- **Integrated LLM/OCR service:** separate `ocr-llm/` repo — see CLAUDE.md
