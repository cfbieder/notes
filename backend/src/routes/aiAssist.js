const llmService = require('../services/llmService');
const jobRunnerFactory = require('../services/aiAssistJobRunner');

// Rough token estimate: ~4 characters per token for English prose. Good
// enough to warn users before sending; the gateway does the real tokenization.
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

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

// When the user toggles "Condense sources first", we run each note through
// a fast model with a short summarization prompt before assembling the main
// prompt. Trade speed for fitting more notes in the context window.
const CONDENSE_MODEL = process.env.LLM_CONDENSE_MODEL || 'phi4:14b';

async function condenseNote(note) {
  const prompt = `Condense the following note into 3-5 short bullet points capturing only the key ideas. Preserve any specific names, numbers, or dates. Reply with only the bullets — no preamble.

Title: ${note.title || 'Untitled'}

Content:
${(note.content || '').trim()}`;

  try {
    const res = await llmService.generateText({ prompt, model: CONDENSE_MODEL });
    if (res && res.text) return { ...note, content: res.text.trim() };
  } catch {
    // fall through to original content on failure
  }
  return note;
}

function serializeJob(row) {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    prompt: row.prompt,
    noteIds: row.note_ids || [],
    condense: row.condense,
    model: row.model || null,
    resultNoteId: row.result_note_id || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null
  };
}

