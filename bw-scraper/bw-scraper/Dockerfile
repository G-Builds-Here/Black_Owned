# Multi-stage Dockerfile for bw-scraper
# Stage 1: Builder - compile the application
FROM rust:1.88 AS builder

WORKDIR /app

# Copy bw-scraper source files first
COPY ./src/ ./src/

# Create standalone Cargo.toml (no workspace inheritance) using heredoc
RUN cat > ./Cargo.toml << 'CARGO_EOF'
[package]
name = "bw-scraper"
version = "0.1.0"
edition = "2021"
license = "MIT"

[[bin]]
name = "bw-scraper"
path = "src/main.rs"

[dependencies]
anyhow = "1.0"
tokio = { version = "1.0", features = ["full"] }
async-nats = { version = "0.40" }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-native-tls", "uuid", "chrono"] }
redis = { version = "0.27", features = ["tokio-comp", "tokio-rustls-comp"] }
clickhouse = { version = "0.13" }
tracing = { version = "0.1" }
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
dotenvy = "0.15"
reqwest = { version = "0.12", features = ["json"] }
scraper = "0.22"
tokio-tungstenite = "0.24"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4", "serde"] }
CARGO_EOF

# Build dependencies first (for better layer caching)
RUN cargo build --release --bin bw-scraper && \
    rm -rf target/release/.fingerprint/bw-scraper-*

# Copy actual source files and rebuild
COPY ./src/ ./src/
RUN cargo build --release --bin bw-scraper

# Stage 2: Runtime - minimal image with just the binary
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and group
RUN groupadd --gid 1000 scraper && \
    useradd --uid 1000 --gid scraper --create-home --shell /bin/bash scraper

# Set working directory
WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/bw-scraper /app/bw-scraper

# Change ownership to non-root user
RUN chown scraper:scraper /app/bw-scraper

# Switch to non-root user
USER scraper

# Expose ports (if needed for health checks or external connections)
EXPOSE 8080

# Set environment variables
ENV RUST_LOG=info
ENV RUST_BACKTRACE=0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application
ENTRYPOINT ["/app/bw-scraper"]
