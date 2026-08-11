#!/usr/bin/env bash
# Thin wrapper around the Axiom REST API for the axiom skill.
# Usage:
#   axiom.sh list
#   axiom.sh query <dataset> <apl-query> [startTime] [endTime]
#   axiom.sh create <dataset> [description]
#   axiom.sh ingest <dataset> <file-path|->
set -euo pipefail

AXIOM_URL="${AXIOM_URL:-https://api.axiom.co}"

usage() {
  cat <<'EOF'
Usage:
  axiom.sh list
  axiom.sh query <dataset> <apl-query> [startTime] [endTime]
  axiom.sh create <dataset> [description]
  axiom.sh ingest <dataset> <file-path|->

Env vars:
  AXIOM_TOKEN   required, Bearer API token
  AXIOM_ORG_ID  optional, sent as X-Axiom-Org-Id
  AXIOM_URL     optional, defaults to https://api.axiom.co
EOF
}

require_token() {
  if [ -z "${AXIOM_TOKEN:-}" ]; then
    echo "error: AXIOM_TOKEN is not set" >&2
    exit 1
  fi
}

curl_json() {
  local args=(-sS -H "Authorization: Bearer $AXIOM_TOKEN")
  if [ -n "${AXIOM_ORG_ID:-}" ]; then
    args+=(-H "X-Axiom-Org-Id: $AXIOM_ORG_ID")
  fi
  curl "${args[@]}" "$@"
}

pretty() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

cmd="${1:-}"
case "$cmd" in
  list)
    require_token
    curl_json "$AXIOM_URL/v2/datasets" | pretty
    ;;

  create)
    require_token
    dataset="${2:-}"; description="${3:-}"
    [ -n "$dataset" ] || { echo "error: dataset name required" >&2; usage; exit 1; }
    payload="$(printf '{"name": %s, "description": %s}' \
      "$(jq -Rn --arg v "$dataset" '$v' 2>/dev/null || printf '"%s"' "$dataset")" \
      "$(jq -Rn --arg v "$description" '$v' 2>/dev/null || printf '"%s"' "$description")")"
    curl_json -X POST "$AXIOM_URL/v2/datasets" \
      -H "Content-Type: application/json" \
      -d "$payload" | pretty
    ;;

  query)
    require_token
    dataset="${2:-}"; apl="${3:-}"; start_time="${4:-}"; end_time="${5:-}"
    [ -n "$dataset" ] && [ -n "$apl" ] || { echo "error: dataset and apl query required" >&2; usage; exit 1; }
    if command -v jq >/dev/null 2>&1; then
      payload="$(jq -n --arg apl "$apl" --arg s "$start_time" --arg e "$end_time" \
        '{apl: $apl} + (if $s != "" then {startTime: $s} else {} end) + (if $e != "" then {endTime: $e} else {} end)')"
    else
      payload="{\"apl\": \"$(printf '%s' "$apl" | sed 's/"/\\"/g')\"}"
    fi
    curl_json -X POST "$AXIOM_URL/v1/datasets/_apl?format=tabular" \
      -H "Content-Type: application/json" \
      -d "$payload" | pretty
    ;;

  ingest)
    require_token
    dataset="${2:-}"; file="${3:-}"
    [ -n "$dataset" ] && [ -n "$file" ] || { echo "error: dataset and file (or -) required" >&2; usage; exit 1; }
    if [ "$file" = "-" ]; then
      curl_json -X POST "$AXIOM_URL/v1/datasets/$dataset/ingest" \
        -H "Content-Type: application/json" \
        --data-binary @- | pretty
    else
      curl_json -X POST "$AXIOM_URL/v1/datasets/$dataset/ingest" \
        -H "Content-Type: application/json" \
        --data-binary @"$file" | pretty
    fi
    ;;

  *)
    usage
    exit 1
    ;;
esac
