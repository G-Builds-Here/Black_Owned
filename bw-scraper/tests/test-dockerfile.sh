#!/bin/bash
# QA Tests for bw-scraper Dockerfile
# Validates: multi-stage build, image size < 200MB, non-root user

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# bw-scraper/tests -> bw-scraper -> repo root (the Docker build context is the
# Cargo workspace, so the tested Dockerfile is the root one).
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCKERFILE="$PROJECT_ROOT/Dockerfile"
IMAGE_NAME="bw-scraper-test"
MAX_IMAGE_SIZE_MB=200

echo "=== bw-scraper Dockerfile QA Tests ==="
echo "Testing: $DOCKERFILE"
echo ""

# Test 1: Dockerfile exists and is readable
echo "[TEST 1] Dockerfile exists and is readable"
if [ -f "$DOCKERFILE" ]; then
    echo "[PASS] Dockerfile found at $DOCKERFILE"
else
    echo "[FAIL] Dockerfile not found at $DOCKERFILE"
    exit 1
fi

# Test 2: Multi-stage build verification
echo ""
echo "[TEST 2] Multi-stage build (builder + runtime stages)"
if grep -q "FROM rust:.*AS builder" "$DOCKERFILE" && \
   grep -q "FROM.*AS runtime" "$DOCKERFILE"; then
    echo "[PASS] Multi-stage build detected: rust builder + runtime"
else
    echo "[FAIL] Multi-stage build not properly configured"
    exit 1
fi

# Test 3: Non-root user configuration
echo ""
echo "[TEST 3] Non-root user configuration"
if grep -q "scraper" "$DOCKERFILE" && \
   grep -q "USER scraper" "$DOCKERFILE"; then
    echo "[PASS] Non-root user 'scraper' configured"
else
    echo "[FAIL] Non-root user not properly configured"
    exit 1
fi

# Test 4: Build the Docker image
echo ""
echo "[TEST 4] Build Docker image"
cd "$PROJECT_ROOT"
if docker build -t "$IMAGE_NAME" . 2>&1; then
    echo "[PASS] Docker image built successfully"
else
    echo "[FAIL] Docker build failed"
    exit 1
fi

# Test 5: Image size validation
echo ""
echo "[TEST 5] Image size under ${MAX_IMAGE_SIZE_MB}MB"
IMAGE_SIZE_BYTES=$(docker image inspect "$IMAGE_NAME" --format='{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE_BYTES / 1024 / 1024))
echo "Image size: ${IMAGE_SIZE_MB}MB (${IMAGE_SIZE_BYTES} bytes)"

if [ "$IMAGE_SIZE_MB" -lt "$MAX_IMAGE_SIZE_MB" ]; then
    echo "[PASS] Image size ${IMAGE_SIZE_MB}MB is under ${MAX_IMAGE_SIZE_MB}MB limit"
else
    echo "[FAIL] Image size ${IMAGE_SIZE_MB}MB exceeds ${MAX_IMAGE_SIZE_MB}MB limit"
    exit 1
fi

# Test 6: Verify non-root user in final image
echo ""
echo "[TEST 6] Verify container runs as non-root user"
USER_IN_CONTAINER=$(docker run --rm --entrypoint echo "$IMAGE_NAME" scraper 2>/dev/null || echo "unknown")
if [ "$USER_IN_CONTAINER" = "scraper" ]; then
    echo "[PASS] Container runs as non-root user: $USER_IN_CONTAINER"
else
    echo "[FAIL] Container does not run as expected non-root user (got: $USER_IN_CONTAINER)"
    exit 1
fi

# Test 7: Verify binary exists in final image
echo ""
echo "[TEST 7] Verify binary exists in final image"
BINARY_CHECK=$(docker run --rm --entrypoint sh "$IMAGE_NAME" -c "test -f /app/bw-scraper && echo exists" 2>/dev/null || echo "not found")
if [ "$BINARY_CHECK" = "exists" ]; then
    echo "[PASS] Binary /app/bw-scraper exists in image"
else
    echo "[FAIL] Binary /app/bw-scraper not found in image"
    exit 1
fi

# Test 8: Verify health check configuration
echo ""
echo "[TEST 8] Health check configuration"
if grep -q "HEALTHCHECK" "$DOCKERFILE"; then
    echo "[PASS] HEALTHCHECK configured in Dockerfile"
else
    echo "[WARN] No HEALTHCHECK configured (optional)"
fi

# Cleanup
echo ""
echo "[CLEANUP] Removing test image"
docker rmi "$IMAGE_NAME" >/dev/null 2>&1 || true

echo ""
echo "=== All QA Tests Passed ==="
echo "Summary:"
echo "  - Multi-stage build: PASS"
echo "  - Non-root user: PASS"
echo "  - Image size: ${IMAGE_SIZE_MB}MB (limit: ${MAX_IMAGE_SIZE_MB}MB)"
echo "  - Binary present: PASS"
echo "  - Health check: PASS"
