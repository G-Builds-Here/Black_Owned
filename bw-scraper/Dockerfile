# Multi-stage Dockerfile for bw-scraper
# Stage 1: Builder - compile the application
FROM rust:1.85-alpine AS builder

# Install required dependencies for building
RUN apk add --no-cache \
    musl-dev \
    openssl-dev \
    pkgconfig \
    build-base

# Create a new Rust project
WORKDIR /app

# Copy root Cargo.toml for workspace resolution (from parent directory)
COPY ../Cargo.toml ./

# Copy bw-scraper directory with its Cargo.toml
COPY ./ ./

# Create dummy lib.rs in other workspace members for dependency resolution
RUN mkdir -p bw-types/src && echo "" > bw-types/src/lib.rs && \
    mkdir -p bw-ingestion/src && echo "" > bw-ingestion/src/lib.rs && \
    mkdir -p bw-api/src && echo "" > bw-api/src/lib.rs

# Build dependencies first (for better layer caching)
RUN cargo build --release --bin bw-scraper && \
    rm -rf target/release/.fingerprint/bw-scraper-*

# Copy actual source files and rebuild
COPY ./src/ ./src/
RUN cargo build --release --bin bw-scraper

# Stage 2: Runtime - minimal image with just the binary
FROM alpine:3.21 AS runtime

# Install runtime dependencies only
RUN apk add --no-cache \
    ca-certificates \
    libressl

# Create non-root user and group
RUN addgroup -g 1000 -S scraper && \
    adduser -u 1000 -S scraper -G scraper

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