async function aiAssistRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  const runner = jobRunnerFactory.init({ db: fastify.db, log: fastify.log });
  // Expose so app.js can call failOrphanedJobs() once after boot.
  fastify.decorate('aiAssistJobRunner', runner);

  // GET /api/v1/ai-assist/config — context window + model defaults.
  fastify.get('/config', async () => {
    return {
      data: {
        enabled: llmService.isEnabled(),
        contextWindow: llmService.getContextWindow(),
        model: llmService.getGenerationModel(),
        quickModel: llmService.getQuickModel(),
        deepModel: llmService.getDeepModel(),
        taskRouting: llmService.isTaskRoutingEnabled(),
        condenseModel: CONDENSE_MODEL,
        warnTokens: Math.floor(llmService.getContextWindow() * 0.85)
      }
    };
  });

  async function loadNotesInOrder(userId, noteIds) {
    if (!noteIds || noteIds.length === 0) return [];
    const result = await fastify.db.query(
      `SELECT id, title, content
       FROM notes
       WHERE user_id = $1 AND id = ANY($2) AND deleted_at IS NULL`,
      [userId, noteIds]
    );
    const byId = new Map(result.rows.map(n => [n.id, n]));
    return noteIds.map(id => byId.get(id)).filter(Boolean);
  }

  // POST /api/v1/ai-assist/generate
  // Body: { prompt, noteIds?, condense?, stream?, mode? }
  // - mode='quick' (default): routes via noted_ai_assist_quick task (or
  //   bridging quick model when /task is disabled).
  // - stream=false (default): JSON response { output, model, sources, ... }
  // - stream=true: NDJSON chunks, then a final {done:true,...} line.
  // Deep-think submissions go to /jobs (async); /generate is the sync path.
  fastify.post('/generate', {
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 4000 },
          noteIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            maxItems: 50
          },
          condense: { type: 'boolean' },
          stream: { type: 'boolean' },
          mode: { type: 'string', enum: ['quick'] }
        }
      }
    }
  }, async (request, reply) => {
    const { prompt, noteIds = [], condense = false, stream = false } = request.body;
    const taskName = 'noted_ai_assist_quick';
    const userId = request.user.id;

    if (!llmService.isEnabled()) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'AI Assist is disabled (LLM_ENABLED=false)',
        statusCode: 503
      });
    }

    let notes = await loadNotesInOrder(userId, noteIds);

    // Condense pass — summarize each note in parallel via the fast model so
    // large source sets fit in context. Best-effort: failures fall back to
    // the original note content.
    if (condense && notes.length > 0) {
      notes = await Promise.all(notes.map(condenseNote));
    }

    const fullPrompt = buildPrompt(prompt, notes);
    const estimated = estimateTokens(fullPrompt);
    const sources = notes.map(n => ({ id: n.id, title: n.title }));

    if (!stream) {
      let generated;
      try {
        generated = await llmService.generateText({ prompt: fullPrompt, taskName });
      } catch (err) {
        fastify.log.warn({ err }, 'ai-assist generate failed');
        return reply.code(502).send({
          error: 'Bad Gateway',
          message: 'Generation failed: ' + (err.message || 'unknown error'),
          statusCode: 502
        });
      }

      if (!generated || !generated.text) {
        return reply.code(502).send({
          error: 'Bad Gateway',
          message: 'LLM returned no content',
          statusCode: 502
        });
      }

      return {
        data: {
          output: generated.text,
          model: generated.model,
          provider: generated.provider || null,
          promptTokens: generated.promptTokens || estimated,
          estimatedTokens: estimated,
          condensed: condense && sources.length > 0,
          sources
        }
      };
    }

    // Streaming path — write NDJSON directly to the raw socket so chunks
    // reach the browser as the LLM produces them.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',  // disable nginx buffering
      'Connection': 'keep-alive'
    });

    const writeLine = (obj) => {
      try { raw.write(JSON.stringify(obj) + '\n'); } catch {}
    };

    try {
      const result = await llmService.generateTextStream(
        { prompt: fullPrompt, taskName },
        (chunk) => writeLine({ chunk })
      );
      writeLine({
        done: true,
        model: result?.model || llmService.getQuickModel(),
        sources,
        promptTokens: result?.promptTokens || estimated,
        estimatedTokens: estimated,
        condensed: condense && sources.length > 0
      });
    } catch (err) {
      fastify.log.warn({ err }, 'ai-assist stream failed');
      writeLine({ error: err.message || 'stream failed' });
    } finally {
      raw.end();
    }
  });

  // ---------------------------------------------------------------------------
  // Async deep-think jobs
  //
  // POST   /api/v1/ai-assist/jobs        submit a deep-think job
  // GET    /api/v1/ai-assist/jobs        list user's recent jobs (status filter optional)
  // GET    /api/v1/ai-assist/jobs/:id    one job
  // DELETE /api/v1/ai-assist/jobs/:id    cancel a pending/running job
  //
  // Result is delivered as a new inbox note (created by the runner). The
  // frontend polls GET /jobs alongside the existing reminder poll loop and
  // surfaces completion / failure as toast notifications.
  // ---------------------------------------------------------------------------

  fastify.post('/jobs', {
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 4000 },
          noteIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            maxItems: 50
          },
          condense: { type: 'boolean' },
          mode: { type: 'string', enum: ['deep'] }
        }
      }
    }
  }, async (request, reply) => {
    const { prompt, noteIds = [], condense = false } = request.body;
    const userId = request.user.id;

    if (!llmService.isEnabled()) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'AI Assist is disabled (LLM_ENABLED=false)',
        statusCode: 503
      });
    }

    // One active deep-think per user. Frontend can grow this cap later by
    // changing the WHERE clause and the toast UX; data model stays the same.
    const active = await fastify.db.query(
      `SELECT id FROM ai_assist_jobs
       WHERE user_id = $1 AND status IN ('pending','running')
       LIMIT 1`,
      [userId]
    );
    if (active.rowCount > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Another deep-think job is already running. Cancel it first or wait for it to finish.',
        statusCode: 409,
        code: 'job_in_progress'
      });
    }

    const inserted = await fastify.db.query(
      `INSERT INTO ai_assist_jobs (user_id, mode, status, prompt, note_ids, condense)
       VALUES ($1, 'deep', 'pending', $2, $3, $4)
       RETURNING id, mode, status, prompt, note_ids, condense, created_at`,
      [userId, prompt, noteIds, condense]
    );
    const job = inserted.rows[0];

    // Fire and forget — the runner handles its own errors and writes status
    // back to the row. We never await this; the response returns immediately.
    runner.runJob(job.id).catch((err) => {
      fastify.log.error({ err, jobId: job.id }, 'ai-assist runJob threw unexpectedly');
    });

    return reply.code(201).send({ data: serializeJob(job) });
  });

  fastify.get('/jobs', async (request) => {
    const userId = request.user.id;
    const statusFilter = (request.query.status || '').trim();
    const allowedStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    const statuses = statusFilter
      ? statusFilter.split(',').map(s => s.trim()).filter(s => allowedStatuses.includes(s))
      : null;

    const params = [userId];
    let where = 'user_id = $1';
    if (statuses && statuses.length > 0) {
      params.push(statuses);
      where += ` AND status = ANY($${params.length})`;
    }
    const res = await fastify.db.query(
      `SELECT id, user_id, mode, status, prompt, note_ids, condense, model,
              result_note_id, error_message, created_at, started_at, completed_at
       FROM ai_assist_jobs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT 50`,
      params
    );
    return { data: res.rows.map(serializeJob) };
  });

  fastify.get('/jobs/:id', async (request, reply) => {
    const userId = request.user.id;
    const res = await fastify.db.query(
      `SELECT id, user_id, mode, status, prompt, note_ids, condense, model,
              result_note_id, error_message, created_at, started_at, completed_at
       FROM ai_assist_jobs
       WHERE id = $1 AND user_id = $2`,
      [request.params.id, userId]
    );
    if (res.rowCount === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Job not found', statusCode: 404 });
    }
    return { data: serializeJob(res.rows[0]) };
  });

  fastify.delete('/jobs/:id', async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;

    const existing = await fastify.db.query(
      `SELECT status FROM ai_assist_jobs WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (existing.rowCount === 0) {
      return reply.code(404).send({ error: 'Not Found', message: 'Job not found', statusCode: 404 });
    }
    const current = existing.rows[0].status;
    if (current !== 'pending' && current !== 'running') {
      return reply.code(409).send({
        error: 'Conflict',
        message: `Job is ${current}; nothing to cancel`,
        statusCode: 409
      });
    }

    // Best-effort: signal the in-process runner to abort the gateway request.
    // The runner sets status='cancelled' once the abort propagates; if for
    // some reason the job isn't in our in-flight map (e.g. stale row from
    // before a restart), set the row directly so the user isn't stuck.
    const aborted = runner.cancelJob(id);
    if (!aborted) {
      await fastify.db.query(
        `UPDATE ai_assist_jobs
         SET status = 'cancelled', completed_at = NOW(), error_message = 'Cancelled by user'
         WHERE id = $1 AND status IN ('pending','running')`,
        [id]
      );
    }
    return reply.code(204).send();
  });

  // POST /api/v1/ai-assist/estimate — pure utility for the live token gauge.
  fastify.post('/estimate', {
    schema: {
      body: {
        type: 'object',
        properties: {
          prompt: { type: 'string', maxLength: 4000 },
          noteIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            maxItems: 50
          }
        }
      }
    }
  }, async (request) => {
    const { prompt = '', noteIds = [] } = request.body;
    const userId = request.user.id;
    const notes = await loadNotesInOrder(userId, noteIds);
    const fullPrompt = buildPrompt(prompt, notes);
    return {
      data: {
        estimatedTokens: estimateTokens(fullPrompt),
        characters: fullPrompt.length,
        contextWindow: llmService.getContextWindow()
      }
    };
  });
}

module.exports = aiAssistRoutes;
module.exports.estimateTokens = estimateTokens;
module.exports.buildPrompt = buildPrompt;
module.exports.serializeJob = serializeJob;
