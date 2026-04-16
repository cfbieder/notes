/**
 * Phase 4 Reminders Enhancement Tests
 * Run: node backend/tests/phase4-reminders.test.js
 * Requires: backend running on port 3001, dev user seeded
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

async function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== Phase 4 Reminders Enhancement Tests ===\n');

  // Auth
  console.log('Auth:');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'dev', password: 'password123' }),
    headers: { 'Content-Type': 'application/json' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');

  // === Task reminder_at ===
  console.log('\nTask Reminders:');

  // Create task with reminder
  const futureTime = new Date(Date.now() + 3600000).toISOString();
  const t1 = await apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify({ content: 'Reminder test task', reminder_at: futureTime })
  });
  assert(t1.status === 201, 'Create task with reminder_at');
  const taskId = t1.data?.data?.id;
  assert(t1.data?.data?.reminder_at !== null, 'Task has reminder_at set');

  // Update reminder to a new time
  const newTime = new Date(Date.now() + 7200000).toISOString();
  const t2 = await apiFetch(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: newTime })
  });
  assert(t2.status === 200, 'Update task reminder_at');
  assert(t2.data?.data?.reminder_at !== null, 'Task reminder_at updated');

  // Clear reminder by sending null
  const t3 = await apiFetch(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: null })
  });
  assert(t3.status === 200, 'Clear task reminder_at with null');
  assert(t3.data?.data?.reminder_at === null, 'Task reminder_at is now null');

  // Set it back for snooze/dismiss tests
  const pastTime = new Date(Date.now() - 60000).toISOString();
  await apiFetch(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: pastTime })
  });

  // === Note reminder_at ===
  console.log('\nNote Reminders:');

  // Create a note (no reminder_at initially)
  const n1 = await apiFetch('/notes', {
    method: 'POST',
    body: JSON.stringify({ title: 'Reminder test note', content: 'Testing reminders on notes' })
  });
  assert(n1.status === 201, 'Create note');
  const noteId = n1.data?.data?.id;

  // Set reminder_at on note via PUT
  const noteReminder = new Date(Date.now() + 1800000).toISOString();
  const n2 = await apiFetch(`/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: noteReminder })
  });
  assert(n2.status === 200, 'Set reminder_at on note');
  assert(n2.data?.data?.reminder_at !== null, 'Note has reminder_at');

  // Verify it appears in GET /notes list
  const notesList = await apiFetch('/notes');
  const foundNote = notesList.data?.data?.find(n => n.id === noteId);
  assert(foundNote?.reminder_at !== undefined, 'Note list includes reminder_at field');

  // Verify it appears in GET /notes/:id
  const noteDetail = await apiFetch(`/notes/${noteId}`);
  assert(noteDetail.data?.data?.reminder_at !== null, 'Note detail includes reminder_at');

  // Clear reminder on note
  const n3 = await apiFetch(`/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: null })
  });
  assert(n3.status === 200, 'Clear note reminder_at with null');
  assert(n3.data?.data?.reminder_at === null, 'Note reminder_at is now null');

  // Create note with reminder_at in POST
  const n4 = await apiFetch('/notes', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Note with initial reminder',
      content: 'Created with reminder',
      reminder_at: noteReminder
    })
  });
  assert(n4.status === 201, 'Create note with reminder_at in POST');
  assert(n4.data?.data?.reminder_at !== null, 'Note created with reminder_at set');
  const noteId2 = n4.data?.data?.id;

  // === Snooze endpoint ===
  console.log('\nSnooze:');

  const snoozeTime = new Date(Date.now() + 900000).toISOString(); // +15min

  // Snooze the task
  const s1 = await apiFetch(`/reminders/${taskId}/snooze`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'task', snooze_until: snoozeTime })
  });
  assert(s1.status === 200, 'Snooze task reminder');
  assert(s1.data?.data?.reminder_at !== null, 'Snooze returns new reminder_at');

  // Verify task's reminder_at was updated
  const t4 = await apiFetch(`/tasks`);
  const snoozedTask = t4.data?.data?.find(t => t.id === taskId);
  assert(snoozedTask?.reminder_at !== null, 'Task reminder_at updated after snooze');

  // Snooze the note
  // First set a reminder on the note
  await apiFetch(`/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: pastTime })
  });

  const s2 = await apiFetch(`/reminders/${noteId}/snooze`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'note', snooze_until: snoozeTime })
  });
  assert(s2.status === 200, 'Snooze note reminder');

  // Snooze non-existent
  const s3 = await apiFetch('/reminders/00000000-0000-0000-0000-000000000099/snooze', {
    method: 'PUT',
    body: JSON.stringify({ type: 'task', snooze_until: snoozeTime })
  });
  assert(s3.status === 404, 'Snooze non-existent returns 404');

  // === Dismiss endpoint ===
  console.log('\nDismiss:');

  // Dismiss the task reminder
  const d1 = await apiFetch(`/reminders/${taskId}/dismiss`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'task' })
  });
  assert(d1.status === 204, 'Dismiss task reminder returns 204');

  // Verify task reminder is cleared
  const t5 = await apiFetch(`/tasks`);
  const dismissedTask = t5.data?.data?.find(t => t.id === taskId);
  assert(dismissedTask?.reminder_at === null, 'Task reminder_at null after dismiss');

  // Dismiss the note reminder
  const d2 = await apiFetch(`/reminders/${noteId}/dismiss`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'note' })
  });
  assert(d2.status === 204, 'Dismiss note reminder returns 204');

  // Verify note reminder is cleared
  const noteCheck = await apiFetch(`/notes/${noteId}`);
  assert(noteCheck.data?.data?.reminder_at === null, 'Note reminder_at null after dismiss');

  // Dismiss non-existent
  const d3 = await apiFetch('/reminders/00000000-0000-0000-0000-000000000099/dismiss', {
    method: 'PUT',
    body: JSON.stringify({ type: 'task' })
  });
  assert(d3.status === 404, 'Dismiss non-existent returns 404');

  // === Reminders list integration ===
  console.log('\nReminders List:');

  // Set both a task and note reminder for list testing
  const listTime = new Date(Date.now() + 3600000).toISOString();
  await apiFetch(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: listTime })
  });
  await apiFetch(`/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ reminder_at: listTime })
  });

  const remList = await apiFetch('/reminders');
  assert(remList.status === 200, 'Fetch reminders list');
  const allReminders = [...remList.data.data.overdue, ...remList.data.data.upcoming];
  const hasTask = allReminders.some(r => r.id === taskId && r.type === 'task');
  const hasNote = allReminders.some(r => r.id === noteId && r.type === 'note');
  assert(hasTask, 'Task reminder appears in list');
  assert(hasNote, 'Note reminder appears in list');

  // === Cleanup ===
  await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
  await apiFetch(`/notes/${noteId}`, { method: 'DELETE' });
  await apiFetch(`/notes/${noteId2}`, { method: 'DELETE' });

  // === Summary ===
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
