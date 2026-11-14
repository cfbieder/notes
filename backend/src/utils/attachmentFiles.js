const path = require('path');
const fsp = require('fs/promises');

const uploadDir = () => process.env.UPLOAD_DIR || './uploads';

// Storage paths of every attachment on the given user's notes that match
// `noteWhere` (SQL over alias n, params from $2). Read BEFORE deleting the
// notes — the attachment rows go with them (ON DELETE CASCADE), the files don't.
async function attachmentPathsFor(db, userId, noteWhere, params = []) {
  const res = await db.query(
    `SELECT a.storage_path FROM attachments a JOIN notes n ON n.id = a.note_id
     WHERE n.user_id = $1 AND ${noteWhere}`,
    [userId, ...params]
  );
  return res.rows.map((r) => r.storage_path);
}

// Best-effort unlink, like DELETE /attachments/:id: a missing file is not an error.
async function unlinkStoredFiles(storagePaths, log) {
  for (const p of storagePaths) {
    const filePath = path.join(uploadDir(), p);
    try {
      await fsp.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn(`Could not delete file: ${filePath}`);
    }
  }
}

module.exports = { attachmentPathsFor, unlinkStoredFiles };
