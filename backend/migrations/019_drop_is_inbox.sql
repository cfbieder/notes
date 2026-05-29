-- Migration: 019_drop_is_inbox.sql
-- Created: 2026-05-29
-- Description: Collapse the dual signal for "this note is in the Inbox".
--              See Documentation/CR/CR032_drop_is_inbox_flag.md.
--
--              Old model: notes.is_inbox BOOLEAN flag + notebooks.is_default,
--              kept in sync by ~6 hand-written code paths. Drift was easy and
--              caused notes to silently disappear from /inbox.
--
--              New model: Inbox = notes whose notebook_id IS NULL OR points
--              to the user's default notebook. No flag to maintain.

ALTER TABLE notes DROP COLUMN IF EXISTS is_inbox;
