-- Offline capture: idempotency key for notes created via outbox replay.
-- Client generates a UUID per offline note; server ignores duplicates on retry.

ALTER TABLE notes ADD COLUMN client_id UUID;

CREATE UNIQUE INDEX notes_user_client_id_uniq
  ON notes (user_id, client_id)
  WHERE client_id IS NOT NULL;
