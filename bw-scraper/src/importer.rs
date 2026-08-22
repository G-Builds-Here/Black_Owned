//! Postgres persistence for scrape jobs and discovered businesses.

use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::models::ScrapedBusinessRecord;

#[derive(Clone)]
pub struct PostgresImporter {
    pool: PgPool,
}

impl PostgresImporter {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_scrape_job(
        &self,
        source: &str,
        query: &str,
        location: &str,
    ) -> anyhow::Result<Uuid> {
        let row = sqlx::query(
            r#"INSERT INTO scrape_jobs (source, query, location, status, created_at, updated_at)
               VALUES ($1, $2, $3, 'pending', now(), now())
               RETURNING id"#,
        )
        .bind(source)
        .bind(query)
        .bind(location)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.get::<Uuid, _>("id"))
    }

    pub async fn mark_running(&self, job_id: Uuid) -> anyhow::Result<()> {
        sqlx::query(
            r#"UPDATE scrape_jobs
               SET status = 'running', started_at = now(), updated_at = now()
               WHERE id = $1"#,
        )
        .bind(job_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn complete(&self, job_id: Uuid, business_count: i32) -> anyhow::Result<()> {
        sqlx::query(
            r#"UPDATE scrape_jobs
               SET status = 'completed', business_count = $2, completed_at = now(), updated_at = now()
               WHERE id = $1"#,
        )
        .bind(job_id)
        .bind(business_count)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn fail(&self, job_id: Uuid, error_message: &str) -> anyhow::Result<()> {
        sqlx::query(
            r#"UPDATE scrape_jobs
               SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
               WHERE id = $1"#,
        )
        .bind(job_id)
        .bind(error_message)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Insert discovered businesses; returns the number of rows written.
    /// Individual insert errors are logged, not fatal to the job.
    pub async fn insert_scraped_businesses(
        &self,
        job_id: Uuid,
        source: &str,
        records: &[ScrapedBusinessRecord],
    ) -> usize {
        let mut inserted = 0usize;
        for record in records {
            match sqlx::query(
                r#"INSERT INTO scraped_businesses
                   (scrape_job_id, source, name, address, phone, website, category,
                    rating, review_count, source_id, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())"#,
            )
            .bind(job_id)
            .bind(source)
            .bind(&record.name)
            .bind(&record.address)
            .bind(&record.phone)
            .bind(&record.website)
            .bind(&record.category)
            .bind(record.rating)
            .bind(record.review_count)
            .bind(&record.source_id)
            .execute(&self.pool)
            .await
            {
                Ok(result) => inserted += result.rows_affected() as usize,
                Err(e) => tracing::warn!(
                    source_id = %record.source_id,
                    error = %e,
                    "scraped business insert skipped"
                ),
            }
        }
        inserted
    }
}
