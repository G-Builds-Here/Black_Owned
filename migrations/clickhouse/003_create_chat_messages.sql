-- Chat messages written by bw-ingestion (chat_consumer.rs).
-- The consumer inserts exactly these columns:
--   INSERT INTO chat_messages (id, user_id, business_id, content, timestamp)
-- `messages` in 001_create_tables.sql is the separate user-to-user chat
-- spec table; this table is the user-to-business chat actually produced
-- by the ingestion pipeline.
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID,
    user_id UUID,
    business_id UUID,
    content String,
    timestamp DateTime64(6, 'UTC'),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;
