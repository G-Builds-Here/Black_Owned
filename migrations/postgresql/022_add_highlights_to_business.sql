-- 022: Add a nullable highlights column to businesses.
--
-- Holds category-specific highlights for the HIGHLIGHTS epic (LOC-0083).
-- v1 stores a JSON array of short strings (<=5 facets, <=80 chars each);
-- v2 may switch to {facet, value} pairs without a column change.
-- JSONB matches the social_urls convention (014).
--
-- pending_import_businesses is intentionally NOT touched (stays NULL until
-- post-approval enrichment covers it).
--
-- Idempotent: safe to re-run against databases that already have the column.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS highlights JSONB;
