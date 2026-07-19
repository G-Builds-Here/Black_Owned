//! NATS stream configuration helpers.

use async_nats::jetstream::stream;

/// Create stream configuration for a given stream name and subjects
#[must_use]
pub fn stream_config(name: &str, subjects: &[String]) -> stream::Config {
    stream::Config {
        name: name.to_string(),
        subjects: subjects.to_vec(),
        retention: stream::RetentionPolicy::WorkQueue,
        max_messages_per_subject: 10_000,
        max_age: std::time::Duration::from_secs(86400 * 7), // 7 days
        storage: stream::StorageType::File,
        ..Default::default()
    }
}
