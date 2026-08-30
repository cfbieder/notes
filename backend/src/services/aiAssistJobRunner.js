// Async runner for AI Assist deep-think jobs.
//
// Lifecycle: routes/aiAssist.js inserts a 'pending' row and calls runJob(jobId)
// without awaiting. This module then:
//   1. marks the job 'running'
//   2. fetches input notes (optionally condenses each via the fast model)
//   3. assembles the prompt and calls llmService.generateText with the deep
//      task name (or bridging deep model when /task routing is disabled)
//   4. on success: creates a note in the user's default notebook (so it lands
//      in /inbox), is_ai_generated=true, and writes result_note_id
//   5. on error / abort: marks 'failed' or 'cancelled' with error_message
//
// Cancellation: each in-flight job has an AbortController in the in-process
// Map. DELETE /jobs/:id calls cancelJob(id), which aborts the upstream fetch
// and lets the runner mark the row 'cancelled'.

const llmService = require('./llmService');

const inflight = new Map(); // jobId -> AbortController

const CONDENSE_MODEL = process.env.LLM_CONDENSE_MODEL || 'phi4:14b';

function buildPrompt(userPrompt, notes) {
  const sections = notes.map(n => {
    const title = (n.title || 'Untitled').trim();
    const body = (n.content || '').trim();
    return `# ${title}\n\n${body}`;
  });
  const sourceBlock = sections.length > 0
    ? `You are given the following source notes:\n\n---\n\n${sections.join('\n\n---\n\n')}\n\n---\n\n`
    : '';
  return `${sourceBlock}User request:\n\n${userPrompt.trim()}\n\nRespond in Markdown. Do not repeat the source notes verbatim.`;
}

function buildSourcesBlock(sources) {
  if (!sources || sources.length === 0) return '';
  const lines = sources.map(s => `- [[${(s.title || 'Untitled').replace(/[\[\]]/g, '')}]]`);
  return `\n\n## Sources\n\n${lines.join('\n')}`;
}

function suggestTitle(prompt) {
  const trimmed = (prompt || '').trim().split('\n')[0];
  if (!trimmed) return 'AI Note';
  const short = trimmed.length > 60 ? trimmed.slice(0, 57).trim() + '…' : trimmed;
  return `AI: ${short}`;
}

async function condenseNote(note, ctx = {}) {
  const condensePrompt = `Condense the following note into 3-5 short bullet points capturing only the key ideas. Preserve any specific names, numbers, or dates. Reply with only the bullets — no preamble.

Title: ${note.title || 'Untitled'}

Content:
${(note.content || '').trim()}`;

  try {
    const res = await llmService.generateText({
      prompt: condensePrompt, model: CONDENSE_MODEL, tier: 'condense', userId: ctx.userId, db: ctx.db
    });
    if (res && res.text) return { ...note, content: res.text.trim() };
  } catch {
    // fall through to original on failure
  }
  return note;
}

async function loadNotesInOrder(db, userId, noteIds) {
  if (!noteIds || noteIds.length === 0) return [];
  const result = await db.query(
    `SELECT id, title, content
     FROM notes
     WHERE user_id = $1 AND id = ANY($2) AND deleted_at IS NULL`,
    [userId, noteIds]
  );
  const byId = new Map(result.rows.map(n => [n.id, n]));
  return noteIds.map(id => byId.get(id)).filter(Boolean);
}

function init({ db, log }) {
  function cancelJob(jobId) {
    const controller = inflight.get(jobId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  async function runJob(jobId) {
    const controller = new AbortController();
    inflight.set(jobId, controller);

    let jobRow;
    try {
      const jobRes = await db.query('SELECT * FROM ai_assist_jobs WHERE id = $1', [jobId]);
      jobRow = jobRes.rows[0];
      if (!jobRow) {
        log?.warn?.({ jobId }, 'ai-assist job vanished before runner started');
        inflight.delete(jobId);
        return;
      }
      if (jobRow.status === 'cancelled') {
        inflight.delete(jobId);
        return;
      }

      await db.query(
        `UPDATE ai_assist_jobs SET status = 'running', started_at = NOW() WHERE id = $1 AND status = 'pending'`,
        [jobId]
      );

      let notes = await loadNotesInOrder(db, jobRow.user_id, jobRow.note_ids || []);
      if (jobRow.condense && notes.length > 0) {
        notes = await Promise.all(notes.map(n => condenseNote(n, { userId: jobRow.user_id, db })));
      }
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const fullPrompt = buildPrompt(jobRow.prompt, notes);
      const sources = notes.map(n => ({ id: n.id, title: n.title }));

      const generated = await llmService.generateText({
        prompt: fullPrompt,
        taskName: 'noted_ai_assist_deep',
        tier: 'deep',
        userId: jobRow.user_id,
        db,
        signal: controller.signal,
        timeoutMs: llmService.GENERATE_DEEP_TIMEOUT_MS
      });

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!generated || !generated.text) {
        throw new Error('LLM returned no content');
      }

      // File the generated note into the user's default notebook so it lands
      // in /inbox for triage (CR032 — Inbox is derived from default notebook).
      const defaultNb = await db.query(
        'SELECT id FROM notebooks WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
        [jobRow.user_id]
      );
      const inboxNotebookId = defaultNb.rows[0]?.id || null;

      const title = suggestTitle(jobRow.prompt);
      const body = generated.text.trim() + buildSourcesBlock(sources);

      const noteRes = await db.query(
        `INSERT INTO notes (user_id, notebook_id, title, content, note_type, is_ai_generated, ai_prompt)
         VALUES ($1, $2, $3, $4, 'note', TRUE, $5)
         RETURNING id`,
        [jobRow.user_id, inboxNotebookId, title, body, jobRow.prompt]
      );
      const newNoteId = noteRes.rows[0].id;

      await db.query(
        `UPDATE ai_assist_jobs
         SET status = 'completed', completed_at = NOW(), result_note_id = $2, model = $3
         WHERE id = $1`,
        [jobId, newNoteId, generated.model || null]
      );
      log?.info?.({ jobId, noteId: newNoteId, model: generated.model }, 'ai-assist deep-think completed');
    } catch (err) {
      const isAbort = err?.name === 'AbortError';
      const status = isAbort ? 'cancelled' : 'failed';
      const message = isAbort ? 'Cancelled by user' : (err?.message || 'unknown error');
      try {
        await db.query(
          `UPDATE ai_assist_jobs
           SET status = $2, completed_at = NOW(), error_message = $3
           WHERE id = $1 AND status NOT IN ('completed','cancelled')`,
          [jobId, status, message]
        );
      } catch (updateErr) {
        log?.error?.({ jobId, err: updateErr }, 'ai-assist job status update failed');
      }
      if (!isAbort) {
        log?.warn?.({ jobId, err }, 'ai-assist deep-think failed');
      }
    } finally {
      inflight.delete(jobId);
    }
  }

  // Mark any pending/running rows as failed on boot — in-flight gateway
  // requests don't survive a restart and we don't try to resume them.
  async function failOrphanedJobs() {
    try {
      const res = await db.query(
        `UPDATE ai_assist_jobs
         SET status = 'failed', completed_at = NOW(),
             error_message = 'Server restarted while job was running'
         WHERE status IN ('pending','running')
         RETURNING id`
      );
      if (res.rowCount > 0) {
        log?.info?.({ count: res.rowCount }, 'ai-assist: marked orphaned jobs failed on boot');
      }
    } catch (err) {
      log?.error?.({ err }, 'ai-assist: failed to clean up orphaned jobs');
    }
  }

  return { runJob, cancelJob, failOrphanedJobs };
}

module.exports = { init };
