-- Migration: 013_integration_auth_error.sql
-- Created: 2026-04-22
-- Description: Track OAuth refresh failures so the poller can stop hammering
--              Google and the UI can prompt the user to reconnect.

ALTER TABLE integrations ADD COLUMN IF NOT EXISTS auth_error TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS auth_error_at TIMESTAMPTZ;
