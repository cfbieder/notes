# CR019 — AI Assist: Quick / Deep-Think Modes + Async Inbox Delivery

**Status:** Completed (2026-04-26)
**Origin:** Phase 8.12.x (extension of shipped AI Assist)
**Depends on:** ocr-llm tasks `noted_ai_assist_quick` + `noted_ai_assist_deep` (handoff filed 2026-04-25, commit `96a379d` on `cfbieder/ocr-llm`)
**Blocks:** none

## Problem

The current AI Assist modal exposes a model dropdown that surfaces gateway model names (`qwen3:32b`, `phi4:14b`, …) directly to the user. That's a leaky abstraction — users shouldn't have to think in model names — and it offers no path to "send this prompt and walk away," which is the natural mode for the largest local model where requests can take minutes.

## Goal

Replace the model dropdown with a two-button mode toggle:

1. **Quick note** *(default)* — synchronous, streams into the existing preview pane. Same UX as today, just always backed by the fast tier.
2. **Deep think** — fire-and-forget. The user can close the modal (or the whole tab); when the gateway responds, a new note appears in the inbox with a toast notification.

## Scope

### Frontend (`frontend/src/components/ai/AIAssistModal.vue`)

- Remove the model dropdown in the header (the localStorage-persisted model selection too).
- Add a two-segment mode toggle in the same area: **Quick note** / **Deep think**, with default = quick. Persist last choice to localStorage.
- Quick mode: unchanged from today (streaming → preview → save / insert at cursor).
- Deep mode:
  - "Generate" button label flips to **"Send to deep think"**.
  - Submit calls `POST /api/v1/ai-assist/jobs { prompt, noteIds, condense, mode: 'deep' }` and closes the modal immediately on `201`.
  - Backend returns `409 job_in_progress` if the user already has a pending/running deep-think job — modal shows an inline error and stays open.

### Frontend — pending pill + completion toast

- `frontend/src/stores/aiAssist.js` gains a `pendingJobs` array kept fresh by the existing 60-second poll loop (alongside reminders) calling `GET /api/v1/ai-assist/jobs?status=pending,running`.
- New small component `frontend/src/components/ai/AIAssistPendingPill.vue` renders next to the AI Assist sidebar entry whenever `pendingJobs.length > 0`. Tooltip: prompt + elapsed time. **Cancel** action calls `DELETE /api/v1/ai-assist/jobs/:id`.
- On poll, any job whose status transitions `pending|running → completed` triggers a sticky toast via `frontend/src/stores/toasts.js`: *"Deep-think note ready: '{title}'"* with **View** action navigating to `/notes/{id}`. Status `failed` triggers an error toast: *"Deep-think failed: {short reason}"*. Session-deduped via `sessionStorage` (same pattern as reminders).

### Backend — jobs table + worker

- New migration `backend/migrations/016_ai_assist_jobs.sql`:
  ```sql
  CREATE TABLE ai_assist_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode          TEXT NOT NULL CHECK (mode IN ('deep')),  -- only deep is async
    status        TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
    prompt        TEXT NOT NULL,
    note_ids      UUID[] NOT NULL DEFAULT '{}',
    condense      BOOLEAN NOT NULL DEFAULT FALSE,
    model         TEXT,                                    -- filled when worker picks one
    result_note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ
  );
  CREATE INDEX ai_assist_jobs_user_active_idx
    ON ai_assist_jobs(user_id) WHERE status IN ('pending','running');
  ```

- `backend/src/routes/aiAssist.js` gains:
  - `POST /api/v1/ai-assist/jobs` — validates, enforces one-active-job-per-user (409 `job_in_progress`), inserts `pending` row, kicks off the worker (no `await`), returns `{ data: { jobId } }`.
  - `GET /api/v1/ai-assist/jobs?status=...` — list jobs for the current user, newest first, with optional status filter.
  - `GET /api/v1/ai-assist/jobs/:id` — single job detail.
  - `DELETE /api/v1/ai-assist/jobs/:id` — cancel: marks `cancelled` and aborts the in-flight gateway request via the per-job `AbortController`.

- New module `backend/src/services/aiAssistJobRunner.js`:
  - In-process Map of `jobId → AbortController` for cancellation.
  - `runJob(jobId)` flow: mark `running` → fetch input notes → optional condense step (existing `LLM_CONDENSE_MODEL`) → call `llmService.generateText` → on success, create the inbox note (`is_inbox=true`, `notebook_id=<user's default Inbox notebook>`, `is_ai_generated=true`, `ai_prompt=<prompt>`, body = LLM output + `## Sources` wikilinks), mark `completed` with `result_note_id`. On error, mark `failed` with `error_message`. On `AbortError`, mark `cancelled`.
  - Startup hook (`backend/src/app.js`): on boot, mark any `pending` or `running` rows as `failed` with reason `"server restart"` — they can't be resumed. Surfaces as a toast on next poll.

