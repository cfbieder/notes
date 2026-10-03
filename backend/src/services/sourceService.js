// CR039 — creating a research source, shared by POST /sources (manual entry)
// and POST /clips with as_source (the web clipper, Phase A2) so the two paths
// cannot drift. One transaction: chapter ownership check, the note
// (note_type='source', notebook-less, markdown), the sources row, the chapter
// links. Failures are thrown as SourceError carrying the API error body.

const { normalizeSourceUrl } = require('../utils/sourceUrl');

const SOURCE_KINDS = ['web', 'journal', 'pdf_report', 'book', 'book_chapter', 'video', 'podcast', 'other'];

const nullableText = (max) => ({ type: ['string', 'null'], maxLength: max });

// JSON-schema properties for citation metadata, reused by both routes.
const metadataProperties = {
  source_kind: { type: 'string', enum: SOURCE_KINDS },
  title: { type: 'string', minLength: 1, maxLength: 1000 },
  authors: {
    type: 'array',
    maxItems: 50,
    items: {
      type: 'object',
      properties: {
        family: { type: 'string', maxLength: 200 },
        given: { type: 'string', maxLength: 200 },
        literal: { type: 'string', maxLength: 300 }
      },
      additionalProperties: false
    }
  },
  container: nullableText(500),
  publisher: nullableText(500),
  volume: nullableText(50),
  issue: nullableText(50),
  pages: nullableText(50),
  published_date: { type: ['string', 'null'], format: 'date' },
  published_precision: { type: ['string', 'null'], enum: ['year', 'month', 'day', null] },
  url: nullableText(2000),
  doi: nullableText(200),
  isbn: nullableText(50)
};

class SourceError extends Error {
  constructor(statusCode, error, message, data) {
    super(message);
    this.statusCode = statusCode;
    this.body = { error, message, statusCode, ...(data ? { data } : {}) };
  }
}

function hasAuthorAndDate(authors, publishedDate) {
  const named = (authors || []).some(a => (a.family || a.literal || '').trim());
  return named && !!publishedDate;
}

// Roll back; if that fails, return the error for client.release(err) so the
// pool destroys the client instead of reusing an unknown transaction state.
async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
    return undefined;
  } catch (err) {
    return err;
  }
}

async function sourceExistsError(db, userId, url) {
  const existing = await db.query(
    `SELECT s.note_id, n.deleted_at IS NOT NULL AS in_trash
     FROM sources s JOIN notes n ON n.id = s.note_id
     WHERE s.user_id = $1 AND s.url = $2`,
    [userId, url]
  );
  const row = existing.rows[0] || {};
  return new SourceError(409, 'source_exists',
    row.in_trash ? 'A source with this URL is in the trash' : 'A source with this URL already exists',
    { note_id: row.note_id || null, in_trash: !!row.in_trash });
}

// input: citation fields (metadataProperties) + content, chapter_ids,
//        metadata_status, metadata_raw, source_url (raw tab URL, optional).
// Returns the new note id.
async function createSource(db, userId, input) {
  let url;
  try {
    url = normalizeSourceUrl(input.url);
  } catch (err) {
    throw new SourceError(400, 'Bad Request', err.message);
  }
  const chapterIds = input.chapter_ids || [];
  const authors = input.authors || [];

  const client = await db.connect();
  let releaseErr;
  try {
    await client.query('BEGIN');

    if (chapterIds.length > 0) {
      const owned = await client.query(
        'SELECT COUNT(*)::int AS n FROM chapters WHERE user_id = $1 AND id = ANY($2::uuid[])',
        [userId, chapterIds]
      );
      if (owned.rows[0].n !== chapterIds.length) {
        throw new SourceError(404, 'Not Found', 'Chapter not found');
      }
    }

    // Sources are notebook-less (D9) and always markdown.
    const note = await client.query(
      `INSERT INTO notes (user_id, notebook_id, title, content, note_type, format, source_url)
       VALUES ($1, NULL, $2, $3, 'source', 'markdown', $4)
       RETURNING id`,
      [userId, input.title, input.content || '', input.source_url || url]
    );
    const noteId = note.rows[0].id;

    await client.query(
      `INSERT INTO sources (note_id, user_id, source_kind, authors, title, container, publisher, volume, issue,
                            pages, published_date, published_precision, url, doi, isbn,
                            metadata_status, metadata_raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [noteId, userId, input.source_kind, JSON.stringify(authors), input.title, input.container ?? null,
        input.publisher ?? null, input.volume ?? null, input.issue ?? null, input.pages ?? null,
        input.published_date ?? null, input.published_precision ?? null, url, input.doi ?? null,
        input.isbn ?? null, input.metadata_status,
        input.metadata_raw === undefined ? null : JSON.stringify(input.metadata_raw)]
    );

    if (chapterIds.length > 0) {
      await client.query(
        'INSERT INTO source_chapters (source_note_id, chapter_id) SELECT $1, unnest($2::uuid[])',
        [noteId, chapterIds]
      );
    }
    await client.query('COMMIT');
    return noteId;
  } catch (err) {
    releaseErr = await rollbackQuietly(client);
    if (err.code === '23505' && err.constraint === 'sources_user_url_idx') {
      throw await sourceExistsError(db, userId, url);
    }
    throw err;
  } finally {
    client.release(releaseErr);
  }
}

module.exports = {
  SOURCE_KINDS, metadataProperties, SourceError, createSource, sourceExistsError, hasAuthorAndDate, rollbackQuietly
};
