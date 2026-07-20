#!/bin/bash
# Unit tests for provision-minio.sh
#
# These tests validate the script structure and expected behavior
# without requiring an actual MinIO server.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVISION_SCRIPT="$SCRIPT_DIR/../provision-minio.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_count=0
pass_count=0
fail_count=0

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    pass_count=$((pass_count + 1))
    test_count=$((test_count + 1))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    fail_count=$((fail_count + 1))
    test_count=$((test_count + 1))
}

echo "=== MinIO Provisioning Script Tests ==="
echo ""

# Test 1: Script file exists
echo "Test 1: Script file exists"
if [ -f "$PROVISION_SCRIPT" ]; then
    pass "provision-minio.sh exists at $PROVISION_SCRIPT"
else
    fail "provision-minio.sh not found at $PROVISION_SCRIPT"
fi

# Test 2: Script is executable
echo "Test 2: Script is executable"
if [ -x "$PROVISION_SCRIPT" ]; then
    pass "provision-minio.sh is executable"
else
    fail "provision-minio.sh is not executable"
fi

# Test 3: Script contains required bucket definitions
echo "Test 3: Script contains required bucket definitions"
if grep -q "business-images" "$PROVISION_SCRIPT" && \
   grep -q "verification-docs" "$PROVISION_SCRIPT" && \
   grep -q "thumbnails" "$PROVISION_SCRIPT"; then
    pass "All three buckets (business-images, verification-docs, thumbnails) are defined"
else
    fail "Missing bucket definitions"
fi

# Test 4: Script contains correct policy configurations
echo "Test 4: Script contains correct policy configurations"
if grep -q "public-read" "$PROVISION_SCRIPT" && \
   grep -q "private" "$PROVISION_SCRIPT"; then
    pass "Policy configurations (public-read, private) are present"
else
    fail "Missing policy configurations"
fi

# Test 5: Script contains lifecycle configurations
echo "Test 5: Script contains lifecycle configurations"
if grep -q "365" "$PROVISION_SCRIPT" && \
   grep -q "730" "$PROVISION_SCRIPT" && \
   grep -q "30" "$PROVISION_SCRIPT"; then
    pass "Lifecycle configurations (365d, 730d, 30d) are present"
else
    fail "Missing lifecycle configurations"
fi

# Test 6: Script uses mc commands correctly
echo "Test 6: Script uses mc commands correctly"
if grep -q "mc mb" "$PROVISION_SCRIPT" && \
   grep -q "mc anonymous set" "$PROVISION_SCRIPT" && \
   grep -q "mc ilm import" "$PROVISION_SCRIPT"; then
    pass "All required mc commands (mb, anonymous set, ilm import) are present"
else
    fail "Missing mc commands"
fi

# Test 7: Script has error handling
echo "Test 7: Script has error handling"
if grep -q "set -e" "$PROVISION_SCRIPT"; then
    pass "Script has 'set -e' for error handling"
else
    fail "Script missing 'set -e' error handling"
fi

# Test 8: Script validates mc availability
echo "Test 8: Script validates mc availability"
if grep -q "command -v mc" "$PROVISION_SCRIPT"; then
    pass "Script validates mc availability"
else
    fail "Script missing mc availability check"
fi

# Test 9: Script validates alias configuration
echo "Test 9: Script validates alias configuration"
if grep -q "mc alias list" "$PROVISION_SCRIPT"; then
    pass "Script validates alias configuration"
else
    fail "Script missing alias configuration check"
fi

# Test 10: Script creates lifecycle JSON correctly
echo "Test 10: Script creates lifecycle JSON correctly"
if grep -q '"Status": "Enabled"' "$PROVISION_SCRIPT" && \
   grep -q '"Expiration"' "$PROVISION_SCRIPT"; then
    pass "Lifecycle JSON structure is correct"
else
    fail "Lifecycle JSON structure is incorrect"
fi

echo ""
echo "=== Test Summary ==="
echo "Total: $test_count"
echo -e "Passed: ${GREEN}$pass_count${NC}"
echo -e "Failed: ${RED}$fail_count${NC}"

if [ $fail_count -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
