# =============================================================================
# Multi-stage Dockerfile for bw-scraper (Rust worker service)
# =============================================================================
# AC: LOC-0056-AC1
# - Multi-stage build (rust builder + debian slim runtime)
# - Final image under 200MB
# - Runs as non-root user
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - compile the workspace crate bw_scraper
# -----------------------------------------------------------------------------
FROM rust:1.88 AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Workspace manifests + lockfile first (cargo needs every member manifest to
# parse even though only bw_scraper compiles), then the crate sources.
COPY Cargo.toml Cargo.lock ./
COPY bw-types/ ./bw-types/
COPY bw-ingestion/ ./bw-ingestion/
COPY bw-api/ ./bw-api/
COPY bw-scraper/ ./bw-scraper/

RUN cargo build --release --package bw_scraper

# -----------------------------------------------------------------------------
# Stage 2: Runtime - slim image carrying the release binary
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libpq5 \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 scraper && \
    useradd --uid 1000 --gid scraper --home-dir /app --create-home scraper

WORKDIR /app

COPY --from=builder /app/target/release/bw_scraper /app/bw-scraper

RUN chown scraper:scraper /app/bw-scraper

USER scraper

EXPOSE 8080

ENV RUST_LOG=info
ENV RUST_BACKTRACE=0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/bw-scraper"]
