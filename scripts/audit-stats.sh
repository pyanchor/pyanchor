#!/usr/bin/env bash
#
# audit-stats.sh — quick adoption-window metrics from audit.jsonl.
#
# Reads a pyanchor audit log (PYANCHOR_AUDIT_LOG_FILE or first arg)
# and prints a one-screen summary: total edits, success rate, p50/p99
# duration, agent breakdown, top actors, recent error reasons.
#
# Used to populate the 1.0 launch narrative ("X edits over Y days,
# Z% success rate, p99 latency Wms"). Also useful any time during
# the studio adoption window to sanity-check that the pipeline is
# producing the data we expect.
#
# Dependencies: bash, jq, awk, sort. No npm install required.
#
# Usage:
#   ./scripts/audit-stats.sh                    # uses default path
#   ./scripts/audit-stats.sh /path/to/audit.jsonl
#   PYANCHOR_AUDIT_LOG_FILE=... ./scripts/audit-stats.sh
#   ./scripts/audit-stats.sh --since 2026-04-20 --until 2026-05-20

set -euo pipefail

AUDIT_FILE="${PYANCHOR_AUDIT_LOG_FILE:-${HOME}/.pyanchor/audit.jsonl}"
SINCE=""
UNTIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)
      SINCE="$2"; shift 2 ;;
    --until)
      UNTIL="$2"; shift 2 ;;
    --help|-h)
      cat <<'EOF'
audit-stats.sh — adoption-window metrics from audit.jsonl

Usage:
  ./scripts/audit-stats.sh [path] [--since <ISO>] [--until <ISO>]

Inputs:
  path              Path to audit.jsonl. If omitted, uses
                    PYANCHOR_AUDIT_LOG_FILE env or ~/.pyanchor/audit.jsonl
  --since <ISO>     Only count events at or after this timestamp
  --until <ISO>     Only count events before this timestamp
  --help, -h        This message

Output sections:
  1. window         — log path, time range, total events
  2. outcome split  — success / failed / canceled (counts + rate)
  3. duration       — p50 / p90 / p99 in ms (success only)
  4. mode + output  — edit/chat × apply/pr/dryrun breakdown
  5. agent          — adapter usage breakdown
  6. top actors     — top 10 actors by edit count
  7. error reasons  — top 5 distinct error messages (truncated)

Requires: jq, awk, sort, bash 4+.
EOF
      exit 0 ;;
    --*)
      echo "audit-stats.sh: unknown option: $1" >&2; exit 2 ;;
    *)
      AUDIT_FILE="$1"; shift ;;
  esac
done

if [[ ! -f "$AUDIT_FILE" ]]; then
  echo "audit-stats.sh: audit log not found at $AUDIT_FILE" >&2
  echo "  Set PYANCHOR_AUDIT_LOG=true on the sidecar (or pass a path)." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "audit-stats.sh: jq not found on PATH (apt install jq / brew install jq)" >&2
  exit 1
fi

# Build a jq filter that respects --since/--until. Read as raw lines
# (`-R`) and decode with `fromjson?` so a partial/corrupt JSONL line
# is silently skipped instead of aborting the whole stats run.
# Matches the malformed-line tolerance in `pyanchor logs` — operators
# shouldn't lose visibility because the sidecar crashed mid-write
# on one event.
FILTER='fromjson?'
if [[ -n "$SINCE" ]]; then
  FILTER="${FILTER} | select(.ts >= \"$SINCE\")"
fi
if [[ -n "$UNTIL" ]]; then
  FILTER="${FILTER} | select(.ts < \"$UNTIL\")"
fi

# 1. Filter once to a tmp file so subsequent passes don't re-parse.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
jq -Rrc "$FILTER" "$AUDIT_FILE" > "$TMP"

TOTAL=$(wc -l < "$TMP" | tr -d ' ')
if [[ "$TOTAL" -eq 0 ]]; then
  echo "audit-stats.sh: no events in window."
  exit 0
fi

FIRST_TS=$(head -1 "$TMP" | jq -r '.ts')
LAST_TS=$(tail -1 "$TMP" | jq -r '.ts')

