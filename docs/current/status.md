# Status

> Session snapshot — the one doc to read first. Everything else is read on demand.
> This file links onward; it does not restate facts. Ship dates/versions live only
> in the [CR index](docs/cr/README.md).

**Project:** Noted — self-hosted, Markdown-first personal knowledge & task app
(Vue 3 + Fastify + PostgreSQL). Full description: [project-description.md](docs/current/project-description.md).

**Current version:** v0.25.1 · **Live:** `https://noted.example.com` (placeholder — public repo;
the real Tailscale host is `CORS_ORIGIN` in `backend/.env.prod`) · containers `noted-db`, `noted-api`, `noted-web`.

## Recently shipped
See the [CR index](docs/cr/README.md) for the authoritative list. Latest headlines:
- v0.25.1 — fix: a link pasted into a new source's Title without `https://` again offers "use it as the URL and fetch details"
- v0.25.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase D**: PDF sources open in a page viewer where you highlight text; highlights hold at any zoom and carry the printed page number into Passages and the export. Plus: a failed highlight save keeps your comment
- v0.24.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **Phase C complete**: a chapter's **Passages** tab and a Key Passages section in the export; search finds highlights and filters by `is:source` / `ch:3`; clipper **v0.6.0** highlights text on a live page (reload the extension). Plus a search-snippet escaping fix and a Refresh button on the Research page
- v0.23.0 — [CR039](docs/cr/cr-039-research-sources-highlights.md) **highlights**: select text in a source to highlight it with a meaning, chapter and comment; highlights re-anchor after text changes (fuzzy, or kept as unanchored). Plus **Fetch text**, which captures a source's article from its URL
- v0.22.2 — upload limit set to 25 MB everywhere (`MAX_FILE_SIZE` mapped in prod; Drive imports 10 → 25 MB)
- Older releases: see the [CR index](docs/cr/README.md) and the roadmap's "Recently Completed".

## In progress / next
- [CR038](docs/cr/cr-038-pluggable-ai-providers.md) — Pluggable AI providers (**in progress**): still open: `translateText` and `/system/stats` are gateway-only, `generateTextStream` is not cancellable, and no path has been verified against a real cloud key. Phases 2 (OCR) and 3 (transcription) not started
- [CR039](docs/cr/cr-039-research-sources-highlights.md) — Research sources (**in progress**): A1, B, A2 and A3 shipped. **Phases C (web highlights) and D (PDF highlights) shipped.** Next is E (after [CR001](docs/cr/cr-001-pgvector-embeddings.md) — pgvector embeddings). Small follow-ups (page labels in highlight search, `is:source`/`ch:` in the Help modal, `scope=highlighted`, scanned-PDF highlighting) are on the roadmap's "Deferred from CR039" list. The ocr-llm handoff `noted-source-metadata-task` is closed (task live, routed via `/task`)
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
