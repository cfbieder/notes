async function reminderRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/reminders — all reminders (tasks + notes with reminder_at set)
  fastify.get('/', async (request) => {
    const userId = request.user.id;

    // Tasks with reminders
    const tasksResult = await fastify.db.query(
      `SELECT t.id, t.content, t.is_done, t.due_date, t.reminder_at,
              t.note_id, n.title AS note_title,
              'task' AS type
       FROM tasks t
       LEFT JOIN notes n ON n.id = t.note_id
       WHERE t.user_id = $1 AND t.reminder_at IS NOT NULL
       ORDER BY t.reminder_at ASC`,
      [userId]
    );

    // Notes with reminders (using reminder_at column added in migration 003)
    const notesResult = await fastify.db.query(
      `SELECT n.id, n.title AS content, n.reminder_at,
              n.id AS note_id, n.title AS note_title,
              'note' AS type
       FROM notes n
       WHERE n.user_id = $1 AND n.reminder_at IS NOT NULL AND n.deleted_at IS NULL
       ORDER BY n.reminder_at ASC`,
      [userId]
    );

    const all = [...tasksResult.rows, ...notesResult.rows]
      .sort((a, b) => new Date(a.reminder_at) - new Date(b.reminder_at));

    // Categorize
    const now = new Date();
    const overdue = all.filter(r => new Date(r.reminder_at) < now && !r.is_done);
    const upcoming = all.filter(r => new Date(r.reminder_at) >= now && !r.is_done);
    const dismissed = all.filter(r => r.is_done);

    return {
      data: { overdue, upcoming, dismissed },
      meta: { total: all.length, overdue: overdue.length, upcoming: upcoming.length }
    };
  });

  // GET /api/v1/reminders/due — reminders that are due now (for polling)
  fastify.get('/due', async (request) => {
    const userId = request.user.id;

    const tasksResult = await fastify.db.query(
      `SELECT t.id, t.content, t.reminder_at, t.note_id, n.title AS note_title, 'task' AS type
       FROM tasks t
       LEFT JOIN notes n ON n.id = t.note_id
       WHERE t.user_id = $1 AND t.reminder_at IS NOT NULL
         AND t.reminder_at <= NOW() AND t.is_done = false`,
      [userId]
    );

    const notesResult = await fastify.db.query(
      `SELECT n.id, n.title AS content, n.reminder_at, n.id AS note_id, n.title AS note_title, 'note' AS type
       FROM notes n
       WHERE n.user_id = $1 AND n.reminder_at IS NOT NULL
         AND n.reminder_at <= NOW() AND n.deleted_at IS NULL`,
      [userId]
    );

    return { data: [...tasksResult.rows, ...notesResult.rows] };
  });
}

module.exports = reminderRoutes;
