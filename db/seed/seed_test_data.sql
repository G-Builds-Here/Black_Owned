-- Seed Data for Black Owned Platform Testing
--
-- Test data for the web app, matching the live Postgres schema
-- (migrations/postgresql/001_create_core_tables.sql). Safe to re-run:
-- user rows are upserted (credentials are refreshed on every run), and
-- businesses/jobs are inserted only when not already present.
--
-- Test Credentials (bcrypt cost 12, the same library + cost as
-- src/lib/auth/auth-service.ts — generated with bcryptjs):
--   Admin User:     admin-test@bws-test@domain.com     / AdminTestPass123!
--   Business Owner: owner-test@bws-test@domain.com     / OwnerTestPass123!
--   Customer:       customer-test@bws-test@domain.com  / CustomerTestPass123!
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed_test_data.sql
--
-- Creation order respects foreign keys: users -> businesses -> scrape jobs.

-- ============================================================================
-- STEP 1: Create Test Users
-- ============================================================================

-- Admin test user. ON CONFLICT ... DO UPDATE keeps the documented credentials
-- current when the seed is re-run (repairs rows that once held placeholder
-- hashes instead of refreshing them).
INSERT INTO users (id, email, password_hash, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'admin-test@bws-test@domain.com',
  '$2a$12$4qC0d2X9bMiEVDOE.p1xJeg9hpZM.xzA1BmiZEhymb7a4Y2UNzaAC', -- AdminTestPass123!
  'Admin Test User',
  'admin',
  'active',
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Business owner test user (owner of the seeded businesses)
INSERT INTO users (id, email, password_hash, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'owner-test@bws-test@domain.com',
  '$2a$12$WZuYJm/1VN/rkdVWzxX9y.iI7bX5D2budOX6l4XOik2N1ZhdieVwO', -- OwnerTestPass123!
  'Business Owner Test User',
  'business_owner',
  'active',
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Customer test user
INSERT INTO users (id, email, password_hash, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'customer-test@bws-test@domain.com',
  '$2a$12$Y..6PyzcxnBh2QvnbNM5lOfDeHcBQk1rz39WB3TmDuo2usuJeM/0q', -- CustomerTestPass123!
  'Customer Test User',
  'customer',
  'active',
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

-- ============================================================================
-- STEP 2: Create Test Businesses (depends on users via owner_id)
-- ============================================================================
-- businesses.name has no unique index in the live schema, so idempotency is
-- a NOT EXISTS guard rather than ON CONFLICT (name).

DO $$
DECLARE
  owner_id UUID;
BEGIN
  SELECT id INTO owner_id FROM users WHERE email = 'owner-test@bws-test@domain.com';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'owner-test user missing; STEP 1 must run first';
  END IF;

  INSERT INTO businesses (id, owner_id, name, description, category_id, verification_status, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    owner_id,
    v.name,
    v.description,
    v.category_id,
    'unverified',
    NOW(),
    NOW()
  FROM (
    VALUES
      -- Food & Dining (5)
      ('BWS-TEST: Soul Food Kitchen', 'Traditional Southern cuisines with a modern twist', 'food-dining'),
      ('BWS-TEST: Community Taco Bar', 'Authentic Mexican street food and fresh ingredients', 'food-dining'),
      ('BWS-TEST: Harlem Soul Cafe', 'Breakfast and lunch spot serving comfort classics', 'food-dining'),
      ('BWS-TEST: Family Restaurant', 'Home-style cooking for the whole family', 'food-dining'),
      ('BWS-TEST: Neighborhood Diner', 'Classic American diner fare', 'food-dining'),
      -- Retail & Fashion (4)
      ('BWS-TEST: Urban Style Boutique', 'Trendy clothing and accessories for all ages', 'retail-fashion'),
      ('BWS-TEST: Community Thrift Store', 'Affordable quality clothing and home goods', 'retail-fashion'),
      ('BWS-TEST: Fashion Forward', 'Latest trends in urban fashion', 'retail-fashion'),
      ('BWS-TEST: Vintage Finds', 'Curated vintage clothing and accessories', 'retail-fashion'),
      -- Professional Services (3)
      ('BWS-TEST: Black Professionals Consulting', 'Business strategy and financial planning services', 'professional-services'),
      ('BWS-TEST: Community Legal Aid', 'Accessible legal services for families and small businesses', 'professional-services'),
      ('BWS-TEST: Financial Advisors Group', 'Personal and business financial planning', 'professional-services'),
      -- Health & Wellness (3)
      ('BWS-TEST: Wellness First Clinic', 'Comprehensive healthcare with cultural competency', 'health-wellness'),
      ('BWS-TEST: Community Fitness Center', 'Affordable gym with group classes and personal training', 'health-wellness'),
      ('BWS-TEST: Black Beauty Salon', 'Professional hair and beauty services', 'health-wellness'),
      -- Other categories (5)
      ('BWS-TEST: Reliable Auto Repair', 'Full-service auto repair and maintenance', 'automotive'),
      ('BWS-TEST: Quality Home Solutions', 'Plumbing, electrical, and general home repair', 'home-services'),
      ('BWS-TEST: Community Arts Center', 'Cultural events, workshops, and live performances', 'entertainment'),
      ('BWS-TEST: Bright Futures Tutoring', 'Academic support for students of all ages', 'education'),
      ('BWS-TEST: Neighborhood Barbershop', 'Classic cuts and modern styling', 'other')
  ) AS v(name, description, category_id)
  WHERE NOT EXISTS (SELECT 1 FROM businesses b WHERE b.name = v.name);
END $$;

-- ============================================================================
-- STEP 3: Create Test Scrape Jobs (live schema: source/query/location,
-- status in pending|running|completed|failed|cancelled, business_count)
-- ============================================================================

INSERT INTO scrape_jobs (id, source, query, location, status, business_count, error_message, started_at, completed_at)
SELECT
  gen_random_uuid(),
  v.source,
  v.query,
  v.location,
  v.status,
  v.business_count,
  v.error_message,
  NOW() - v.ago,
  NOW() - v.ago
FROM (
  VALUES
    ('Google Maps', 'soul food', 'Atlanta', 'completed', 15, NULL, INTERVAL '2 days'),
    ('Google Maps', 'tacos', 'Houston', 'completed', 12, NULL, INTERVAL '1 day'),
    ('Yelp', 'boutique', 'Chicago', 'completed', 8, NULL, INTERVAL '3 days'),
    ('Yelp', 'cafe', 'Seattle', 'failed', 0, 'Connection timeout', INTERVAL '12 hours'),
    ('Facebook', 'local business', 'New York', 'completed', 20, NULL, INTERVAL '5 days')
) AS v(source, query, location, status, business_count, error_message, ago)
WHERE NOT EXISTS (
  SELECT 1 FROM scrape_jobs sj
  WHERE sj.source = v.source AND sj.query = v.query AND sj.location = v.location
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify user count (should be 3)
-- SELECT COUNT(*) as user_count FROM users WHERE email LIKE '%@bws-test@domain.com';

-- Verify business count (should be 20)
-- SELECT COUNT(*) as business_count FROM businesses WHERE name LIKE 'BWS-TEST:%';

-- Verify scrape job count (should be 5)
-- SELECT COUNT(*) as job_count FROM scrape_jobs
-- WHERE location IN ('Atlanta', 'Houston', 'Chicago', 'Seattle', 'New York');

-- Verify foreign key integrity (should return 0 orphaned businesses)
-- SELECT COUNT(*) as orphaned_count
-- FROM businesses b
-- LEFT JOIN users u ON b.owner_id = u.id
-- WHERE u.id IS NULL;

-- ============================================================================
-- CLEANUP (delete all seeded test data; FK-safe order)
-- ============================================================================

-- DELETE FROM scrape_jobs
-- WHERE location IN ('Atlanta', 'Houston', 'Chicago', 'Seattle', 'New York');
-- DELETE FROM businesses WHERE name LIKE 'BWS-TEST:%';
-- DELETE FROM users WHERE email LIKE '%@bws-test@domain.com';
