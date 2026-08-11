---
name: axiom
description: Query, ingest, and manage data in Axiom (axiom.co), the log/event observability platform, via its REST API and the Axiom Processing Language (APL). Use this skill whenever the user mentions Axiom, axiom.co, APL queries, wants to search or analyze logs/traces/events stored in Axiom, needs to check a dataset for errors or anomalies, wants to ingest data (JSON/NDJSON) into an Axiom dataset, or wants to create/list Axiom datasets — even if they just say things like "check the logs" or "query our observability data" in a context where Axiom is the backing store.
---

# Axiom

Axiom (axiom.co) is a log and event observability platform. Data lives in
**datasets** (append-only, schemaless event streams) and is queried with
**APL**, Axiom's own query language (similar in spirit to KQL). This skill
wraps the Axiom REST API so you can list/create datasets, run APL queries,
and ingest data straight from the shell — no separate MCP server or SDK
required.

## Prerequisites

Every request needs an Axiom API token in the `Authorization: Bearer` header.

1. **`AXIOM_TOKEN`** (required) — an API token from the user's Axiom
   organization (Settings → API tokens). If it's not set in the environment,
   ask the user for it rather than guessing or inventing one; never hardcode
   a token in a command, script, or committed file.
2. **`AXIOM_ORG_ID`** (optional) — only needed for personal tokens that span
   multiple organizations. Set as the `X-Axiom-Org-Id` header when present.
3. **`AXIOM_URL`** (optional) — API base URL, defaults to
   `https://api.axiom.co`. Only override for a self-hosted or EU/region-pinned
   deployment.

Check with:
```bash
[ -n "$AXIOM_TOKEN" ] && echo "AXIOM_TOKEN is set" || echo "AXIOM_TOKEN missing — ask the user for an API token"
```

## Quick start: use the helper script

`scripts/axiom.sh` wraps the four operations below with correct headers and
error handling. Prefer it over hand-rolling curl — it's shorter and one less
place to get the auth headers wrong.

```bash
scripts/axiom.sh list                                          # list datasets
scripts/axiom.sh query '<dataset>' '<dataset> | where severity == "error" | limit 50'
scripts/axiom.sh create my-dataset "optional description"
scripts/axiom.sh ingest my-dataset events.ndjson
```

Run `scripts/axiom.sh` with no arguments for full usage. It requires `curl`
and, for pretty output, `jq` (falls back to raw JSON if `jq` is absent).

## Operations reference

If the helper script doesn't cover a case, these are the raw endpoints.

### List datasets
```bash
curl -s "$AXIOM_URL/v2/datasets" \
  -H "Authorization: Bearer $AXIOM_TOKEN"
```

### Create a dataset
```bash
curl -s -X POST "$AXIOM_URL/v2/datasets" \
  -H "Authorization: Bearer $AXIOM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-dataset", "description": "optional"}'
```

### Run an APL query
The dataset name is referenced *inside* the APL string (`['dataset-name']` or
bare if it has no special characters), not in the URL — one endpoint serves
every dataset. `startTime`/`endTime` are optional ISO-8601 bounds; without
them Axiom applies its own default window, so pass them explicitly for
anything time-sensitive.
```bash
curl -s -X POST "$AXIOM_URL/v1/datasets/_apl?format=tabular" \
  -H "Authorization: Bearer $AXIOM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apl": "[\"my-dataset\"] | where severity == \"error\" | limit 50",
    "startTime": "2026-08-10T00:00:00Z",
    "endTime": "2026-08-11T00:00:00Z"
  }'
```
See `references/apl.md` for APL syntax (operators, time filters, aggregations)
before writing a nontrivial query — it's a different language from SQL/KQL
in its details even though it looks similar.

### Ingest data
Body is a JSON array of events, or NDJSON with `Content-Type: application/x-ndjson`.
```bash
curl -s -X POST "$AXIOM_URL/v1/datasets/my-dataset/ingest" \
  -H "Authorization: Bearer $AXIOM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"_time": "2026-08-11T12:00:00Z", "message": "hello", "severity": "info"}]'
```
Events without an explicit `_time` field are timestamped at ingest time by
Axiom, which is usually fine for live data but wrong for backfills — always
set `_time` explicitly when loading historical data.

## Working with results

`format=tabular` returns `{"tables": [{"fields": [...], "columns": [...]}]}` —
columns are column-major (one array per field, not one object per row).
Pipe through `jq` to reshape into row objects if the user wants readable
output; don't hand them the raw tabular blob.

## When the user wants live tool-calling instead of shell commands

If the user is setting up a persistent integration rather than running a
one-off query (e.g. they want Claude to query Axiom repeatedly as a tool
across a long session, or from Claude Desktop), point them at the official
`axiomhq/mcp-server-axiom` MCP server instead of this skill — it exposes the
same API as proper MCP tools. Setting up an MCP server requires an
interactive `claude mcp add` / `/mcp` step this skill can't perform, so
mention it as an option rather than trying to configure it yourself.
