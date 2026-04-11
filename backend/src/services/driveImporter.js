const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pipeline } = require('stream/promises');

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

      const noteResult = await fastify.db.query(
        `INSERT INTO notes (user_id, title, content, is_inbox)
         VALUES ($1, $2, $3, TRUE) RETURNING *`,
        [userId, title, textContent]
      );

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

    // Binary files: create inbox note with attachment
    const title = path.basename(file.name, path.extname(file.name));
    const noteResult = await fastify.db.query(
      `INSERT INTO notes (user_id, title, content, is_inbox)
       VALUES ($1, $2, $3, TRUE) RETURNING *`,
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

    await fastify.db.query(
      `INSERT INTO attachments (note_id, user_id, filename, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [noteId, userId, file.name, downloadMimeType, stat.size, storagePath]
    );

    await logImport(fastify, userId, integrationId, file, noteId, 'success');
    return noteResult.rows[0];
  } catch (err) {
    await logImport(fastify, userId, integrationId, file, null, 'error', err.message);
    throw err;
  }
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
