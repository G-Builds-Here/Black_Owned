-- ClickHouse 24.x schema for Black Owned platform
-- All tables use ReplacingMergeTree for deduplication and versioning

-- Businesses table
CREATE TABLE IF NOT EXISTS businesses (
    id UUID,
    name String,
    category_id UUID,
    verified UInt8 DEFAULT 0,
    created_at DateTime64(6, 'UTC'),
    owner_id UUID,
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID,
    business_id UUID,
    user_id UUID,
    rating UInt8,
    comment String,
    created_at DateTime64(6, 'UTC'),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID,
    email String,
    display_name String,
    created_at DateTime64(6, 'UTC'),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Verification requests table
CREATE TABLE IF NOT EXISTS verification_requests (
    id UUID,
    business_id UUID,
    verifier_id UUID,
    verified_at DateTime64(6, 'UTC'),
    method String,
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID,
    sender_id UUID,
    recipient_id UUID,
    content String,
    sent_at DateTime64(6, 'UTC'),
    read_at Nullable(DateTime64(6, 'UTC')),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID,
    business_id UUID,
    event_type String,
    event_data String,
    created_at DateTime64(6, 'UTC'),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID,
    name String,
    description String,
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Chat messages table for chat persistence consumer
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID,
    user_id UUID,
    business_id UUID,
    content String,
    timestamp DateTime64(6, 'UTC'),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;
