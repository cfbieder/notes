-- Migration: 005_knowledge_graph.sql
-- Created: 2026-04-11
-- Description: Indexes for note_links performance (knowledge graph)

CREATE INDEX IF NOT EXISTS note_links_source_idx ON note_links(source_note_id);
CREATE INDEX IF NOT EXISTS note_links_target_idx ON note_links(target_note_id);
