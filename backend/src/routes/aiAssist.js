const llmService = require('../services/llmService');

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

async function aiAssistRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/ai-assist/config — context window + model defaults.
  fastify.get('/config', async () => {
    return {
      data: {
        enabled: llmService.isEnabled(),
        contextWindow: llmService.getContextWindow(),
        model: llmService.getGenerationModel(),
        condenseModel: CONDENSE_MODEL,
        warnTokens: Math.floor(llmService.getContextWindow() * 0.85)
      }
    };
  });

  // GET /api/v1/ai-assist/models — list models available on the gateway,
  // so the frontend can populate a model picker.
  fastify.get('/models', async () => {
    const models = await llmService.listModels();
    return { data: models };
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
  // Body: { prompt, noteIds?, model?, condense?, stream? }
  // - stream=false (default): JSON response { output, model, sources, ... }
  // - stream=true: NDJSON chunks, then a final {done:true,...} line.
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
          model: { type: 'string', maxLength: 80 },
          condense: { type: 'boolean' },
          stream: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { prompt, noteIds = [], model, condense = false, stream = false } = request.body;
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
        generated = await llmService.generateText({ prompt: fullPrompt, model });
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
        { prompt: fullPrompt, model },
        (chunk) => writeLine({ chunk })
      );
      writeLine({
        done: true,
        model: result?.model || model || llmService.getGenerationModel(),
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
