-- Migration: 015_inbox_default_notebook_sync.sql
-- Created: 2026-04-24
-- Description: Reconcile is_inbox flag with the default (Inbox) notebook.
--              Background: the notebook picker was setting is_inbox=false
--              whenever ANY notebook was selected, including the user's
--              default "Inbox" notebook — so notes filed to Inbox via the
--              picker disappeared from the Inbox sidebar view.
--              Policy going forward: notes in the default notebook are, by
--              definition, in the Inbox. This migration backfills that
--              invariant for existing notes; the picker fix is in the
--              frontend (NoteNotebooks.vue, AppSidebar.vue).

UPDATE notes n
SET is_inbox = TRUE,
    updated_at = NOW()
FROM notebooks nb
WHERE n.notebook_id = nb.id
  AND nb.is_default = TRUE
  AND n.is_inbox = FALSE
  AND n.deleted_at IS NULL;
