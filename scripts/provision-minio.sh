#!/bin/bash
# Provision MinIO buckets with access policies and lifecycle rules
#
# Prerequisites:
# - MinIO server running
# - mc (MinIO Client) installed and configured
# - mc alias set for the MinIO server (default: minio = http://localhost:9002 admin:password)
#
# Usage: ./provision-minio.sh [minio-alias]
#   minio-alias: Optional. Defaults to "minio"

set -e

MINIO_ALIAS="${1:-minio}"

echo "=== MinIO Bucket Provisioning ==="
echo "Using alias: $MINIO_ALIAS"

# Verify mc is available
if ! command -v mc &> /dev/null; then
    echo "ERROR: mc (MinIO Client) is not installed or not in PATH"
    exit 1
fi

# Verify alias is configured
if ! mc alias list "$MINIO_ALIAS" &> /dev/null; then
    echo "ERROR: MinIO alias '$MINIO_ALIAS' is not configured"
    echo "Configure with: mc alias set $MINIO_ALIAS <url> <access-key> <secret-key>"
    exit 1
fi

# Define bucket configurations
# Format: bucket_name:policy:lifecycle_days
declare -a BUCKETS=(
    "business-images:public-read:365"
    "verification-docs:private:730"
    "thumbnails:public-read:30"
)

# Function to create bucket if it doesn't exist
create_bucket() {
    local bucket="$1"
    if mc ls "$MINIO_ALIAS/$bucket" &> /dev/null; then
        echo "[SKIP] Bucket '$bucket' already exists"
    else
        mc mb "$MINIO_ALIAS/$bucket"
        echo "[CREATE] Bucket '$bucket' created"
    fi
}

# Function to set bucket policy
set_policy() {
    local bucket="$1"
    local policy="$2"
    mc anonymous set "$policy" "$MINIO_ALIAS/$bucket"
    echo "[POLICY] Bucket '$bucket' set to '$policy'"
}

# Function to set lifecycle configuration
set_lifecycle() {
    local bucket="$1"
    local days="$2"
    local lifecycle_file="/tmp/lifecycle-${bucket}.json"

    # Create lifecycle configuration JSON
    cat > "$lifecycle_file" << EOF
{
    "Rules": [
        {
            "ID": "ExpireAfter${days}Days",
            "Status": "Enabled",
            "Filter": {
                "Prefix": ""
            },
            "Expiration": {
                "Days": $days
            }
        }
    ]
}
EOF

    mc ilm import "$MINIO_ALIAS/$bucket" < "$lifecycle_file"
    echo "[LIFECYCLE] Bucket '$bucket' set to expire objects after $days days"

    # Clean up temp file
    rm -f "$lifecycle_file"
}

# Provision each bucket
for config in "${BUCKETS[@]}"; do
    IFS=':' read -r bucket policy days <<< "$config"

    echo ""
    echo "--- Provisioning: $bucket ---"

    create_bucket "$bucket"
    set_policy "$bucket" "$policy"
    set_lifecycle "$bucket" "$days"
done

echo ""
echo "=== Provisioning Complete ==="
echo ""
echo "Summary:"
for config in "${BUCKETS[@]}"; do
    IFS=':' read -r bucket policy days <<< "$config"
    echo "  - $bucket: policy=$policy, lifecycle=${days}d"
done
