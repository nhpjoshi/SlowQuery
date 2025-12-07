#!/bin/bash

# --- MongoDB Atlas Credentials ---
PUBLIC_KEY=""
PRIVATE_KEY=""
GROUP_ID="${GROUP_ID:?GROUP_ID environment variable not set}"

BASE_URL="https://cloud.mongodb.com/api/atlas/v2"
MODE="${MODE:?MODE environment variable not set}"

SINCE_MS="${SINCE_MS:-}"   # 👈 optional, passed from Node

CURL_COMMON=(
  --user "$PUBLIC_KEY:$PRIVATE_KEY"
  --digest
  --silent
  --header "Accept: application/vnd.atlas.2025-03-12+json"
)

if [ "$MODE" = "LIST_PROCESSES" ]; then
  echo "Fetching processes for group: $GROUP_ID ..." 1>&2

  PROCESSES_RESPONSE=$(curl "${CURL_COMMON[@]}" \
    "$BASE_URL/groups/$GROUP_ID/processes")

  # id, typeName, userAlias, clusterName (substring before -shard-)
  echo "$PROCESSES_RESPONSE" | jq -c '
    .results // [] 
    | .[] 
    | {
        id,
        typeName,
        userAlias,
        clusterName: (
          if (.userAlias | contains("-shard-")) 
          then .userAlias | split("-shard-")[0]
          else .userAlias | split("-")[0]
          end
        )
      }
  '

elif [ "$MODE" = "FETCH_SLOW" ]; then
  PROCESS_ID="${PROCESS_ID:?PROCESS_ID environment variable not set}"

  echo "Fetching slow queries for process: $PROCESS_ID" 1>&2

  API_URL="$BASE_URL/groups/$GROUP_ID/processes/$PROCESS_ID/performanceAdvisor/slowQueryLogs"

  # 👇 If SINCE_MS is set, add it as ?since=<ms>
  if [ -n "$SINCE_MS" ]; then
    API_URL="$API_URL?since=$SINCE_MS"
  fi

  RAW_RESPONSE=$(curl "${CURL_COMMON[@]}" "$API_URL")

  # one JSON slowQuery per line (NDJSON)
  echo "$RAW_RESPONSE" | jq -c '.slowQueries // [] | .[]' 2>/dev/null

else
  echo "Unknown MODE: $MODE" 1>&2
  exit 1
fi
