#!/usr/bin/env bash
# harvest-excerpts.sh — build docs/excerpts.json (the landing page's auto-card pool)
#
# Finds posts authored by the deployment's bot identities across the home
# repos (issue comments, PR comments, PR review summaries), drops hidden
# (minimized) content, applies a quality gate, and writes a capped,
# newest-first JSON pool the page deals random cards from.
#
# Contract:
#   env in : EXCERPT_REPOS  space-separated "owner/name" list (default: this
#                             deployment's home repos)
#            EXCERPT_BOTS   comma-separated bot logins, account AND app forms
#            EXCERPT_MAX    pool cap (default 80)
#            EXCERPT_MIN    display-text clip length (default 420)
#            EXCERPT_OUT    output path (default docs/excerpts.json)
#   needs  : gh (authenticated; search + GraphQL + REST), jq
#   out    : EXCERPT_OUT = {"generated": iso, "items": [{k,t,ti,r,n,u,w}...]}
#            k = comment|review, t = clipped text, ti = thread title,
#            r = repo, n = number, u = source url, w = authored-at iso
#   exit   : 0 = pool written (possibly unchanged), 1 = config/tooling failure
#   notes  : authenticated gh only — never run against untrusted input; the
#            script is repo-local tooling for the informational page, not part
#            of the agent's trust boundary.
set -euo pipefail

EXCERPT_REPOS="${EXCERPT_REPOS:-Mirrowel/Mirrobot-agent Mirrowel/LLM-API-Key-Proxy}"
EXCERPT_BOTS="${EXCERPT_BOTS:-Mirrobot-Agent,mirrobot-agent[bot]}"
EXCERPT_MAX="${EXCERPT_MAX:-80}"
EXCERPT_MIN_CLIP="${EXCERPT_MIN:-420}"
EXCERPT_OUT="${EXCERPT_OUT:-docs/excerpts.json}"

command -v gh >/dev/null 2>&1 || { echo "harvest: gh not found" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "harvest: jq not found" >&2; exit 1; }

