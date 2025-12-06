#!/bin/bash

# --- MongoDB Atlas Credentials ---
PUBLIC_KEY=""
PRIVATE_KEY=""
GROUP_ID=""

BASE_URL="https://cloud.mongodb.com/api/atlas/v2"

echo "🔍 Fetching processes for group: $GROUP_ID ..."

# 1) Get all processes for the group
PROCESSES_RESPONSE=$(curl --user "$PUBLIC_KEY:$PRIVATE_KEY" \
  --digest \
  --silent \
  --header "Accept: application/vnd.atlas.2025-03-12+json" \
  "$BASE_URL/groups/$GROUP_ID/processes")

# Extract process IDs
PROCESS_IDS=$(echo "$PROCESSES_RESPONSE" | jq -r '.results[].id // empty')

if [ -z "$PROCESS_IDS" ]; then
  echo "No processes found or failed to parse process IDs."
  exit 1
fi

for PROCESS_ID in $PROCESS_IDS; do
  # Log to STDERR so it doesn’t interfere with JSON output on STDOUT
  echo "=== PROCESS: $PROCESS_ID ===" 1>&2

  API_URL="$BASE_URL/groups/$GROUP_ID/processes/$PROCESS_ID/performanceAdvisor/slowQueryLogs"

  RAW_RESPONSE=$(curl --user "$PUBLIC_KEY:$PRIVATE_KEY" \
    --digest \
    --silent \
    --header "Accept: application/vnd.atlas.2025-03-12+json" \
    "$API_URL")

  # Skip if empty response
  if [ -z "$RAW_RESPONSE" ]; then
    echo "No response for $PROCESS_ID" 1>&2
    continue
  fi

  # ✅ Correct: iterate over .slowQueries, not .results
  # This prints one JSON object per line (NDJSON)
  echo "$RAW_RESPONSE" | jq -c '.slowQueries // [] | .[]' 2>/dev/null
done
