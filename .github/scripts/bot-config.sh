#!/usr/bin/env bash
# ============================================================================
# bot-config.sh — one-time per-run resolution of the bot's IDENTITY and
# TRIGGER configuration. Run early (after bot-setup) in every agent
# workflow; exports to $GITHUB_ENV (unguessable-delimiter free: values are
# single-line). The router runs it vars-only (no token) — detection simply
# stays empty there.
# ============================================================================
# TWO SEPARATE SYSTEMS — do not conflate:
#
#   IDENTITY ("is this content authored by ME?"): loop guards, review
#   attribution, FIRST/FOLLOW-UP markers, footer verification, reaction
#   cleanup. Resolution:
#     identities = vars.BOT_IDENTITIES_JSON (if set/valid JSON array)
#                ∪ BOT_DETECTED_LOGIN     (account mode: /user from
#                                          bot-setup; absent otherwise)
#     fallback ["mirrobot-agent", "mirrobot-agent[bot]"] applies ONLY when
#     both sources are empty. Bare "mirrobot" is NEVER an identity (the
#     username is taken; a spoofed account must never be treated as self).
#
#   TRIGGERS ("what text summons ME?"): routing words. Resolution:
#     stems = vars.BOT_TRIGGERS (comma-separated raw names, if set)
#           else derived from the resolved identity names (strips [bot])
#     fallback "mirrobot, mirrobot-agent" only when nothing above yields.
#     From every stem the router derives: @<stem> (mention), /<stem>-review,
#     /<stem>_review, /<stem>-check, /<stem>_check. A stem is a RAW NAME —
#     no @ or / prefix in the variable (the prefixes are the derivation).
#
# env in : BOT_IDENTITIES_INPUT (vars.BOT_IDENTITIES_JSON passthrough, may be '')
#          BOT_DETECTED_LOGIN   (account-mode /user login, may be unset)
#          BOT_TRIGGERS_INPUT   (vars.BOT_TRIGGERS passthrough, may be '')
# env out: BOT_NAMES_JSON    resolved identity array (legacy-compatible name:
#                            every consumer script already reads this env)
#          BOT_TRIGGER_STEMS comma-separated stems for the router
#          BOT_IDENTITY_NOTE one-line provenance for the run summary
# Exit: 0 (bad variable input degrades loudly to defaults — config mistakes
#       must be visible, not silent).
# ============================================================================
set -u

FALLBACK_IDENTITIES='["mirrobot-agent","mirrobot-agent[bot]"]'
FALLBACK_TRIGGERS="mirrobot,mirrobot-agent"

IN_IDENT="${BOT_IDENTITIES_INPUT:-}"
DETECTED="${BOT_DETECTED_LOGIN:-}"
IN_TRIG="${BOT_TRIGGERS_INPUT:-}"

# ---- identities: variable ∪ detection, fallback only when both empty -----
ident_note="fallback"
IDENT_ITEMS=""
if [ -n "$(printf '%s' "$IN_IDENT" | tr -d '[:space:]')" ]; then
  if jq -e 'type == "array" and all(.[]; type == "string")' <<< "$IN_IDENT" >/dev/null 2>&1; then
    while IFS= read -r item; do IDENT_ITEMS="${IDENT_ITEMS}${item}\n"; done < <(jq -r '.[]' <<< "$IN_IDENT")
    ident_note="variable"
  else
    echo "::warning::bot-config: BOT_IDENTITIES_JSON variable is not a JSON array of strings — ignoring it (fix the variable)."
  fi
fi
if [ -n "$DETECTED" ]; then
  IDENT_ITEMS="${IDENT_ITEMS}${DETECTED}\n"
  ident_note="${ident_note}+detected(${DETECTED})"
fi

if [ -n "$IDENT_ITEMS" ]; then
  # unique + compact single-line JSON (GITHUB_ENV values must be one line)
  BOT_NAMES_JSON=$(printf '%b' "$IDENT_ITEMS" | awk 'NF' | sort -u | jq -R . | jq -sc .)
  identity_sourced=1
else
  BOT_NAMES_JSON="$FALLBACK_IDENTITIES"
  identity_sourced=0
  ident_note="fallback (set BOT_IDENTITIES_JSON to override)"
fi

# ---- triggers: variable > identity-derived > fallback ---------------------
# Stock rule: when identity itself fell back (nothing set anywhere), triggers
# fall back to the mirrobot words — "triggers work as if identity is
# mirrobot". Identity-derived stems apply only when the identity came from
# the variable or account detection (so setting an identity or running
# account mode retires the fallback words, as intended).
trigger_note=""
if [ -n "$(printf '%s' "$IN_TRIG" | tr -d '[:space:],')" ]; then
  BOT_TRIGGER_STEMS=$(printf '%s' "$IN_TRIG" | tr ',' '\n' | awk 'NF' | paste -sd, -)
  trigger_note="variable"
else
  # strip a trailing "[bot]" — a stem must be a typeable name (GitHub app
  # logins cannot be @-mentioned as text).
  stems=$(printf '%s' "$BOT_NAMES_JSON" | jq -r '.[]' | sed 's/\[bot\]$//' | awk 'NF' | sort -u | paste -sd, -)
  if [ "$identity_sourced" = 1 ]; then
    BOT_TRIGGER_STEMS="${stems:-$FALLBACK_TRIGGERS}"
    trigger_note="derived-from-identity"
  else
    BOT_TRIGGER_STEMS="$FALLBACK_TRIGGERS"
    trigger_note="fallback"
  fi
fi

# ---- export ----------------------------------------------------------------
if [ "${1:-}" = "--export" ]; then
  # Same-step consumption (eval "$(bot-config.sh --export)"): print
  # shell-evaluable exports instead of touching GITHUB_ENV.
  printf 'export BOT_NAMES_JSON=%q\n' "$BOT_NAMES_JSON"
  printf 'export BOT_TRIGGER_STEMS=%q\n' "$BOT_TRIGGER_STEMS"
else
  {
    printf 'BOT_NAMES_JSON=%s\n' "$BOT_NAMES_JSON"
    printf 'BOT_TRIGGER_STEMS=%s\n' "$BOT_TRIGGER_STEMS"
  } >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
fi
echo "bot-config: identities [$ident_note] = $BOT_NAMES_JSON"
echo "bot-config: trigger stems [$trigger_note] = $BOT_TRIGGER_STEMS"
