/**
 * Vault routes — CR020 encrypted password & key vault.
 *
 * Server is strictly zero-knowledge: it stores BYTEA ciphertext + IV only.
 * The master password and derived key never leave the client.
 *
 * Wire format: BYTEA fields are exchanged as base64 strings in JSON.
 */

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BYTES_PER_FIELD = 64 * 1024;       // 64 KiB per ciphertext / verifier
const MAX_KDF_SALT_BYTES = 64;
const MAX_IV_BYTES = 32;

function decodeB64(value, fieldName, max) {
  if (typeof value !== 'string' || !BASE64_RE.test(value)) {
    const err = new Error(`Field "${fieldName}" must be base64`);
    err.statusCode = 400;
    throw err;
  }
  const buf = Buffer.from(value, 'base64');
  if (buf.length === 0) {
    const err = new Error(`Field "${fieldName}" is empty`);
    err.statusCode = 400;
    throw err;
  }
  if (buf.length > max) {
    const err = new Error(`Field "${fieldName}" exceeds ${max} bytes`);
    err.statusCode = 400;
    throw err;
  }
  return buf;
}

function encodeB64(buf) {
  return Buffer.from(buf).toString('base64');
}

async function vaultRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /meta — vault metadata for the authed user, or 404 if not set up.
  fastify.get('/meta', async (request, reply) => {
    const userId = request.user.id;
    const result = await fastify.db.query(
      `SELECT kdf_salt, kdf_params, verifier_ciphertext, verifier_iv, created_at, updated_at
       FROM vault_meta WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Vault not initialised',
        statusCode: 404
      });
    }
    const row = result.rows[0];
    return {
      data: {
        kdf_salt: encodeB64(row.kdf_salt),
        kdf_params: row.kdf_params,
        verifier_ciphertext: encodeB64(row.verifier_ciphertext),
        verifier_iv: encodeB64(row.verifier_iv),
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    };
  });

  // POST /meta — initialise vault. Rejects if already initialised.
  fastify.post('/meta', {
    schema: {
      body: {
        type: 'object',
        required: ['kdf_salt', 'kdf_params', 'verifier_ciphertext', 'verifier_iv'],
        properties: {
          kdf_salt: { type: 'string' },
          kdf_params: { type: 'object' },
          verifier_ciphertext: { type: 'string' },
          verifier_iv: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { kdf_salt, kdf_params, verifier_ciphertext, verifier_iv } = request.body;

    if (!kdf_params || typeof kdf_params !== 'object' || kdf_params.algo !== 'argon2id') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'kdf_params must be { algo: "argon2id", ... }',
        statusCode: 400
      });
    }

    let salt, ct, iv;
    try {
      salt = decodeB64(kdf_salt, 'kdf_salt', MAX_KDF_SALT_BYTES);
      ct = decodeB64(verifier_ciphertext, 'verifier_ciphertext', MAX_BYTES_PER_FIELD);
      iv = decodeB64(verifier_iv, 'verifier_iv', MAX_IV_BYTES);
    } catch (err) {
      return reply.code(err.statusCode || 400).send({
        error: 'Bad Request', message: err.message, statusCode: err.statusCode || 400
      });
    }

    const existing = await fastify.db.query('SELECT 1 FROM vault_meta WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Vault already initialised',
        statusCode: 409
      });
    }

    await fastify.db.query(
      `INSERT INTO vault_meta (user_id, kdf_salt, kdf_params, verifier_ciphertext, verifier_iv)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, salt, kdf_params, ct, iv]
    );
    return reply.code(201).send({ data: { initialised: true } });
  });

  // GET /entries — list all entries (ciphertext only) for the authed user.
  fastify.get('/entries', async (request) => {
    const userId = request.user.id;
    const result = await fastify.db.query(
      `SELECT id, ciphertext, iv, created_at, updated_at
       FROM vault_entries WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    return {
      data: result.rows.map(r => ({
        id: r.id,
        ciphertext: encodeB64(r.ciphertext),
        iv: encodeB64(r.iv),
        created_at: r.created_at,
        updated_at: r.updated_at
      }))
    };
  });

  // POST /entries — create a new encrypted entry.
  fastify.post('/entries', {
    schema: {
      body: {
        type: 'object',
        required: ['ciphertext', 'iv'],
        properties: {
          ciphertext: { type: 'string' },
          iv: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;

    // Require the vault to be initialised so a misconfigured client can't
    // start writing entries before /meta is set.
    const meta = await fastify.db.query('SELECT 1 FROM vault_meta WHERE user_id = $1', [userId]);
    if (meta.rows.length === 0) {
      return reply.code(409).send({
        error: 'Conflict', message: 'Vault not initialised', statusCode: 409
      });
    }

    let ct, iv;
    try {
      ct = decodeB64(request.body.ciphertext, 'ciphertext', MAX_BYTES_PER_FIELD);
      iv = decodeB64(request.body.iv, 'iv', MAX_IV_BYTES);
    } catch (err) {
      return reply.code(err.statusCode || 400).send({
        error: 'Bad Request', message: err.message, statusCode: err.statusCode || 400
      });
    }

    const result = await fastify.db.query(
      `INSERT INTO vault_entries (user_id, ciphertext, iv)
       VALUES ($1, $2, $3)
       RETURNING id, ciphertext, iv, created_at, updated_at`,
      [userId, ct, iv]
    );
    const row = result.rows[0];
    return reply.code(201).send({
      data: {
        id: row.id,
        ciphertext: encodeB64(row.ciphertext),
        iv: encodeB64(row.iv),
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  });

  // PUT /entries/:id — replace ciphertext for an existing entry.
  fastify.put('/entries/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['ciphertext', 'iv'],
        properties: {
          ciphertext: { type: 'string' },
          iv: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid id', statusCode: 400 });
    }

    let ct, iv;
    try {
      ct = decodeB64(request.body.ciphertext, 'ciphertext', MAX_BYTES_PER_FIELD);
      iv = decodeB64(request.body.iv, 'iv', MAX_IV_BYTES);
    } catch (err) {
      return reply.code(err.statusCode || 400).send({
        error: 'Bad Request', message: err.message, statusCode: err.statusCode || 400
      });
    }

    const result = await fastify.db.query(
      `UPDATE vault_entries
       SET ciphertext = $1, iv = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, ciphertext, iv, created_at, updated_at`,
      [ct, iv, id, userId]
    );
    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'Not Found', message: 'Entry not found', statusCode: 404
      });
    }
    const row = result.rows[0];
    return {
      data: {
        id: row.id,
        ciphertext: encodeB64(row.ciphertext),
        iv: encodeB64(row.iv),
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    };
  });

  // PUT /rotate — atomically rotate the master key.
  //
  // Client supplies new KDF metadata, a new verifier ciphertext, and the full
  // list of existing entries re-encrypted under the new key. Server validates
  // that the set of entry IDs matches exactly (no missing, no extra) and writes
  // everything in a single transaction.
  fastify.put('/rotate', {
    schema: {
      body: {
        type: 'object',
        required: ['kdf_salt', 'kdf_params', 'verifier_ciphertext', 'verifier_iv', 'entries'],
        properties: {
          kdf_salt: { type: 'string' },
          kdf_params: { type: 'object' },
          verifier_ciphertext: { type: 'string' },
          verifier_iv: { type: 'string' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'ciphertext', 'iv'],
              properties: {
                id: { type: 'string' },
                ciphertext: { type: 'string' },
                iv: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const { kdf_salt, kdf_params, verifier_ciphertext, verifier_iv, entries } = request.body;

    if (!kdf_params || typeof kdf_params !== 'object' || kdf_params.algo !== 'argon2id') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'kdf_params must be { algo: "argon2id", ... }',
        statusCode: 400
      });
    }

    let salt, vCt, vIv;
    try {
      salt = decodeB64(kdf_salt, 'kdf_salt', MAX_KDF_SALT_BYTES);
      vCt = decodeB64(verifier_ciphertext, 'verifier_ciphertext', MAX_BYTES_PER_FIELD);
      vIv = decodeB64(verifier_iv, 'verifier_iv', MAX_IV_BYTES);
    } catch (err) {
      return reply.code(err.statusCode || 400).send({
        error: 'Bad Request', message: err.message, statusCode: err.statusCode || 400
      });
    }

    // Validate every entry id and its ciphertext/iv up-front, before we touch
    // the database, so a malformed payload doesn't half-commit.
    const decoded = [];
    for (const e of entries) {
      if (!UUID_RE.test(e.id)) {
        return reply.code(400).send({
          error: 'Bad Request', message: `Invalid entry id: ${e.id}`, statusCode: 400
        });
      }
      try {
        decoded.push({
          id: e.id,
          ct: decodeB64(e.ciphertext, `entries[${e.id}].ciphertext`, MAX_BYTES_PER_FIELD),
          iv: decodeB64(e.iv, `entries[${e.id}].iv`, MAX_IV_BYTES)
        });
      } catch (err) {
        return reply.code(err.statusCode || 400).send({
          error: 'Bad Request', message: err.message, statusCode: err.statusCode || 400
        });
      }
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      const metaCheck = await client.query(
        'SELECT 1 FROM vault_meta WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      if (metaCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'Conflict', message: 'Vault not initialised', statusCode: 409
        });
      }

      // Make sure the client's entry list matches the server's. Re-encryption
      // must cover every existing entry — silently dropping or adding rows
      // would be a data-integrity bug.
      const existingRes = await client.query(
        'SELECT id FROM vault_entries WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      const existingIds = new Set(existingRes.rows.map(r => r.id));
      const submittedIds = new Set(decoded.map(e => e.id));

      if (existingIds.size !== submittedIds.size ||
          [...existingIds].some(id => !submittedIds.has(id))) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Submitted entries do not match the current vault. Reload and retry.',
          statusCode: 409
        });
      }

      await client.query(
        `UPDATE vault_meta
         SET kdf_salt = $1, kdf_params = $2,
             verifier_ciphertext = $3, verifier_iv = $4,
             updated_at = NOW()
         WHERE user_id = $5`,
        [salt, kdf_params, vCt, vIv, userId]
      );

      for (const e of decoded) {
        await client.query(
          `UPDATE vault_entries
           SET ciphertext = $1, iv = $2, updated_at = NOW()
           WHERE id = $3 AND user_id = $4`,
          [e.ct, e.iv, e.id, userId]
        );
      }

      await client.query('COMMIT');
      return { data: { rotated: true, entry_count: decoded.length } };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // DELETE /entries/:id
  fastify.delete('/entries/:id', async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid id', statusCode: 400 });
    }
    const result = await fastify.db.query(
      'DELETE FROM vault_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: 'Not Found', message: 'Entry not found', statusCode: 404
      });
    }
    return reply.code(204).send();
  });
}

module.exports = vaultRoutes;
