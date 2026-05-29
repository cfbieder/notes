const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pipeline } = require('stream/promises');
const { extractWikilinks, resolveWikilinks } = require('./wikilinkParser');

async function importDriveFile(fastify, drive, file, userId, integrationId) {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';

  const isTextFile =
    file.mimeType === 'text/plain' ||
    file.mimeType === 'text/markdown' ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.txt');

  const isGoogleDoc = file.mimeType.startsWith('application/vnd.google-apps.');

  try {
    // Text files: import content as note body
    if (isTextFile && !isGoogleDoc) {
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'stream' }
      );

      const chunks = [];
      for await (const chunk of response.data) {
        chunks.push(chunk);
      }
      const textContent = Buffer.concat(chunks).toString('utf-8');
      const title = path.basename(file.name, path.extname(file.name));

      // Check for an existing note with the same title that has auto_update enabled
      const existingNote = await fastify.db.query(
        `SELECT id FROM notes
         WHERE user_id = $1 AND LOWER(title) = LOWER($2)
           AND auto_update = TRUE AND deleted_at IS NULL
         LIMIT 1`,
        [userId, title]
      );

      let noteResult;
      if (existingNote.rows.length > 0) {
        // Auto-update: replace content in place, preserving tags/folder/metadata
        const noteId = existingNote.rows[0].id;
        noteResult = await fastify.db.query(
          `UPDATE notes SET content = $1, updated_at = NOW()
           WHERE id = $2 AND user_id = $3 RETURNING *`,
          [textContent, noteId, userId]
        );
        // Re-sync wikilinks for the updated content
        await syncNoteWikilinks(fastify, noteId, userId, textContent);
      } else {
        // notebook_id left NULL → note shows up in /inbox.
        noteResult = await fastify.db.query(
          `INSERT INTO notes (user_id, title, content)
           VALUES ($1, $2, $3) RETURNING *`,
          [userId, title, textContent]
        );
      }

      await logImport(fastify, userId, integrationId, file, noteResult.rows[0].id, 'success');
      return noteResult.rows[0];
    }

    // Google Docs/Sheets/Slides: export as PDF
    let downloadMimeType = file.mimeType;
    let downloadExt = path.extname(file.name);
    let contentStream;

    if (isGoogleDoc) {
      downloadMimeType = 'application/pdf';
      downloadExt = '.pdf';
      const response = await drive.files.export(
        { fileId: file.id, mimeType: 'application/pdf' },
        { responseType: 'stream' }
      );
      contentStream = response.data;
    } else {
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'stream' }
      );
      contentStream = response.data;
    }

    // Binary files: create inbox note with attachment (notebook_id NULL).
    const title = path.basename(file.name, path.extname(file.name));
    const noteResult = await fastify.db.query(
      `INSERT INTO notes (user_id, title, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, title, `Imported from Google Drive: ${file.name}`]
    );
    const noteId = noteResult.rows[0].id;

    // Save to disk using same path convention as attachments.js
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dirPath = path.join(uploadDir, year, month, noteId);
    await fsp.mkdir(dirPath, { recursive: true });

    const baseName = path.basename(file.name, downloadExt)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 100);
    const storedName = `${Date.now()}_${baseName}${downloadExt}`;
    const filePath = path.join(dirPath, storedName);

    const writeStream = fs.createWriteStream(filePath);
    await pipeline(contentStream, writeStream);

    const stat = await fsp.stat(filePath);
    const storagePath = path.join(year, month, noteId, storedName);

    const attachmentResult = await fastify.db.query(
      `INSERT INTO attachments (note_id, user_id, filename, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [noteId, userId, file.name, downloadMimeType, stat.size, storagePath]
    );

    if (downloadMimeType.startsWith('image/')) {
      const attachmentId = attachmentResult.rows[0].id;
      await fastify.db.query(
        `UPDATE notes SET content = content || $1 WHERE id = $2`,
        [`\n\n![${file.name}](/api/v1/attachments/${attachmentId})`, noteId]
      );
    }

    await logImport(fastify, userId, integrationId, file, noteId, 'success');
    return noteResult.rows[0];
  } catch (err) {
    await logImport(fastify, userId, integrationId, file, null, 'error', err.message);
    throw err;
  }
}

async function syncNoteWikilinks(fastify, noteId, userId, content) {
  const extracted = extractWikilinks(content);
  await fastify.db.query('DELETE FROM note_links WHERE source_note_id = $1', [noteId]);
  if (extracted.length === 0) return;

  const titles = [...new Set(extracted.map(e => e.title.toLowerCase()))];
  const titleResult = await fastify.db.query(
    `SELECT id, LOWER(title) AS lower_title FROM notes
     WHERE user_id = $1 AND deleted_at IS NULL AND LOWER(title) = ANY($2) AND id != $3`,
    [userId, titles, noteId]
  );

  const titleToId = {};
  titleResult.rows.forEach(r => { titleToId[r.lower_title] = r.id; });

  const { resolved } = resolveWikilinks(extracted, titleToId);
  if (resolved.length === 0) return;

  const values = resolved.map((_, i) =>
    `($1, $${i * 2 + 2}, $${i * 2 + 3})`
  ).join(', ');
  const params = [noteId];
  resolved.forEach(r => { params.push(r.targetNoteId, r.contextSnippet); });

  await fastify.db.query(
    `INSERT INTO note_links (source_note_id, target_note_id, context_snippet)
     VALUES ${values}
     ON CONFLICT (source_note_id, target_note_id) DO UPDATE SET context_snippet = EXCLUDED.context_snippet`,
    params
  );
}

async function moveToProcessed(drive, fileId, processedFolderId) {
  const file = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = file.data.parents.join(',');
  await drive.files.update({
    fileId,
    addParents: processedFolderId,
    removeParents: previousParents,
    fields: 'id, parents'
  });
}

async function ensureProcessedFolder(drive, parentFolderId) {
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents AND name = 'Processed' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: 'Processed',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    },
    fields: 'id'
  });

  return folder.data.id;
}

async function logImport(fastify, userId, integrationId, file, noteId, status, errorMessage) {
  await fastify.db.query(
    `INSERT INTO import_history (user_id, integration_id, drive_file_id, drive_file_name, mime_type, note_id, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, integrationId, file.id, file.name, file.mimeType, noteId, status, errorMessage || null]
  );
}

module.exports = { importDriveFile, moveToProcessed, ensureProcessedFolder, logImport };