# lowercase bot set for matching (GitHub logins are case-insensitive)
BOTS_LOWER=$(printf '%s' "$EXCERPT_BOTS" | tr ',' '\n' | tr -d ' "' | awk 'NF{print tolower($0)}' | paste -sd, -)
[ -n "$BOTS_LOWER" ] || { echo "harvest: no bot identities configured" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
CANDS="$WORK/candidates.tsv"   # repo|number|isPR|title
RAW="$WORK/raw.jsonl"          # one JSON object per harvested post
: > "$CANDS"; : > "$RAW"

# ---- 1. candidate threads: search per repo x bot (commenter + reviewed-by) ----
search_candidates() { # $1 = repo, $2 = qualifier
  gh api -X GET search/issues --paginate \
    -f q="repo:$1 $2" -f sort=created -f order=desc -f per_page=30 \
    --jq ".items[] | [\"$1\", .number, (if has(\"pull_request\") then \"pr\" else \"issue\" end), (.title // \"\")] | @tsv" 2>/dev/null || true
}

for REPO in $EXCERPT_REPOS; do
  for BOT in $(printf '%s' "$EXCERPT_BOTS" | tr ',' ' '); do
    search_candidates "$REPO" "commenter:$BOT" >> "$CANDS"
    search_candidates "$REPO" "reviewed-by:$BOT" >> "$CANDS"
  done
done
sort -u -t$'\t' -k1,2 "$CANDS" -o "$CANDS"
TOTAL_CAND=$(wc -l < "$CANDS")
echo "harvest: $TOTAL_CAND candidate thread(s) across $EXCERPT_REPOS"

# ---- 2. per-thread GraphQL: bot-authored, non-minimized posts ----
fetch_thread() { # $1 = repo, $2 = number, $3 = issue|pr
  local OWNER NAME Q
  OWNER=${1%%/*}; NAME=${1##*/}
  if [ "$3" = "pr" ]; then
    Q='query($o:String!,$n:String!,$num:Int!){
      repository(owner:$o,name:$n){ pullRequest(number:$num){
        title
        comments(first:50){
          nodes{ author{login} isMinimized body url createdAt } }
        reviews(first:25){
          nodes{ author{login} body url state submittedAt } } } } }'
  else
    Q='query($o:String!,$n:String!,$num:Int!){
      repository(owner:$o,name:$n){ issue(number:$num){
        title
        comments(first:50){
          nodes{ author{login} isMinimized body url createdAt } } } } }'
  fi
  gh api graphql -f query="$Q" -f o="$OWNER" -f n="$NAME" -F num="$2" --jq "
    .data.repository.pullRequest // .data.repository.issue // empty |
    .title as \$ti |
    ( (.comments.nodes // [])
      | map(select(.isMinimized != true)
        | select(((.author.login // \"\") | ascii_downcase) as \$a | (\"$BOTS_LOWER\" | split(\",\") | index(\$a)))
        | {k:\"comment\", t:(.body // \"\"), ti:\$ti, w:(.createdAt // \"\"), u:(.url // \"\")}) )
    + ( if .reviews then (.reviews.nodes // [])
        | map(select(((.author.login // \"\") | ascii_downcase) as \$a | (\"$BOTS_LOWER\" | split(\",\") | index(\$a)))
          | select((.body // \"\") | length > 0)
          | {k:\"review\", t:(.body // \"\"), ti:\$ti, w:(.submittedAt // \"\"), u:(.url // \"\")})
        else [] end)" 2>/dev/null || true
}

while IFS=$'\t' read -r REPO NUM KIND TITLE; do
  [ -n "${REPO:-}" ] || continue
  TITLE=${TITLE%$'\r'}
  fetch_thread "$REPO" "$NUM" "$KIND" \
    | jq -c --arg r "$REPO" --argjson n "$NUM" '.[] | .r=$r | .n=$n' >> "$RAW" || true
done < "$CANDS"
TOTAL_RAW=$(wc -l < "$RAW")
echo "harvest: $TOTAL_RAW bot-authored post(s) collected"

# ---- 3. quality gate + clip + dedupe + cap ----
# comment gate: 150..900 chars, prose-dominant (backtick fraction < .15),
#               and not a conversational ack (old-era "Thanks for the great
#               report" openers — the voice the platform moved away from)
# review gate:  80..2400 chars, backtick fraction < .35 (reviews carry code spans)
# both: strip AI-footer lines, skip pure-code or empty results, clip display text
jq -s --argjson clip "$EXCERPT_MIN_CLIP" --argjson max "$EXCERPT_MAX" '
  map(
    (.t // "") as $body0
    | ($body0 | split("\n") | map(select((ascii_downcase | test("generated by an ai")) | not)) | join("\n") | sub("^\\s+|\\s+$";"")) as $body
    | .t = $body
    | select($body | length >= 80)
    | select(([$body | scan("`")] | length) as $bt
      | if .k == "review"
        then ($body | length <= 2400) and (($bt * 3) < ($body | length))
        else ($body | length >= 150) and ($body | length <= 900) and (($bt * 7) < ($body | length))
          and (($body | test("^@\\S+ +(thanks|on it|hi |hello|acknowledg)";"i")) | not) end)
    | .t = (if ($body | length) > $clip
      then (($body[0:$clip] | sub("\\s+\\S*$";"")) + "…") else $body end)
    | select((.u | length) > 0)
  )
  | unique_by(.u)
  | sort_by(.w) | reverse
  | .[0:$max]
  | {generated: (now | todateiso8601), items: .}
' "$RAW" > "$EXCERPT_OUT"

POOL=$(jq '.items | length' "$EXCERPT_OUT")
echo "harvest: pool = $POOL item(s) -> $EXCERPT_OUT"
