const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pipeline } = require('stream/promises');
const llmService = require('../services/llmService');

// Max recording duration enforced client-side (5 min), but cap file size server-side too.
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB (matches gateway limit)

async function voiceRoutes(fastify) {
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: MAX_AUDIO_SIZE
    }
  });

  const uploadDir = process.env.UPLOAD_DIR || './uploads';

  // POST /api/v1/notes/voice — record audio, transcribe, create inbox note, attach audio
  fastify.post('/', { onRequest: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.id;

    if (!llmService.isEnabled()) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Voice capture is disabled (LLM_ENABLED=false)',
        statusCode: 503
      });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No audio file uploaded',
        statusCode: 400
      });
    }

    const mimeType = data.mimetype;
    if (!llmService.isAudioCandidate(mimeType)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Unsupported audio format: ${mimeType}`,
        statusCode: 400
      });
    }

    // Write audio to a temp file for transcription
    const tmpDir = path.join(uploadDir, 'tmp');
    await fsp.mkdir(tmpDir, { recursive: true });
    const tmpName = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(data.filename) || '.webm';
    const tmpPath = path.join(tmpDir, tmpName + ext);

    const writeStream = fs.createWriteStream(tmpPath);
    await pipeline(data.file, writeStream);

    // Check if truncated
    if (data.file.truncated) {
      await fsp.unlink(tmpPath).catch(() => {});
      return reply.code(413).send({
        error: 'Payload Too Large',
        message: 'Audio file exceeds maximum size limit',
        statusCode: 413
      });
    }

    // Transcribe via gateway
    let transcription;
    try {
      transcription = await llmService.transcribeAudio({
        filePath: tmpPath,
        filename: data.filename || `recording${ext}`,
        mimeType
      });
    } catch (err) {
      await fsp.unlink(tmpPath).catch(() => {});
      fastify.log.warn({ err }, 'voice transcription failed');
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Transcription failed: ' + (err.message || 'unknown error'),
        statusCode: 502
      });
    }

    if (!transcription) {
      await fsp.unlink(tmpPath).catch(() => {});
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Transcription returned no result',
        statusCode: 502
      });
    }

    // Empty text is valid (e.g. silence) — still create the note with the audio attachment
    const transcribedText = (transcription.text || '').trim();

    // Format title with timestamp
    const now = new Date();
    const titleDate = now.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const titleTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    const title = `Voice Note — ${titleDate} ${titleTime}`;

    // Create idea (notebook-less, not inbox) — user can promote/merge later
    const noteContent = transcribedText || '*(no speech detected)*';
    const noteResult = await fastify.db.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, is_inbox, note_type)
       VALUES ($1, NULL, $2, $3, FALSE, 'idea')
       RETURNING *`,
      [userId, title, noteContent]
    );
    const note = noteResult.rows[0];

    // Move audio file to permanent attachment storage
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const attachDir = path.join(uploadDir, year, month, note.id);
    await fsp.mkdir(attachDir, { recursive: true });

    const storedName = `${Date.now()}_voice_recording${ext}`;
    const permanentPath = path.join(attachDir, storedName);
    await fsp.rename(tmpPath, permanentPath);

    const stat = await fsp.stat(permanentPath);
    const storagePath = path.join(year, month, note.id, storedName);

    const attachResult = await fastify.db.query(
      `INSERT INTO attachments (note_id, user_id, filename, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, note_id, filename, mime_type, size_bytes, created_at`,
      [note.id, userId, data.filename || `recording${ext}`, mimeType, stat.size, storagePath]
    );

    return reply.code(201).send({
      data: {
        note,
        attachment: attachResult.rows[0],
        transcription: {
          language: transcription.language,
          duration: transcription.duration
        }
      }
    });
  });
}

module.exports = voiceRoutes;
