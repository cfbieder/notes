# Key Files

Navigational map of the most-touched source files. Orientation only — the
authoritative description of each subsystem lives in
[project-description.md](docs/current/project-description.md).

| File | Purpose |
|------|---------|
| `backend/src/app.js` | Fastify server entry point |
| `backend/src/plugins/db.js` | PostgreSQL connection pool |
| `backend/src/utils/migrate.js` | Migration runner |
| `backend/migrations/` | SQL migration files |
| `frontend/src/main.js` | Vue app entry point |
| `frontend/src/router/index.js` | Route definitions |
| `frontend/src/api/client.js` | API fetch wrapper with JWT handling |
| `frontend/src/styles/theme.css` | Sapphire/Dark/Light theme palettes (CSS vars under `:root[data-theme="..."]`) |
| `frontend/src/stores/ui.js` | UI store — `theme` + `setTheme()`, `applyTheme()` + `loadTheme()` helpers, dispatches `noted:theme-change` |
| `frontend/src/lib/codemirror/sapphireTheme.js` | CodeMirror editor theme (uses CSS vars, adapts to active theme) |
| `docker-compose.dev.yml` | Dev PostgreSQL container |
| `docker-compose.prod.yml` | Production stack (DB + API + Nginx) |
| `backend/Dockerfile` | Backend multi-stage build |
| `frontend/Dockerfile` | Frontend multi-stage build (Vite → Nginx) |
| `nginx/noted.conf` | Nginx SSL, SPA routing, API proxy |
| `scripts/deploy-to-production.sh` | Full deploy orchestration |
| `scripts/setup-certs.sh` | TLS cert provisioning via `tailscale cert` |
| `scripts/backup-db.sh` | Local pg_dump backup |
| `scripts/backup-to-remote.sh` | SSH remote backup |
| `scripts/setup-cron.sh` | Cron job installer |
| `backend/src/services/driveImporter.js` | Google Drive file import logic |
| `backend/src/services/drivePoller.js` | Google Drive polling scheduler |
| `backend/src/routes/integrations.js` | Google Drive OAuth + config + scan API |
| `frontend/src/views/SettingsView.vue` | Settings page (theme picker, password, Google Drive integration) |
| `backend/src/services/wikilinkParser.js` | Wikilink extraction and resolution |
| `backend/src/routes/links.js` | Backlinks, unlinked mentions, local graph APIs |
| `backend/src/routes/graph.js` | Full knowledge graph API |
| `frontend/src/views/GraphView.vue` | D3.js knowledge graph visualization |
| `backend/src/routes/clips.js` | Web clipper ingestion endpoint (`POST /api/v1/clips`) |
| `backend/src/services/llmService.js` | LLM gateway client (OCR now, embeddings/generation later) |
| `backend/tests/phase7-clips.test.js` | Web clipper API integration tests |
| `clipper/` | Chrome MV3 web-clipper extension (manifest, background, popup, options, vendor libs) |
| `backend/src/routes/aiProviders.js`, `backend/src/services/ai/` | Pluggable AI providers — Claude / OpenAI / local endpoint, encrypted keys (CR038) |
| `backend/src/routes/research.js` | Research API — books, chapters, sources, reference export, fetch-text (CR039) |
| `backend/src/routes/highlights.js` | Highlights API — create/edit/delete, browser-reported anchor statuses, chapter highlights (CR039) |
| `backend/src/services/sourceService.js` | Source creation (shared with `POST /clips`) and the `MEMBERS` chapter-membership subquery (CR039) |
| `backend/src/services/citationFormatter.js` | Chicago bibliography + Key Passages renderer (HTML / Markdown / text) (CR039) |
| `backend/src/services/pageArticle.js`, `backend/src/utils/pageFetch.js` | Fetch text: SSRF-guarded page fetch → Readability → Turndown (CR039) |
| `backend/src/services/citationMetadata.js`, `clipper/metadata.js` | Citation extractor, two copies kept identical by CI guard 8 (CR039) |
| `frontend/src/views/ResearchView.vue`, `frontend/src/stores/research.js` | Research library, chapter view (Sources / Passages), store (CR039) |
| `frontend/src/components/research/SourceReader.vue` | Reader view for a source: citation card, text or PDF view, highlight sidebar (CR039) |
| `frontend/src/components/research/PdfViewer.vue` | PDF.js viewer with page-anchored highlights — shared with CR025 (CR039 D) |
| `frontend/src/components/research/HighlightedBody.vue`, `HighlightPopover.vue`, `HighlightSidebar.vue` | Text highlights, the shared new-highlight popover, the sidebar (CR039) |
| `frontend/src/lib/anchoring.js`, `frontend/src/lib/highlightDom.js` | Browser-side quote anchoring (exact → fuzzy → orphaned) and DOM marking (CR039) |
| `frontend/src/components/research/SearchHighlights.vue` | Highlight results section on the search page (CR039) |
| `frontend/src/stores/toasts.js` | Global toast notification store |
| `frontend/src/components/ui/ToastContainer.vue` | Toast notification renderer (bottom-right stack) |
| `frontend/src/components/ui/ReminderPicker.vue` | Reusable reminder datetime picker with presets |
| `backend/tests/phase4-reminders.test.js` | Reminders enhancement tests (29 assertions) |
| `backend/src/routes/voice.js` | Voice note capture endpoint (`POST /api/v1/notes/voice`) |
| `backend/tests/phase8-voice.test.js` | Voice note capture tests (19 assertions) |
| `frontend/src/lib/codemirror/wikilinkRendering.js` | Wikilink rendering in editor |
| `frontend/src/lib/codemirror/wikilinkAutocomplete.js` | `[[` autocomplete in editor |
| `frontend/src/lib/codemirror/tableKeymap.js` | Source-mode Enter auto-row + Tab auto-extend inside GFM pipe tables |
| `frontend/src/lib/codemirror/markdownRendering.js` | Normal-mode decoration plugins (headings, lists, checkboxes, images, GFM table block widget) |
| `frontend/src/lib/tableParser.js` | Shared GFM pipe-table parse/serialize/align helpers |
| `frontend/src/components/ui/InsertTableModal.vue` | Rows/cols/alignment modal for inserting a new table |
| `frontend/src/components/ui/TableEditorModal.vue` | Click-to-edit grid editor for existing tables |
| `frontend/src/lib/printNote.js` | Print/PDF export — renders markdown to HTML via markdown-it |
| `frontend/src/stores/openTabs.js` | Open editor tabs (CR037) — persisted `{id,title,routeName}` list; active tab derived from route |
| `frontend/src/components/editor/EditorTabs.vue` | Desktop editor tab strip (CR037) — renders open tabs, emits select/close |
| `backend/src/routes/export.js` | Note export endpoint (`GET /api/v1/notes/export/:title`) |
| `backend/src/routes/system.js` | System stats endpoint (`GET /api/v1/system/stats`) |
| `frontend/src/components/ui/SystemStatusCard.vue` | Settings-page System Status card |
| `backend/src/routes/vault.js` | Encrypted vault endpoints (CR020) — `/api/v1/vault/{meta,entries}` |
| `backend/migrations/017_vault.sql` | `vault_meta` + `vault_entries` schema (zero-knowledge ciphertext storage) |
| `frontend/src/lib/vaultCrypto.js` | Argon2id KDF + AES-256-GCM encrypt/decrypt for vault entries |
| `frontend/src/lib/vaultExport.js` | Self-decrypting HTML emergency export (CR035) |
| `frontend/src/stores/vault.js` | Vault Pinia store — master key in module closure, 15-min idle timer |
| `frontend/src/views/VaultView.vue` | Vault setup / unlock / list view |
| `frontend/src/components/ui/VaultEntryModal.vue` | Vault entry create/edit modal |
| `frontend/src/components/ui/VaultExportModal.vue` | Vault emergency-export passphrase modal (CR035) |
