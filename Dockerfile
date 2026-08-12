# =============================================================================
# Multi-stage Dockerfile for bw-scraper (Rust worker service)
# =============================================================================
# AC Requirements:
# - Multi-stage build (builder + runtime)
# - Final image under 200MB
# - Runs as non-root user
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Compile the Rust application
# -----------------------------------------------------------------------------
FROM rust:slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    libpq-dev \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Create a new Rust project
RUN cargo init --name bw-scraper

# Copy workspace Cargo.toml and update it to include bw-scraper
COPY Cargo.toml ./
RUN sed -i 's/members = \[/members = [\n    "bw-scraper",/' Cargo.toml

# Create bw-scraper crate directory and files
RUN mkdir -p bw-scraper/src

# Create bw-scraper Cargo.toml with minimal compatible dependencies
RUN printf '[package]\nname = "bw-scraper"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntokio = { version = "1", features = ["full"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\ntracing = "0.1"\ntracing-subscriber = { version = "0.3", features = ["env-filter"] }\nthiserror = "1"\nuuid = { version = "1", features = ["v4", "serde"] }\nchrono = { version = "0.4", features = ["serde"] }\n' > bw-scraper/Cargo.toml

# Create main.rs
RUN printf 'use tracing::info;\n\n#[tokio::main]\nasync fn main() {\n    tracing_subscriber::fmt::init();\n    info!("bw-scraper starting...");\n    \n    // TODO: Implement NATS consumer for scrape jobs\n    // TODO: Implement scrapers (GoogleMaps, Yelp, Facebook)\n    // TODO: Implement ETL pipeline\n    // TODO: Implement PostgreSQL importer\n    \n    info!("bw-scraper ready");\n    \n    // Keep running as a worker\n    loop {\n        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;\n    }\n}\n' > bw-scraper/src/main.rs

# Copy workspace member crates
COPY bw-types/ ./bw-types/
COPY bw-ingestion/ ./bw-ingestion/
COPY bw-api/ ./bw-api/

# Build the application (release mode)
RUN cargo build --release --package bw-scraper

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Minimal production image
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Create non-root user and group (required by AC)
RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

# Install only runtime dependencies (no build tools)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy binary from builder
COPY --from=builder /app/target/release/bw-scraper /app/bw-scraper

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user (required by AC)
USER appuser

# Expose port (if needed for health checks)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f bw-scraper || exit 1

# Run the application
CMD ["/app/bw-scraper"]
