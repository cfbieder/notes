# CR038 — Pluggable AI Providers (Claude / OpenAI / Local)

**Status:** Open (proposal)
**Severity:** Feature (large — phased)
**Origin:** User request, 2026-08-30 (open-source enablement)

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

Three design commitments:

1. **Capability matrix, not one global switch.** Providers differ in what they
   can do (see below), so configuration is *per capability* — e.g. "Text: Claude,
   OCR: local, Transcription: off" — rather than a single provider dropdown that
   would silently break features a given provider can't perform.
2. **Keys live server-side, encrypted at rest, never sent to the browser.** This
   is the security-critical part for a self-hosted OSS app: a leaked key is
   someone else's bill. Reuse the vault's encryption approach where practical.
3. **Phased delivery.** Text generation first (highest value, cleanest
   abstraction), then OCR, then transcription. Do not attempt all three at once.

### Provider capability reality

| Capability | Anthropic (Claude) | OpenAI | Local (Ollama / OpenAI-compatible) |
|-----------|--------------------|--------|-------------------------------------|
| Text generation | ✅ Messages API | ✅ Chat Completions | ✅ (`/v1/chat/completions` or `/api/generate`) |
| OCR | ✅ via vision (image in message) | ✅ via vision | ✅ dedicated `/ocr` (current gateway) |
| Translation | ✅ (text-gen) | ✅ (text-gen) | ✅ (text-gen) |
| Transcription (audio) | ❌ no audio API | ✅ Whisper | ✅ gateway `/transcribe` |

Translation is just constrained text-gen, so it comes "for free" with Phase 1.
Transcription has **no** Claude path — the settings UI must reflect that.

> **Model IDs / pricing must not be hardcoded from memory.** Before implementing
> the Anthropic adapter, load the `claude-api` skill for current model IDs,
> parameters, and pricing. Default to the latest capable Claude models.

### Considered and rejected

- **Single global "AI provider" dropdown.** Simplest UI, but breaks the moment a
  user picks Claude and expects transcription, or a text-only local model and
  expects OCR. Rejected in favour of the per-capability matrix.
- **Client-side API keys (entered in the browser, sent per request).** Zero
  server storage, but exposes keys to the frontend and anyone with devtools.
  Rejected on security grounds — keys stay server-side.
- **Keep gateway-only, document "bring your own gateway".** Lowest effort, but
  leaves 99% of potential users unable to use AI without standing up a whole
  separate service. Rejected as the primary path (the gateway remains *one* of
  the supported local options).

## Scope

### Phase 1 — Text generation (target first ship)

- Provider adapter interface for chat/generation with three implementations:
  Anthropic, OpenAI, and OpenAI-compatible/local (covers Ollama + the existing
  gateway's `/llm/generate`).
- Server-side, encrypted storage of the selected text provider + key (+ base URL
  and model for the local case).
- Settings UI to choose the text provider, enter a key, set base URL/model, and
  **test the connection**.
- Route `generateText` / `generateTextStream` (and therefore AI Assist +
  translation) through the adapter. Preserve streaming.

### Phase 2 — OCR

- Extend the adapter with an OCR capability: vision-based for Claude/OpenAI
  (image → text prompt), dedicated `/ocr` for the local gateway.
- Per-capability provider selection for OCR in settings.

### Phase 3 — Transcription

- Whisper (OpenAI) and gateway `/transcribe` (local) adapters. Claude shown as
  "not supported" for this capability.

### Out of scope (for now)

- Embeddings provider abstraction (pgvector pipeline, CR001) — separate concern.
- Per-user (multi-tenant) provider config; start **instance-wide** (single
  operator) and revisit if/when multi-user (CR011) lands.
- Automatic cost tracking / budgeting UI.

## Backend

| Area | Change |
|------|--------|
| `backend/src/services/ai/` (new) | Provider adapter interface + `anthropic`, `openai`, `local` implementations. Normalises request/response so `llmService` callers are unchanged. |
| [llmService.js](backend/src/services/llmService.js) | Becomes a dispatcher over the configured adapter per capability, instead of a direct gateway client. Keep the same exported function signatures. |
| AI settings storage | New table (or reuse settings store) holding per-capability `{ provider, base_url, model }` + **encrypted** API keys. Forward-only migration. |
| Settings + connection-test endpoints | `GET/PUT` AI config under `/api/v1/` (`{ data, meta }` shape); a "test connection" action per provider. Keys write-only from the API (never returned). |

## Frontend

| Area | Change |
|------|--------|
| Settings view | New "AI Providers" section: per-capability provider select, key entry (masked), base URL/model for local, and a Test button. Use `ConfirmModal` for any destructive action (e.g. clearing a key). |
| AI Assist / translate UI | Surface a clear "AI not configured / disabled" state when no provider is set for that capability. |

## Acceptance

- [ ] With a valid Anthropic key configured for Text, AI Assist (quick + deep) and
      translation work end-to-end; streaming still streams.
- [ ] Same with an OpenAI key, and with a local/OpenAI-compatible base URL + model.
- [ ] API keys are stored encrypted at rest and are **never** returned by any API
      response or exposed to the frontend.
- [ ] "Test connection" reports success/failure per provider without saving on
      failure.
- [ ] With no provider configured (or `LLM_ENABLED=false`), the app behaves exactly
      as today — features degrade gracefully, no errors.
- [ ] Transcription settings show Claude as unsupported; OCR/transcription follow
      in their phases without reworking Phase 1.
- [ ] Model IDs/params verified against the `claude-api` skill (not hardcoded from
      memory); production build passes.

## Risks

1. **Key security** — the central risk. Keys must be encrypted at rest and never
   leave the server. Mitigation: reuse vault crypto; write-only key fields;
   security review before ship.
2. **Capability gaps** confusing users (e.g. expecting Claude transcription).
   Mitigation: the per-capability matrix + explicit "unsupported" UI.
3. **Cost surprises** — a user's key runs up real charges. Mitigation: document
   clearly; consider a simple per-call size cap (reuse existing `LLM_*_MAX_CHARS`
   / timeout patterns).
4. **Provider API drift** (model IDs, request shapes). Mitigation: keep adapters
   thin and version-pinned; re-check `claude-api` skill at implementation time.
