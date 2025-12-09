#!/bin/bash

# === ARGUMENTS ===
PROJECT_ID="$1"        # Required
CLUSTER_NAME="$2"      # Optional

# === VALIDATION ===
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID is required."
  echo "Usage: ./get_events.sh <PROJECT_ID> [CLUSTER_NAME]"
  exit 1
fi

# === CONFIG (STATIC CREDENTIALS) ===
PUBLIC_KEY=""
PRIVATE_KEY=""

# === OUTPUT CLUSTER NAME ===
OUTPUT_CLUSTER_NAME="${CLUSTER_NAME:-all-clusters}"

# === TIMESTAMP ===
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# === OUTPUT FILE ===
OUTPUT_FILE="events_${PROJECT_ID}_${OUTPUT_CLUSTER_NAME}_${TIMESTAMP}.json"

# === BASE URL ===
BASE_URL="https://cloud.mongodb.com/api/atlas/v2/groups/${PROJECT_ID}/events"

# === BUILD QUERY STRING ===
QUERY="pretty=true"

if [[ -n "$CLUSTER_NAME" ]]; then
  QUERY="${QUERY}&clusterNames=${CLUSTER_NAME}"
fi

# === API CALL ===
curl --user "${PUBLIC_KEY}:${PRIVATE_KEY}" \
  --digest --silent \
  --header "Accept: application/vnd.atlas.2025-03-12+json" \
  -X GET "${BASE_URL}?${QUERY}" \
  > "${OUTPUT_FILE}"

echo "Events saved to: ${OUTPUT_FILE}"

