// CR039 §6.1 — a source note's body is read-only except via
// POST /sources/:id/replace-body. These helpers give each note route a clean
// 422; the guard_source_body trigger (migration 021) is the backstop.

function sendSourceReadonly(reply, message) {
  return reply.code(422).send({
    error: 'source_body_readonly',
    message: message || 'This note is a research source; its body is read-only.',
    statusCode: 422
  });
}

// Returns a rejection message for a PUT /notes/:id body against an existing
// source note, or null when the update is allowed. Autosave always sends
// { title, content }, so content is rejected only when it actually differs.
function sourceUpdateViolation(existing, body) {
  if (body.content !== undefined && body.content !== existing.content) {
    return 'A source body is read-only; use replace-body to re-capture it.';
  }
  if (body.format !== undefined && body.format !== existing.format) {
    return 'A source note cannot change format.';
  }
  if ('notebook_id' in body && body.notebook_id !== null) {
    return 'Sources live under Research and cannot be filed in a notebook.';
  }
  if (body.auto_update === true) {
    return 'Sources cannot be auto-updated from Drive.';
  }
  if (body.note_type !== undefined && body.note_type !== 'source') {
    return 'A source cannot be converted to another note type.';
  }
  return null;
}

module.exports = { sendSourceReadonly, sourceUpdateViolation };