echo "─── window ────────────────────────────────────────────"
echo "  file:    $AUDIT_FILE"
echo "  events:  $TOTAL"
echo "  first:   $FIRST_TS"
echo "  last:    $LAST_TS"
[[ -n "$SINCE" ]] && echo "  since:   $SINCE"
[[ -n "$UNTIL" ]] && echo "  until:   $UNTIL"
echo ""

echo "─── outcome split ─────────────────────────────────────"
jq -r '.outcome' "$TMP" | sort | uniq -c | sort -rn | awk -v t="$TOTAL" '{
  pct = ($1 / t) * 100
  printf "  %-10s %6d  %5.1f%%\n", $2, $1, pct
}'
echo ""

echo "─── duration (success only, ms) ───────────────────────"
DURATIONS=$(jq -r 'select(.outcome == "success") | .duration_ms' "$TMP" | sort -n)
SUCCESS_COUNT=$(echo "$DURATIONS" | grep -c '^[0-9]' || true)
if [[ "$SUCCESS_COUNT" -gt 0 ]]; then
  # Nearest-rank percentile (NIST C=1 / Excel's PERCENTILE.EXC variant
  # — index = ceil(N * p)). Pre-v0.31.1 the formula was
  # `int(N*p)+1` which rounded UP one rank too far on every query
  # (e.g. N=10 → p50=6th instead of 5th, N=100 → p99=100th instead
  # of 99th). The clamp handles N=1 + boundary cases.
  pct() {
    awk -v n="$SUCCESS_COUNT" -v p="$1" '
      BEGIN {
        idx = int(n * p)
        if (idx < n * p) idx++
        if (idx < 1) idx = 1
        if (idx > n) idx = n
      }
      NR == idx { print; exit }
    '
  }
  P50=$(echo "$DURATIONS" | pct 0.5)
  P90=$(echo "$DURATIONS" | pct 0.9)
  P99=$(echo "$DURATIONS" | pct 0.99)
  MAX=$(echo "$DURATIONS" | tail -1)
  printf "  p50:     %s ms\n" "${P50:-?}"
  printf "  p90:     %s ms\n" "${P90:-?}"
  printf "  p99:     %s ms\n" "${P99:-?}"
  printf "  max:     %s ms\n" "${MAX:-?}"
else
  echo "  (no successful events)"
fi
echo ""

echo "─── mode × output_mode ────────────────────────────────"
jq -r '"\(.mode)/\(.output_mode)"' "$TMP" | sort | uniq -c | sort -rn | awk '{
  printf "  %-12s %6d\n", $2, $1
}'
echo ""

echo "─── agent ─────────────────────────────────────────────"
jq -r '.agent' "$TMP" | sort | uniq -c | sort -rn | awk '{
  printf "  %-15s %6d\n", $2, $1
}'
echo ""

echo "─── top 10 actors ─────────────────────────────────────"
HAS_ACTOR=$(jq -r '.actor // empty' "$TMP" | wc -l | tr -d ' ')
if [[ "$HAS_ACTOR" -gt 0 ]]; then
  jq -r '.actor // empty' "$TMP" | sort | uniq -c | sort -rn | head -10 | awk '{
    sub(/^[ \t]+/, "")
    n = $1; $1 = ""; sub(/^[ \t]+/, "")
    printf "  %-30s %6d\n", $0, n
  }'
else
  echo "  (no actor field set on any event — set X-Pyanchor-Actor on /api/edit calls)"
fi
echo ""

echo "─── top 5 error reasons (failed/canceled) ────────────"
HAS_ERR=$(jq -r 'select(.error != null) | .error' "$TMP" | wc -l | tr -d ' ')
if [[ "$HAS_ERR" -gt 0 ]]; then
  jq -r 'select(.error != null) | .error[0:80]' "$TMP" | sort | uniq -c | sort -rn | head -5 | awk '{
    n = $1; $1 = ""; sub(/^[ \t]+/, "")
    printf "  %6d  %s\n", n, $0
  }'
else
  echo "  (no errors recorded — clean window)"
fi
echo ""

# Bottom-line summary line — useful for piping to a status badge.
SUCCESS=$(jq -r 'select(.outcome == "success")' "$TMP" | wc -l | tr -d ' ')
RATE=$(awk -v s="$SUCCESS" -v t="$TOTAL" 'BEGIN { printf "%.1f", (s/t)*100 }')
echo "summary: $TOTAL events, $RATE% success ($FIRST_TS → $LAST_TS)"
