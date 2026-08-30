# CR038 — Pluggable AI Providers (Claude / OpenAI / Local)

**Status:** In progress — Phase 1 backend complete: foundation (crypto, `020` schema, config repo), gateway-default dispatch seam, settings endpoints (SSRF-validated), cloud adapters (anthropic/openai/openai_compatible), call-site wiring (quick/deep/condense tiers), and a live Test-connection — all shipped & tested (mock-tested for network paths; live end-to-end verification with a real key pending). Remaining: frontend "AI Providers" UI + provider-aware `/stats`/modal.
**Severity:** Feature (large — phased)
**Origin:** User request, 2026-08-30 (open-source enablement)
**Reviewed:** 2026-08-30 — architecture + security review; findings folded in below.

## Problem

All AI features route through a single, hardcoded self-hosted LLM gateway.
[llmService.js](backend/src/services/llmService.js) is a thin client for that
gateway's endpoints (`/ocr`, `/translate`, `/transcribe`, `/task`,
`/llm/generate`), with the base URL in `LLM_GATEWAY_URL`. This is fine for the
original single-operator deployment, but the project is now **open source**
([[project_open_source]]) and **no other user has that gateway**. Today the only
path for outside users is `LLM_ENABLED=false` — i.e. no AI at all.

To make AI genuinely usable by others, a user should be able to pick a provider
— **Anthropic (Claude), OpenAI, or a local/OpenAI-compatible endpoint** — supply
their own API key (and a base URL for the local case), and have the AI features
work against it.

## Decision

**Introduce a provider-abstraction layer behind the existing `llmService`
surface, and ship it in phases by capability.** The rest of the app keeps calling
the same `llmService` functions; only the transport underneath changes.

Design commitments (the first three are load-bearing — see Review findings):

1. **Capability matrix, not one global switch.** Providers differ in what they
   can do (see below), so configuration is *per capability* — e.g. "Text: Claude,
   OCR: local, Transcription: off" — rather than a single provider dropdown that
   would silently break features a given provider can't perform. The text
   capability additionally carries a **per-tier model map** (quick / deep /
   condense), because AI Assist (CR019) relies on those tiers — a single "model"
   is insufficient.

2. **The current gateway is its own adapter — not "generic local."** The gateway
   is driven through `POST /task` with server-side task routing
   (`noted_ai_assist_quick` / `noted_ai_assist_deep`), fallback chains, and a
   tier-health snapshot (`getGatewayHealth`). A generic OpenAI-compatible/Ollama
   endpoint (`/v1/chat/completions` or `/api/generate`) has none of that.
   Collapsing them into one adapter would silently regress the existing
   deployment. Therefore: a distinct **`gateway`** adapter preserving today's
   `/task` behavior, and a separate **`openai-compatible`** adapter. **When no AI
   provider is configured, the system uses the `gateway` adapter driven by the
   existing `LLM_*` env vars — so "unconfigured" == "exactly today."**

3. **Server-side symmetric encryption for keys — NOT the vault's crypto.** The
   vault ([cr-020](docs/cr/cr-020-encrypted-password-vault.md)) is *zero-knowledge*:
   the key is derived in the browser and never reaches the server. AI provider
   keys are the opposite requirement — the **server must decrypt them unattended**
   to call Anthropic/OpenAI (including from background jobs with no user session).
   The vault approach is therefore architecturally impossible here and must not be
   reused. Instead: **AES-256-GCM with a master key held ONLY in an env var
   (`AI_KEYS_ENC_KEY`, generated via `openssl rand -hex 32`), never stored in the
   database.** If the env key is missing, AI **fails closed** (features disabled),
   never falls back to plaintext. This is explicitly *not* zero-knowledge; it
   cannot be, and the security boundary now includes protecting `.env.prod`.

### Provider capability reality

| Capability | Anthropic (Claude) | OpenAI | Local (Ollama / OpenAI-compatible) | Gateway (`/task`) |
|-----------|--------------------|--------|-------------------------------------|-------------------|
| Text generation | ✅ Messages API (SSE) | ✅ Chat Completions (SSE) | ✅ `/v1/chat/completions` or `/api/generate` (NDJSON) | ✅ `/task` + fallback chains |
| OCR | ✅ via vision | ✅ via vision | ✅ dedicated `/ocr` | ✅ `/ocr` |
| Translation | ✅ (text-gen prompt) | ✅ (text-gen prompt) | ✅ (text-gen prompt) | ✅ dedicated `/translate` |
| Transcription (audio) | ❌ no audio API | ✅ Whisper | ✅ `/transcribe` | ✅ `/transcribe` |

Transcription has **no** Claude path — the settings UI must reflect that.

