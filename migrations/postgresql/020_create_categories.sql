-- 020: Baseline for the categories table.
--
-- This table has no migration: it was created in the retired bw-api era and
-- exists only in live databases (and the ClickHouse mirror). A fresh
-- `npm run migrate` left /api/categories, claim category validation, and
-- GraphQL category resolution broken (survey finding H1).
--
-- Idempotent: IF NOT EXISTS + ON CONFLICT, so re-running against a live
-- database that already has the table and its rows is a no-op.

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the baseline categories. IDs match the live database so existing
-- businesses.category_id references keep resolving.
INSERT INTO categories (id, name) VALUES
  ('28354903-1c2b-43b5-ad4f-d1c3277f9baa', 'Professional Services'),
  ('828bddaf-84c5-4462-b898-644fe8e24b86', 'Health & Wellness'),
  ('ac15cb07-55cc-47e0-9be4-16d3c6bbbe49', 'Retail & Fashion'),
  ('c7e04c6a-eba0-47d1-b4d3-94d8b4e5066d', 'Food & Dining'),
  ('d0cd6189-7133-4c24-bb02-254456bb9961', 'Entertainment'),
  ('f6465b94-63ee-41b3-9a47-3947627d3596', 'Personal Services')
ON CONFLICT (id) DO NOTHING;
