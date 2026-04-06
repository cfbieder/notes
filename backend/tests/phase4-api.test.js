/**
 * Phase 4 API Tests — Attachments & Reminders
 * Run: node backend/tests/phase4-api.test.js
 * Requires: backend running on port 3001, dev user seeded
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let noteId = null;
let attachmentId = null;
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
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== Phase 4 API Tests ===\n');

  // Auth
  console.log('Auth:');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'dev', password: 'password123' }),
    headers: { 'Content-Type': 'application/json' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');

  // Get a note for attachments
  const notesRes = await apiFetch('/notes');
  noteId = notesRes.data?.data?.[0]?.id;
  assert(notesRes.status === 200 && noteId, 'Fetch notes');

  // === Attachments ===
  console.log('\nAttachments:');

  // Upload file
  const formData = new FormData();
  formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');
  const uploadRes = await fetch(`${BASE}/notes/${noteId}/attachments`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const uploadData = await uploadRes.json();
  attachmentId = uploadData?.data?.id;
  assert(uploadRes.status === 201 && attachmentId, 'Upload file (text/plain)');
  assert(uploadData.data.filename === 'test.txt', 'Filename preserved');
  assert(uploadData.data.mime_type === 'text/plain', 'MIME type correct');
  assert(uploadData.data.size_bytes > 0, 'Size recorded');

  // List attachments for note
  const listRes = await apiFetch(`/notes/${noteId}/attachments`);
  assert(listRes.status === 200 && listRes.data.data.length >= 1, 'List attachments for note');
  assert(listRes.data.data.some(a => a.id === attachmentId), 'Uploaded file in list');

  // Download attachment
  const dlRes = await fetch(`${BASE}/attachments/${attachmentId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const dlText = await dlRes.text();
  assert(dlRes.status === 200 && dlText === 'test content', 'Download file content');
  assert(dlRes.headers.get('content-type') === 'text/plain', 'Download content-type correct');

  // Upload disallowed MIME type
  const badForm = new FormData();
  badForm.append('file', new Blob(['#!/bin/bash'], { type: 'application/x-sh' }), 'evil.sh');
  const badRes = await fetch(`${BASE}/notes/${noteId}/attachments`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: badForm
  });
  assert(badRes.status === 400, 'Reject disallowed MIME type');

  // Upload to non-existent note
  const ghostForm = new FormData();
  ghostForm.append('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  const ghostRes = await fetch(`${BASE}/notes/00000000-0000-0000-0000-000000000099/attachments`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: ghostForm
  });
  assert(ghostRes.status === 404, 'Upload to non-existent note returns 404');

  // Upload image (should succeed)
  const imgForm = new FormData();
  imgForm.append('file', new Blob(['fake-png'], { type: 'image/png' }), 'photo.png');
  const imgRes = await fetch(`${BASE}/notes/${noteId}/attachments`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: imgForm
  });
  const imgData = await imgRes.json();
  assert(imgRes.status === 201, 'Upload image succeeds');
  assert(imgData.data.mime_type === 'image/png', 'Image MIME type correct');

  // Clean up image attachment
  const imgDelRes = await fetch(`${BASE}/attachments/${imgData.data.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert(imgDelRes.status === 204, 'Delete image attachment');

  // Delete text attachment
  const delRes = await apiFetch(`/attachments/${attachmentId}`, { method: 'DELETE' });
  assert(delRes.status === 204, 'Delete text attachment');

  // Verify deleted
  const afterDelRes = await apiFetch(`/notes/${noteId}/attachments`);
  assert(!afterDelRes.data.data.some(a => a.id === attachmentId), 'Attachment removed from list after delete');

  // Delete non-existent attachment
  const del404 = await apiFetch('/attachments/00000000-0000-0000-0000-000000000099', { method: 'DELETE' });
  assert(del404.status === 404, 'Delete non-existent attachment returns 404');

  // === Reminders ===
  console.log('\nReminders:');

  const remRes = await apiFetch('/reminders');
  assert(remRes.status === 200, 'Fetch reminders');
  assert(remRes.data.data.overdue !== undefined, 'Response has overdue array');
  assert(remRes.data.data.upcoming !== undefined, 'Response has upcoming array');
  assert(remRes.data.meta.total !== undefined, 'Response has total count');

  const dueRes = await apiFetch('/reminders/due');
  assert(dueRes.status === 200, 'Fetch due reminders');
  assert(Array.isArray(dueRes.data.data), 'Due response is array');

  // Create task with reminder to test
  const taskRes = await apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      content: 'Test reminder task',
      reminder_at: new Date(Date.now() + 3600000).toISOString()
    })
  });
  assert(taskRes.status === 201, 'Create task with reminder');
  const taskId = taskRes.data?.data?.id;

  // Check it appears in upcoming
  const rem2 = await apiFetch('/reminders');
  const hasUpcoming = rem2.data.data.upcoming.some(r => r.id === taskId);
  assert(hasUpcoming, 'Task with future reminder appears in upcoming');

  // Clean up
  if (taskId) {
    await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
  }

  // Create task with past reminder
  const pastTaskRes = await apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      content: 'Overdue test task',
      reminder_at: new Date(Date.now() - 3600000).toISOString()
    })
  });
  assert(pastTaskRes.status === 201, 'Create task with past reminder');
  const pastTaskId = pastTaskRes.data?.data?.id;

  const rem3 = await apiFetch('/reminders');
  const hasOverdue = rem3.data.data.overdue.some(r => r.id === pastTaskId);
  assert(hasOverdue, 'Task with past reminder appears in overdue');

  // Should also appear in /due
  const due2 = await apiFetch('/reminders/due');
  const isDue = due2.data.data.some(r => r.id === pastTaskId);
  assert(isDue, 'Overdue task appears in /due endpoint');

  // Clean up
  if (pastTaskId) {
    await apiFetch(`/tasks/${pastTaskId}`, { method: 'DELETE' });
  }

  // === Summary ===
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
