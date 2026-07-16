-- Phase 7 — Gate Analytics: events table
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users NOT NULL,
  event_name   text        NOT NULL,
  feature      text,
  context      jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for the admin dashboard queries
CREATE INDEX IF NOT EXISTS events_user_id_idx    ON events (user_id);
CREATE INDEX IF NOT EXISTS events_event_name_idx ON events (event_name);
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at DESC);

-- RLS: regular users cannot read or write events directly.
-- All writes go through api/track.js using the service_role key.
-- All reads go through api/admin-stats.js using the service_role key.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- No policies created — service_role bypasses RLS entirely.
