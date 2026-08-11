# APL (Axiom Processing Language) reference

APL is a pipe-based query language: start from a dataset, then chain
`| operator` stages left to right, same mental model as KQL/Splunk SPL.
Each stage receives the output of the previous one.

```
['my-dataset']
| where severity == "error"
| summarize count() by bin(_time, 1h)
| sort by _time asc
```

Dataset names with hyphens, spaces, or other special characters need the
bracket-quote form `['dataset-name']`; simple alphanumeric names can be
written bare.

## Core operators

| Operator | Purpose | Example |
|---|---|---|
| `where` | Filter rows | `where status_code >= 500` |
| `extend` | Add/derive a column | `extend duration_ms = duration * 1000` |
| `project` | Select/rename columns (drops the rest) | `project _time, message, severity` |
| `project-away` | Drop specific columns, keep the rest | `project-away raw_payload` |
| `summarize` | Aggregate, optionally grouped by `by` | `summarize count() by severity` |
| `sort by` / `order by` | Sort rows | `sort by _time desc` |
| `top` | Top N by a column | `top 10 by count_ desc` |
| `limit` / `take` | Cap row count | `limit 100` |
| `join` | Combine with another dataset | `join kind=inner (['other-dataset']) on request_id` |
| `parse` | Extract fields from a string column | `parse message with "user=" user " action=" action` |

## Time filtering

Prefer the `startTime`/`endTime` request parameters over a `where _time ...`
clause — they let Axiom use time-based indexes instead of scanning. Use
`where` for relative filters that aren't natural request-level bounds
(comparing two time columns, etc).

`bin(_time, <interval>)` buckets timestamps for time-series aggregation:
```
| summarize count() by bin(_time, 5m)
```
Valid interval units: `s`, `m`, `h`, `d`.

## Aggregation functions (used inside `summarize`)

`count()`, `sum(col)`, `avg(col)`, `min(col)`, `max(col)`, `dcount(col)`
(distinct count), `percentile(col, 95)`, `stdev(col)`.

```
| summarize p95_latency = percentile(duration_ms, 95), requests = count() by bin(_time, 1h), route
```

## String matching

- `==`, `!=` — exact match
- `contains`, `!contains` — substring, case-insensitive
- `startswith`, `endswith`
- `matches regex` — regex match

```
| where message contains "timeout" and severity in ("error", "fatal")
```

## Common gotchas

- APL is case-sensitive for column names and operators, but string
  comparisons via `contains`/`==` on strings are case-insensitive by default —
  use `=~`/`has_cs`-style case-sensitive variants only if the user explicitly
  needs case-sensitive matching (check current Axiom docs for the exact
  operator name if this comes up, since APL's casing operators have shifted
  between versions).
- `summarize ... by` drops any column not in the `by` list or the aggregation
  — chain a `project` afterward if the user wants to keep extra columns.
- Field names starting with `_` (like `_time`, `_sysTime`) are Axiom-reserved
  metadata columns, not something you're expected to set in `project`.
