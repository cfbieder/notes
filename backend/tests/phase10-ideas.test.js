/**
 * Phase 10 API Tests — Ideas Section
 * Run: node backend/tests/phase10-ideas.test.js
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
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

const cleanup = [];

async function run() {
  console.log('\n=== Phase 10 Ideas API Tests ===\n');

  console.log('Auth:');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');
  if (!token) { console.error('Cannot continue without token'); process.exit(1); }

  // -----------------------------------------------------------------
  console.log('\nCreate idea (note_type=idea):');
  const createRes = await apiFetch('/notes', {
    method: 'POST',
    body: {
      title: 'Test idea title',
      content: 'A spark of an idea\nwith a second line',
      note_type: 'idea'
    }
  });
  const idea = createRes.data?.data;
  assert(createRes.status === 201, 'POST /notes returns 201');
  assert(idea?.note_type === 'idea', 'Created note has note_type=idea');
  assert(idea?.is_inbox === false, 'Idea is not in inbox');
  assert(idea?.notebook_id === null, 'Idea has null notebook_id');
  assert(idea?.title === 'Test idea title', 'Title has no 💡 prefix');
  assert(!idea?.content?.includes('**Idea**'), 'Content has no blockquote wrapper');
  if (idea?.id) cleanup.push(idea.id);

  // -----------------------------------------------------------------
  console.log('\nList ideas (note_type=idea filter):');
  const listRes = await apiFetch('/notes?note_type=idea');
  assert(listRes.status === 200, 'GET /notes?note_type=idea returns 200');
  assert(Array.isArray(listRes.data?.data), 'Returns array');
  const found = listRes.data?.data?.find(n => n.id === idea?.id);
  assert(found, 'Created idea appears in idea list');
  assert(found?.note_type === 'idea', 'Idea list item has note_type field');

  // -----------------------------------------------------------------
  console.log('\nList notes excluding ideas (note_type=note):');
  const notesOnly = await apiFetch('/notes?note_type=note');
  assert(notesOnly.status === 200, 'GET /notes?note_type=note returns 200');
  const noIdeas = notesOnly.data?.data?.every(n => n.note_type === 'note');
  assert(noIdeas, 'Filter excludes ideas');

  // -----------------------------------------------------------------
  console.log('\nDefault listing includes ideas (first-class everywhere):');
  const allNotes = await apiFetch('/notes');
  const containsIdea = allNotes.data?.data?.some(n => n.id === idea?.id);
  assert(containsIdea, 'Default GET /notes includes ideas');

  // -----------------------------------------------------------------
  console.log('\nPromote endpoint — fetch a notebook first:');
  const nbRes = await apiFetch('/notebooks');
  const targetNotebook = nbRes.data?.data?.find(n => !n.is_default) || nbRes.data?.data?.[0];
  assert(targetNotebook, 'Test user has at least one notebook');

  console.log('\nPromote idea:');
  // Create a fresh idea to promote
  const ideaForPromote = (await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'Idea to promote', content: 'promote me', note_type: 'idea' }
  })).data?.data;
  if (ideaForPromote?.id) cleanup.push(ideaForPromote.id);

  const promoteRes = await apiFetch(`/notes/${ideaForPromote.id}/promote`, {
    method: 'POST',
    body: { notebook_id: targetNotebook.id }
  });
  assert(promoteRes.status === 200, 'POST /promote returns 200');
  assert(promoteRes.data?.data?.note_type === 'note', 'note_type flipped to note');
  assert(promoteRes.data?.data?.notebook_id === targetNotebook.id, 'notebook_id set');

  // Promoting a non-idea should 409
  const promoteAgain = await apiFetch(`/notes/${ideaForPromote.id}/promote`, {
    method: 'POST',
    body: { notebook_id: targetNotebook.id }
  });
  assert(promoteAgain.status === 409, 'Promoting a non-idea returns 409');

  // -----------------------------------------------------------------
  console.log('\nMerge (move-to-note):');
  // Create target note
  const targetNote = (await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'Merge target', content: 'existing line', notebook_id: targetNotebook.id }
  })).data?.data;
  if (targetNote?.id) cleanup.push(targetNote.id);

  // Create idea to merge
  const ideaToMerge = (await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'Idea to merge', content: 'first line\nsecond line', note_type: 'idea' }
  })).data?.data;

  const mergeRes = await apiFetch(`/notes/${ideaToMerge.id}/merge-into`, {
    method: 'POST',
    body: { target_note_id: targetNote.id }
  });
  assert(mergeRes.status === 200, 'POST /merge-into returns 200');
  const newContent = mergeRes.data?.data?.content || '';
  assert(newContent.includes('existing line'), 'Original target content preserved');
  assert(newContent.includes('- first line'), 'First line becomes bullet');
  assert(newContent.includes('  second line'), 'Subsequent lines indented');

  // Source idea should be soft-deleted
  const sourceCheck = await apiFetch(`/notes/${ideaToMerge.id}`);
  assert(sourceCheck.data?.data?.deleted_at != null, 'Source idea soft-deleted');

  // Merge non-existent target → 404
  const badMerge = await apiFetch(`/notes/${ideaForPromote.id}/merge-into`, {
    method: 'POST',
    body: { target_note_id: '00000000-0000-0000-0000-000000000000' }
  });
  assert(badMerge.status === 404, 'Merge into missing target returns 404');

  // -----------------------------------------------------------------
  console.log('\nConvert idea → standalone task:');
  const ideaForTask = (await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'Idea for task', content: 'Pick up groceries', note_type: 'idea' }
  })).data?.data;

  const convertRes = await apiFetch(`/notes/${ideaForTask.id}/convert-to-task`, {
    method: 'POST'
  });
  assert(convertRes.status === 201, 'POST /convert-to-task returns 201');
  assert(convertRes.data?.data?.content === 'Pick up groceries', 'Task content matches idea content');
  assert(convertRes.data?.data?.note_id === null, 'Task note_id is null (inbox/standalone)');
  assert(convertRes.data?.data?.is_done === false, 'Task starts not-done');

  // Source idea is soft-deleted
  const ideaCheck = await apiFetch(`/notes/${ideaForTask.id}`);
  assert(ideaCheck.data?.data?.deleted_at != null, 'Source idea soft-deleted after convert');

  // Cleanup the task we just made
  if (convertRes.data?.data?.id) {
    await apiFetch(`/tasks/${convertRes.data.data.id}`, { method: 'DELETE' });
  }

  // Convert a non-idea (the promoted note from earlier) → 409
  const convertNonIdea = await apiFetch(`/notes/${ideaForPromote.id}/convert-to-task`, {
    method: 'POST'
  });
  assert(convertNonIdea.status === 409, 'Convert non-idea returns 409');

  // Convert missing → 404
  const convertMissing = await apiFetch('/notes/00000000-0000-0000-0000-000000000000/convert-to-task', {
    method: 'POST'
  });
  assert(convertMissing.status === 404, 'Convert missing idea returns 404');

  // -----------------------------------------------------------------
  console.log('\nUpdate note_type via PUT:');
  const newIdea = (await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'Convert me', content: 'x', note_type: 'idea' }
  })).data?.data;
  if (newIdea?.id) cleanup.push(newIdea.id);

  const putRes = await apiFetch(`/notes/${newIdea.id}`, {
    method: 'PUT',
    body: { note_type: 'note' }
  });
  assert(putRes.status === 200 && putRes.data?.data?.note_type === 'note', 'PUT can flip note_type');

  // -----------------------------------------------------------------
  // Cleanup
  console.log('\nCleanup:');
  for (const id of cleanup) {
    await apiFetch(`/notes/${id}`, { method: 'DELETE' });
    await apiFetch(`/notes/${id}/permanent`, { method: 'DELETE' });
  }
  console.log(`  Deleted ${cleanup.length} test note(s)`);

  // -----------------------------------------------------------------
  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(err => { console.error(err); process.exit(1); });
