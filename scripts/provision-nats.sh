#!/bin/bash
# NATS Stream Provisioning Script
# Creates streams with retention limits, 168h max_age, file storage, and 1 replica

set -e

# Stream configurations
declare -a STREAMS=(
    "chat-messages"
    "events"
    "images"
    "email-queue"
    "cache-invalidation"
)

echo "=== NATS Stream Provisioning ==="
echo "Creating streams with:"
echo "  - Retention: limits"
echo "  - Max Age: 168h (7 days)"
echo "  - Storage: file"
echo "  - Replicas: 1"
echo ""

for stream in "${STREAMS[@]}"; do
    echo "Provisioning stream: $stream"

    # Check if stream already exists (idempotency)
    if nats stream info "$stream" --json 2>/dev/null | grep -q '"name": "'$stream'"'; then
        echo "  Stream '$stream' already exists. Skipping."
        continue
    fi

    # Create the stream with specified configuration
    nats stream add "$stream" \
        --subjects="$stream.*" \
        --retention=limits \
        --max-age=168h \
        --storage=file \
        --replicas=1 \
        --accept

    echo "  Stream '$stream' created successfully."
done

echo ""
echo "=== Provisioning Complete ==="
echo "All streams configured with retention: limits, max_age: 168h, storage: file, replicas: 1"
