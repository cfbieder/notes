-- Dev seed data for Noted
-- Run after migrations: psql -U noteduser -d noted_dev -f db/seeds/001_dev_seed.sql
--
-- Creates a test user (password: "password123") with sample data.

-- Test user (bcrypt hash of "password123")
INSERT INTO users (id, username, email, password_hash)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'dev',
  'dev@noted.local',
  '$2b$10$GF5Bxy7B4PSnyOY6eD/rVO1Db0tF7DPtQlLWhBSmyFrYOdS4EgzS2'
) ON CONFLICT (username) DO NOTHING;

-- Stacks
INSERT INTO stacks (id, user_id, name) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Personal'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Work')
ON CONFLICT DO NOTHING;

-- Notebooks
INSERT INTO notebooks (id, user_id, stack_id, name, is_default) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', NULL, 'Inbox', TRUE),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Journal', FALSE),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Ideas', FALSE),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Projects', FALSE)
ON CONFLICT DO NOTHING;

-- Tags
INSERT INTO tags (id, user_id, name, color) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'important', '#ff9f1c'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'reference', '#3a86ff'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'idea', '#4cc9f0')
ON CONFLICT DO NOTHING;

-- Notes
INSERT INTO notes (id, user_id, notebook_id, title, content, is_inbox) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
   'Welcome to Noted',
   E'# Welcome to Noted\n\nThis is your first note. **Noted** is a Markdown-first knowledge management app.\n\n## Features\n\n- Markdown editing with inline rendering\n- Notebooks and stacks for organization\n- Tags as a knowledge graph layer\n- Bidirectional [[wikilinks]]\n- Quick capture inbox\n\n## Getting Started\n\n1. Create a notebook in the sidebar\n2. Start writing in Markdown\n3. Use `#tags` and `[[links]]` to connect ideas\n\nHappy note-taking!',
   FALSE),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'App Architecture Ideas',
   E'# Architecture Ideas\n\n## Frontend\n\n- Vue 3 Composition API\n- CodeMirror 6 for the editor\n- D3.js for the graph view\n\n## Backend\n\n- Fastify for low-overhead API\n- PostgreSQL with tsvector for search\n- JWT auth with refresh tokens\n\n## Key Decisions\n\n- [ ] Evaluate pgvector for semantic search\n- [ ] Decide on offline sync strategy\n- [x] Choose Markdown parser library',
   FALSE),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Quick thought from inbox',
   E'Look into Readability.js for the web clipper feature.',
   TRUE)
ON CONFLICT DO NOTHING;

-- Note-tag associations
INSERT INTO note_tags (note_id, tag_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Tasks
INSERT INTO tasks (id, user_id, note_id, content, is_done, due_date) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
   'Evaluate pgvector for semantic search', FALSE, '2026-04-15'),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
   'Decide on offline sync strategy', FALSE, NULL),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', NULL,
   'Set up Tailscale on the VM', FALSE, '2026-04-10')
ON CONFLICT DO NOTHING;
