#!/usr/bin/env bash
#
# LOC-0056-AC4: Environment Configuration Tests
# Shell-based validation tests for .env and docker-compose.yml
#

# Worktree root is the parent of tests directory
WORKTREE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$WORKTREE_ROOT/.env"
ENV_EXAMPLE_FILE="$WORKTREE_ROOT/.env.example"
COMPOSE_FILE="$WORKTREE_ROOT/docker-compose.yml"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
    echo "[PASS] $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo "[FAIL] $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo "=== LOC-0056-AC4 Environment Configuration Tests ==="
echo ""

# Test 1: .env file exists
echo "Test: .env file exists"
if [ -f "$ENV_FILE" ]; then
    pass ".env file exists at $ENV_FILE"
else
    fail ".env file not found at $ENV_FILE"
fi

# Test 2: .env.example file exists
echo "Test: .env.example file exists"
if [ -f "$ENV_EXAMPLE_FILE" ]; then
    pass ".env.example file exists at $ENV_EXAMPLE_FILE"
else
    fail ".env.example file not found at $ENV_EXAMPLE_FILE"
fi

# Test 3: PostgreSQL configuration variables
echo "Test: PostgreSQL configuration variables"
if grep -q "POSTGRES_HOST=" "$ENV_FILE" && \
   grep -q "POSTGRES_PORT=" "$ENV_FILE" && \
   grep -q "POSTGRES_DB=" "$ENV_FILE" && \
   grep -q "POSTGRES_USER=" "$ENV_FILE" && \
   grep -q "POSTGRES_PASSWORD=" "$ENV_FILE"; then
    pass "All PostgreSQL configuration variables present"
else
    fail "Missing PostgreSQL configuration variables"
fi

# Test 4: NATS configuration variables
echo "Test: NATS configuration variables"
if grep -q "NATS_HOST=" "$ENV_FILE" && \
   grep -q "NATS_CLIENT_PORT=" "$ENV_FILE"; then
    pass "All NATS configuration variables present"
else
    fail "Missing NATS configuration variables"
fi

# Test 5: ClickHouse configuration variables
echo "Test: ClickHouse configuration variables"
if grep -q "CLICKHOUSE_HOST=" "$ENV_FILE" && \
   grep -q "CLICKHOUSE_PORT=" "$ENV_FILE" && \
   grep -q "CLICKHOUSE_HTTP_PORT=" "$ENV_FILE" && \
   grep -q "CLICKHOUSE_TCP_PORT=" "$ENV_FILE"; then
    pass "All ClickHouse configuration variables present"
else
    fail "Missing ClickHouse configuration variables"
fi

# Test 6: Valkey configuration variables
echo "Test: Valkey configuration variables"
if grep -q "VALKEY_HOST=" "$ENV_FILE" && \
   grep -q "VALKEY_PORT=" "$ENV_FILE"; then
    pass "All Valkey configuration variables present"
else
    fail "Missing Valkey configuration variables"
fi

# Test 7: DATABASE_URL exists
echo "Test: DATABASE_URL exists"
if grep -q "DATABASE_URL=" "$ENV_FILE"; then
    pass "DATABASE_URL is defined"
else
    fail "DATABASE_URL is not defined"
fi

# Test 8: docker-compose.yml does not contain hardcoded PostgreSQL password
echo "Test: No hardcoded PostgreSQL password in docker-compose.yml"
if grep -qE "POSTGRES_PASSWORD:\s*[^\$\{]" "$COMPOSE_FILE"; then
    fail "Hardcoded PostgreSQL password found in docker-compose.yml"
else
    pass "No hardcoded PostgreSQL password in docker-compose.yml"
fi

# Test 9: docker-compose.yml does not contain hardcoded DATABASE_URL with credentials
echo "Test: No hardcoded DATABASE_URL credentials in docker-compose.yml"
if grep -qE "DATABASE_URL:\s*[\"']?postgresql://[^:]+:[^@]+@" "$COMPOSE_FILE"; then
    fail "Hardcoded DATABASE_URL with credentials found in docker-compose.yml"
else
    pass "No hardcoded DATABASE_URL credentials in docker-compose.yml"
fi

# Test 10: docker-compose.yml does not expose sensitive environment variable names in plaintext
echo "Test: docker-compose.yml does not expose sensitive env var names"
# Check that sensitive variable names are not written as literal values
if grep -qE "(POSTGRES_PASSWORD|JWT_SECRET|DATABASE_URL):" "$COMPOSE_FILE" | grep -v '\$\{'; then
    fail "Sensitive environment variable names exposed in docker-compose.yml"
else
    pass "No sensitive environment variable names exposed in docker-compose.yml"
fi

# Test 11: docker-compose.yml contains expected services
echo "Test: docker-compose.yml contains expected services"
if grep -q "clickhouse:" "$COMPOSE_FILE" && \
   grep -q "nats:" "$COMPOSE_FILE" && \
   grep -q "valkey:" "$COMPOSE_FILE"; then
    pass "All expected services defined in docker-compose.yml"
else
    fail "Missing expected services in docker-compose.yml"
fi

# Test 12: Environment variable naming convention
echo "Test: Environment variable naming convention"
if grep -E "^[A-Z_]+=" "$ENV_FILE" | grep -vE "^[A-Z][A-Z_]*=" > /dev/null 2>&1; then
    fail "Environment variables do not follow naming convention"
else
    pass "All environment variables follow naming convention"
fi

# Test 13: .env.example documents all variables in .env
echo "Test: .env.example documents all variables"
MISSING_VARS=0
while IFS= read -r line; do
    if [[ "$line" =~ ^([A-Z_]+)= ]]; then
        VAR_NAME="${BASH_REMATCH[1]}"
        if ! grep -q "^${VAR_NAME}=" "$ENV_EXAMPLE_FILE"; then
            echo "  Missing in .env.example: $VAR_NAME"
            ((MISSING_VARS++))
        fi
    fi
done < "$ENV_FILE"

if [ "$MISSING_VARS" -eq 0 ]; then
    pass "All .env variables documented in .env.example"
else
    fail "$MISSING_VARS variables missing from .env.example"
fi

# Test 14: DATABASE_URL format validation
echo "Test: DATABASE_URL format validation"
DB_URL=$(grep "DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2)
# Accept postgresql:// format with user:password@host:port/database
if [[ "$DB_URL" =~ ^postgresql://[^:]+:[^@]+@[^:]+:[0-9]+/.+ ]]; then
    pass "DATABASE_URL is properly formatted"
else
    fail "DATABASE_URL format is invalid: $DB_URL"
fi

echo ""
echo "=== Test Summary ==="
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "Tests completed with failures"
    exit 1
else
    echo "All tests passed"
    exit 0
fi