> **Model IDs / pricing must not be hardcoded from memory.** Before implementing
> the Anthropic adapter, load the `claude-api` skill for current model IDs,
> parameters, pricing, and the exact streaming event shapes. Default to the
> latest capable Claude models. Confirm OpenAI/Ollama stream shapes at
> implementation time too.

## Security design (committed — do not defer to pre-ship review)

These are architectural and cannot be cheaply retrofitted, so they are part of
the design, not the later review:

- **Key encryption & storage.** AES-256-GCM; master key from `AI_KEYS_ENC_KEY`
  env only. Schema stores `key_ciphertext BYTEA` + `key_iv BYTEA` — **never**
  plaintext (unlike the existing Google-token table, which is plaintext and is
  out of scope here but noted for future hardening). A restored DB backup without
  the env key must yield no plaintext key.
- **SSRF controls for the user-supplied local base URL.** The server issues
  authenticated requests to this host, so: validate scheme (https; http only when
  the operator opts in), resolve the host and **reject loopback / link-local /
  private ranges** (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`,
  `169.254/16`, `::1`, ULA) unless an operator allowlist env var is set; validate
  the *resolved IP* and pin it for the request to defeat DNS rebinding; cap
  redirects. "Test connection" returns a generic pass/fail — never the raw
  upstream body.
- **No key leakage in logs/errors.** AI adapters must never log request headers or
  full request objects; the logger redacts `Bearer` / `sk-` / `x-api-key`
  patterns; adapter errors carry status + a safe message only, never the key or
  upstream body (today's code folds upstream bodies into thrown errors — must
  change for the AI path).
- **Multi-user forward guard.** Instance-wide keys assume a single trusted
  operator. **Before CR011 (multi-user) ships, AI config endpoints MUST be gated
  to an admin/operator role and the SSRF controls above MUST be in place** — a
  shared key plus user-controlled base URL is unsafe in a multi-tenant deployment.

## Configuration precedence & backward compatibility

- **DB config wins when present; otherwise fall back to the existing env-driven
  gateway path.** An upgrading operator with zero DB rows keeps working exactly as
  today (the `gateway` adapter + their current `LLM_*` env).
- **Retained env vars:** `LLM_ENABLED` (global kill switch), all `*_TIMEOUT_MS` /
  `*_MAX_CHARS`, and the full gateway config (`LLM_GATEWAY_URL`,
  `LLM_TASK_ENABLED`, `OCR_LLM_CLIENT_KEY`, `LLM_QUICK/DEEP/CONDENSE_MODEL`) —
  these drive the `gateway` adapter.
- **New env var:** `AI_KEYS_ENC_KEY` (required only once a non-gateway provider is
  configured).

## Scope

### Phase 1 — Text generation (target first ship)

- Adapter interface for chat/generation with implementations: `anthropic`,
  `openai`, `openai-compatible` (Ollama + generic), and `gateway` (preserves
  `/task` + fallback chains + `getGatewayHealth`).
- Per-tier model resolution: `generateText({ taskName, ... })` maps
  `noted_ai_assist_quick|deep` (and the condense model) to a provider model.
- Server-side encrypted storage of the text provider config + key.
- **`translateText` refactor:** prompt-based via the text adapter for cloud
  providers; keep the dedicated `/translate` for the `gateway` adapter. Preserve
  the existing truncation/marker + `TRANSLATE_TIMEOUT_MS` behavior.
- **Streaming:** per-adapter parsing — NDJSON (gateway/Ollama) vs SSE
  (Anthropic `content_block_delta`, OpenAI `data:`/`[DONE]`) — normalized to the
  existing `onChunk(text)` contract; per-provider token-usage mapping. Add
  `signal` / `timeoutMs` to `generateTextStream` (currently missing) so cloud
  streams are cancellable.
- Settings UI: choose the text provider, enter a key (masked, write-only), set
  base URL/model(s), and **Test connection**.
- **Provider-aware status surfaces:** update `/ai-assist/config` and
  `/api/v1/system/stats` (and the `AIAssistModal.vue` tooltips / heavy-tier
  warning) to report the active provider + generic reachability; only include
  `heavyAvailable` / `gatewayHealth` for the `gateway` provider.

### Phase 2 — OCR

- Extend adapters with an OCR capability: vision-based for Claude/OpenAI, `/ocr`
  for gateway/local. **The gateway `/ocr` stays the default at attachment upload
  and clip capture until an OCR provider is explicitly configured** (else existing
  OCR regresses).

### Phase 3 — Transcription

- Whisper (OpenAI) and `/transcribe` (gateway/local). Claude shown as
  "not supported."

### Out of scope (for now)

- **Embeddings** (pgvector pipeline, CR001). Not delivered here, BUT the
  capability enum **reserves `embeddings`** and the adapter/config storage is
  shaped so CR001 can add it without reshaping — CR001 blocks CR002/003/014, so
  don't paint it into a corner.
- Per-user (multi-tenant) provider config; start **instance-wide** (see the
  multi-user forward guard above).
- Automatic cost tracking / budgeting UI.
- Hardening the existing plaintext Google-token storage.

## Backend

| Area | Change |
|------|--------|
| `backend/src/services/ai/` (new) | Adapter interface + `anthropic`, `openai`, `openai-compatible`, `gateway` implementations. Per-capability + per-tier resolution. Normalises request/response/stream so `llmService` callers are unchanged. |
| [llmService.js](backend/src/services/llmService.js) | Becomes a dispatcher over the configured adapter per capability. Keep exported signatures; add `signal`/`timeoutMs` to `generateTextStream`; strip upstream bodies from thrown errors on the AI path. |
| [aiAssist.js](backend/src/routes/aiAssist.js) / [aiAssistJobRunner.js](backend/src/services/aiAssistJobRunner.js) | Route quick/deep through the adapter; async deep path must decrypt keys without a user session (drives the server-side-key requirement). |
| [system.js](backend/src/routes/system.js) | Make `/stats` LLM fields provider-aware (no gateway `/health`/`/llm/models` assumptions for cloud). |
| AI settings storage | New table, forward-only migration: `ai_provider_config(capability, provider, base_url, model_json, key_ciphertext BYTEA, key_iv BYTEA, …)`. Keys AES-256-GCM via `AI_KEYS_ENC_KEY`; write-only from the API. |
| Settings + test endpoints | `GET/PUT` AI config under `/api/v1/` (`{ data, meta }`); per-provider "test connection" (tiny generation for cloud, `/api/tags` or small generate for local, `/health` for gateway) using the submitted-but-unsaved key; SSRF-validated. |
| `.env.example` / `.env.prod.example` | Add `AI_KEYS_ENC_KEY` with an `openssl rand -hex 32` note (like `JWT_SECRET`). |

## Frontend

| Area | Change |
|------|--------|
| Settings view | New "AI Providers" section: per-capability provider select, per-tier model fields (text), masked key entry, base URL for local, Test button. `ConfirmModal` for clearing a key. |
| [AIAssistModal.vue](frontend/src/components/ai/AIAssistModal.vue) | Make gateway-specific tooltips / heavy-tier-offline warning conditional on the `gateway` provider. |
| AI Assist / translate UI | Clear "AI not configured / disabled" state per capability. |

## Acceptance

- [ ] With no provider configured (or `LLM_ENABLED=false`), behavior is **exactly
      as today**: the `gateway` adapter drives `/task` with quick/deep routing,
      fallback chains, and heavy-tier health intact (no regression).
- [ ] With a valid Anthropic key for Text, AI Assist **quick + deep** and
      translation work end-to-end; streaming still streams; deep runs async
      without a user session.
- [ ] Same with an OpenAI key, and with a local/OpenAI-compatible base URL + model.
- [ ] Inspecting the DB **and a restored backup** shows only ciphertext for keys;
      `AI_KEYS_ENC_KEY` is absent from both; a backup restored without it yields no
      plaintext key.
- [ ] No API key or auth-header value appears in application logs across success,
      401/auth-failure, and timeout paths.
- [ ] A base URL pointing at loopback / link-local / private ranges is rejected by
      both save and Test connection; Test-connection failure does not persist the
      key and its response omits the raw upstream body.
- [ ] `/ai-assist/config`, `/system/stats`, and the modal render correctly (no
      stale gateway-only fields) under a cloud provider.
- [ ] Transcription settings show Claude as unsupported; OCR/transcription phases
      ship without reworking Phase 1; gateway `/ocr` remains the upload/clip
      default until an OCR provider is configured.
- [ ] Model IDs/params verified against the `claude-api` skill (manual, not
      CI-automatable — checklist item); production build passes.

## Risks

1. **Key security** — the central risk. Server-held AES-256-GCM key in env only,
   never in DB/backup; write-only key fields; log redaction; SSRF controls. A
   security review verifies these are implemented as designed (it does not stand
   in for the design decisions above).
2. **Silent regression of the existing gateway deployment** — mitigated by the
   dedicated `gateway` adapter + "unconfigured == today" default + the explicit
   backward-compat acceptance criterion.
3. **SSRF via user-supplied base URL** — mitigated by the committed SSRF policy;
   becomes higher-severity if CR011 lands without the admin-gate guard.
4. **Cost surprises** — a user's key runs up real charges. Mitigation: document
   clearly; reuse existing size caps / timeouts.
5. **Provider API drift** (model IDs, request/stream shapes). Mitigation: thin,
   version-pinned adapters; re-check `claude-api` skill + provider docs at
   implementation.