### Backend — gateway integration

- `backend/src/services/llmService.js` gains a `taskName` option to `generateText`:
  - When provided and `LLM_TASK_ENABLED=true` (default `true`): `POST /task { task: taskName, prompt, max_tokens, stream? }`.
  - Otherwise: existing `POST /llm/generate` path (model-name-based) — kept as a fallback for the period before the gateway tasks ship.
- Quick path passes `taskName: 'noted_ai_assist_quick'`; deep path passes `taskName: 'noted_ai_assist_deep'`.
- Until the tasks land server-side, deploy with `LLM_TASK_ENABLED=false` and use `LLM_QUICK_MODEL=phi4:14b` / `LLM_DEEP_MODEL=qwen3.6:35b-a3b-q4_K_M` as the bridging defaults.

### Cleanup

- Drop `GET /ai-assist/models` and the frontend `noted.aiAssist.model` localStorage key (replaced by mode toggle).
- Keep prompt history, condense-sources checkbox, token gauge, insert-at-cursor (quick mode only) untouched.

### UX follow-up (2026-04-26)

- Modal can no longer be dismissed via `Escape`, click-outside, or a header **×**. Only the explicit Cancel / Generate / Send to deep think / Discard / Save as note / Insert at cursor buttons close it. Reason: the prompt textarea is too easy to lose to a stray click, and an in-flight quick-mode stream shouldn't be killed by hitting Esc on the wrong window. Submit shortcut `⌘/Ctrl+Enter` is preserved.

### Task routing flip + heavy-tier hint (2026-04-26)

ocr-llm shipped `noted_ai_assist_quick` and `noted_ai_assist_deep` (handoff response in `~/ocr-llm/HANDOFFS.md` 2026-04-26 entry; `GET /task/routes` confirms 37 tasks now). Follow-on changes:

- **`LLM_TASK_ENABLED=true`** in `backend/.env.dev` and `backend/.env.prod`; new `LLM_TASK_ENABLED: ${LLM_TASK_ENABLED:-false}` line in `docker-compose.prod.yml`. Both modes now route via `POST /task` with the registered fallback chain (`ollama_fast → ollama_mid → claude` for quick; `ollama_heavy → claude → ollama_mid` for deep).
- **Heavy-tier-offline defensive UI:** `llmService.getGatewayHealth()` hits `GET /health` (3s timeout, fails to `null`); `/ai-assist/config` now returns `heavyAvailable` + the full `gatewayHealth` snapshot. When the modal is in deep mode and `heavyAvailable === false`, an extra warn line appears: *"Heavy tier is offline — deep think will fall through to the cloud model. Expect ~5–10s longer than usual."* Hint disappears automatically when the heavy tier reconnects.

End-to-end test confirmed: deep submission lands on `qwen3.6:35b-a3b-q4_K_M` via the heavy primary; `taskRouting: true` in the config response.

## Acceptance Criteria

- Quick mode behaves exactly as today, but always uses the fast tier (visible speed gain vs. current default).
- Deep mode submission closes the modal immediately. The pending pill appears next to the sidebar entry until the job lands or is cancelled.
- Cancelling a running deep-think job stops the gateway request and clears the pill within ~1s; no inbox note is created.
- Successful deep-think delivers a new inbox note (`is_inbox=true`, sources wikilinked) and a sticky "View" toast within one poll cycle of completion.
- Failed deep-think delivers an error toast; no inbox note created; row recorded with `error_message`.
- Backend restart marks in-flight jobs as `failed` and surfaces them on next poll.
- A second deep-think submission while one is active returns `409` and shows an inline error in the modal.
- All changes work with `LLM_ENABLED=false` (endpoint returns `503`, modal shows disabled state — same as today).

## Implementation Order

1. Migration `016_ai_assist_jobs.sql`.
2. Backend job runner + routes (with `LLM_TASK_ENABLED=false` bridging — uses `/llm/generate` per-model).
3. Frontend mode toggle + deep-think submission path + pending pill + completion toast.
4. Once ocr-llm confirms the two tasks are live (handoff response in `~/ocr-llm/HANDOFFS.md`): flip `LLM_TASK_ENABLED=true` in `.env.prod` and verify both modes route through `/task`.

## References

- Handoff filed: `~/ocr-llm/HANDOFFS.md` 2026-04-25 entry, commit `96a379d`.
- AI Implementation Guide §4: `~/ocr-llm/Documentation/Guides/AI_IMPLEMENTATION_GUIDE.md`.
- Existing AI Assist (Phase 8.12 / 8.12.1): see `NOTED_CURRENT_STATE.md` §5.6.4.
- Reminders polling pattern (the model for the pending-pill / completion-toast loop): `NOTED_CURRENT_STATE.md` §5.5.
