-- Seed Data for Black Owned Platform Testing
-- LOC-0058: Seed data for testing bw-scraper
--
-- This script creates test data in the correct order to respect foreign key constraints:
-- 1. Users (no dependencies)
-- 2. Businesses (depends on users via owner_id)
-- 3. Scrape jobs (no dependencies)
--
-- Test Credentials (documented per AC3 requirements):
--   Admin User: admin-test@bws-test@domain.com / AdminTestPass123!
--   Business Owner: owner-test@bws-test@domain.com / OwnerTestPass123!

-- ============================================================================
-- STEP 1: Create Test Users (no dependencies - must be first)
-- ============================================================================

-- Admin test user (AC3 requirement)
INSERT INTO users (id, email, password_hash, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'admin-test@bws-test@domain.com',
  '$2b$10$placeholder_for_admin_password_hash', -- Replace with actual hash: AdminTestPass123!
  'Admin Test User',
  'admin',
  'active',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Business owner test user (for FK reference)
INSERT INTO users (id, email, password_hash, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'owner-test@bws-test@domain.com',
  '$2b$10$placeholder_for_owner_password_hash', -- Replace with actual hash: OwnerTestPass123!
  'Business Owner Test User',
  'business_owner',
  'active',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Customer test user
INSERT INTO users (id, email, password_hash, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'customer-test@bws-test@domain.com',
  '$2b$10$placeholder_for_customer_password_hash',
  'Customer Test User',
  'customer',
  'active',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- STEP 2: Create Test Businesses (depends on users via owner_id)
-- ============================================================================

-- Get the business owner user ID for FK reference
DO $$
DECLARE
  owner_id UUID;
BEGIN
  SELECT id INTO owner_id FROM users WHERE email = 'owner-test@bws-test@domain.com';

  -- Food & Dining businesses (5)
  INSERT INTO businesses (id, owner_id, name, description, category_id, verification_status, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    owner_id,
    name,
    description,
    category_id,
    'unverified',
    NOW(),
    NOW()
  FROM (
    VALUES
      ('BWS-TEST: Soul Food Kitchen', 'Traditional Southern cuisines with a modern twist', 'food-dining'),
      ('BWS-TEST: Community Taco Bar', 'Authentic Mexican street food and fresh ingredients', 'food-dining'),
      ('BWS-TEST: Harlem Soul Cafe', 'Breakfast and lunch spot serving comfort classics', 'food-dining'),
      ('BWS-TEST: Family Restaurant', 'Home-style cooking for the whole family', 'food-dining'),
      ('BWS-TEST: Neighborhood Diner', 'Classic American diner fare', 'food-dining')
  ) AS businesses(name, description, category_id)
  ON CONFLICT (name) DO NOTHING;

  -- Retail & Fashion businesses (4)
  INSERT INTO businesses (id, owner_id, name, description, category_id, verification_status, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    owner_id,
    name,
    description,
    category_id,
    'unverified',
    NOW(),
    NOW()
  FROM (
    VALUES
      ('BWS-TEST: Urban Style Boutique', 'Trendy clothing and accessories for all ages', 'retail-fashion'),
      ('BWS-TEST: Community Thrift Store', 'Affordable quality clothing and home goods', 'retail-fashion'),
      ('BWS-TEST: Fashion Forward', 'Latest trends in urban fashion', 'retail-fashion'),
      ('BWS-TEST: Vintage Finds', 'Curated vintage clothing and accessories', 'retail-fashion')
  ) AS businesses(name, description, category_id)
  ON CONFLICT (name) DO NOTHING;

  -- Professional Services (3)
  INSERT INTO businesses (id, owner_id, name, description, category_id, verification_status, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    owner_id,
    name,
    description,
    category_id,
    'unverified',
    NOW(),
    NOW()
  FROM (
    VALUES
      ('BWS-TEST: Black Professionals Consulting', 'Business strategy and financial planning services', 'professional-services'),
      ('BWS-TEST: Community Legal Aid', 'Accessible legal services for families and small businesses', 'professional-services'),
      ('BWS-TEST: Financial Advisors Group', 'Personal and business financial planning', 'professional-services')
  ) AS businesses(name, description, category_id)
  ON CONFLICT (name) DO NOTHING;

  -- Health & Wellness (3)
  INSERT INTO businesses (id, owner_id, name, description, category_id, verification_status, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    owner_id,
    name,
    description,
    category_id,
    'unverified',
    NOW(),
    NOW()
  FROM (
    VALUES
      ('BWS-TEST: Wellness First Clinic', 'Comprehensive healthcare with cultural competency', 'health-wellness'),
      ('BWS-TEST: Community Fitness Center', 'Affordable gym with group classes and personal training', 'health-wellness'),
      ('BWS-TEST: Black Beauty Salon', 'Professional hair and beauty services', 'health-wellness')
  ) AS businesses(name, description, category_id)
  ON CONFLICT (name) DO NOTHING;

  -- Other categories (5)
  INSERT INTO businesses (id, owner_id, name, description, category_id, verification_status, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    owner_id,
    name,
    description,
    category_id,
    'unverified',
    NOW(),
    NOW()
  FROM (
    VALUES
      ('BWS-TEST: Reliable Auto Repair', 'Full-service auto repair and maintenance', 'automotive'),
      ('BWS-TEST: Quality Home Solutions', 'Plumbing, electrical, and general home repair', 'home-services'),
      ('BWS-TEST: Community Arts Center', 'Cultural events, workshops, and live performances', 'entertainment'),
      ('BWS-TEST: Bright Futures Tutoring', 'Academic support for students of all ages', 'education'),
      ('BWS-TEST: Neighborhood Barbershop', 'Classic cuts and modern styling', 'other')
  ) AS businesses(name, description, category_id)
  ON CONFLICT (name) DO NOTHING;
END $$;

-- ============================================================================
-- STEP 3: Create Test Scrape Jobs (AC1 requirement - no dependencies)
-- ============================================================================

-- Google Maps scrape jobs (2)
INSERT INTO scrape_jobs (id, job_name, target_url, status, error_message, items_scraped, started_at, completed_at)
VALUES
  (gen_random_uuid(), 'GoogleMaps_SoulFood_Atlanta', 'https://maps.google.com/search/soul+food+restaurant+atlanta', 'success', NULL, 15, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'GoogleMaps_Tacos_Houston', 'https://maps.google.com/search/tacos+restaurant+houston', 'success', NULL, 12, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- Yelp scrape jobs (2)
INSERT INTO scrape_jobs (id, job_name, target_url, status, error_message, items_scraped, started_at, completed_at)
VALUES
  (gen_random_uuid(), 'Yelp_Boutique_Chicago', 'https://yelp.com/search/boutique+chicago', 'success', NULL, 8, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'Yelp_Cafe_Seattle', 'https://yelp.com/search/cafe+seattle', 'failed', 'Connection timeout', 0, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours')
ON CONFLICT DO NOTHING;

-- Facebook scrape job (1)
INSERT INTO scrape_jobs (id, job_name, target_url, status, error_message, items_scraped, started_at, completed_at)
VALUES
  (gen_random_uuid(), 'Facebook_LocalBusiness_NewYork', 'https://facebook.com/search/local+business+new+york', 'success', NULL, 20, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify user count (should be 3)
-- SELECT COUNT(*) as user_count FROM users WHERE email LIKE '%@bws-test@domain.com';

-- Verify business count (should be 20)
-- SELECT COUNT(*) as business_count FROM businesses WHERE name LIKE 'BWS-TEST:%';

-- Verify scrape job count (should be 5)
-- SELECT COUNT(*) as job_count FROM scrape_jobs WHERE job_name LIKE 'GoogleMaps%' OR job_name LIKE 'Yelp%' OR job_name LIKE 'Facebook%';

-- Verify foreign key integrity (should return 0 orphaned businesses)
-- SELECT COUNT(*) as orphaned_count
-- FROM businesses b
-- LEFT JOIN users u ON b.owner_id = u.id
-- WHERE u.id IS NULL;
