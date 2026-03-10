#!/usr/bin/env bash
set -euo pipefail
export TZ=UTC

# Check that all i18n locale files have the same set of keys as en.json (the baseline).
# Requires: python3 (available on macOS/Linux by default)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
I18N_DIR="$SCRIPT_DIR/../src/i18n"
BASELINE="$I18N_DIR/en.json"

if [ ! -f "$BASELINE" ]; then
  echo "ERROR: Baseline file not found: $BASELINE"
  exit 1
fi

extract_keys() {
  python3 -c "
import json, sys

def flatten(obj, prefix=''):
    keys = []
    for k, v in obj.items():
        full = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            keys.extend(flatten(v, full))
        else:
            keys.append(full)
    return sorted(keys)

with open(sys.argv[1]) as f:
    data = json.load(f)
for key in flatten(data):
    print(key)
" "$1"
}

BASELINE_KEYS=$(extract_keys "$BASELINE")
BASELINE_COUNT=$(echo "$BASELINE_KEYS" | wc -l | tr -d ' ')
ERRORS=0

echo "Baseline: en.json ($BASELINE_COUNT keys)"
echo "---"

for file in "$I18N_DIR"/*.json; do
  name=$(basename "$file")
  [ "$name" = "en.json" ] && continue

  LOCALE_KEYS=$(extract_keys "$file")
  LOCALE_COUNT=$(echo "$LOCALE_KEYS" | wc -l | tr -d ' ')

  MISSING=$(comm -23 <(echo "$BASELINE_KEYS") <(echo "$LOCALE_KEYS"))
  EXTRA=$(comm -13 <(echo "$BASELINE_KEYS") <(echo "$LOCALE_KEYS"))

  MISSING_COUNT=0
  EXTRA_COUNT=0
  [ -n "$MISSING" ] && MISSING_COUNT=$(echo "$MISSING" | wc -l | tr -d ' ')
  [ -n "$EXTRA" ] && EXTRA_COUNT=$(echo "$EXTRA" | wc -l | tr -d ' ')

  if [ "$MISSING_COUNT" -gt 0 ] || [ "$EXTRA_COUNT" -gt 0 ]; then
    echo "❌ $name ($LOCALE_COUNT keys)"
    if [ "$MISSING_COUNT" -gt 0 ]; then
      echo "   Missing $MISSING_COUNT key(s):"
      echo "$MISSING" | while read -r k; do echo "     - $k"; done
    fi
    if [ "$EXTRA_COUNT" -gt 0 ]; then
      echo "   Extra $EXTRA_COUNT key(s):"
      echo "$EXTRA" | while read -r k; do echo "     + $k"; done
    fi
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ $name ($LOCALE_COUNT keys)"
  fi
done

echo "---"
if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS locale(s) have mismatched keys"
  exit 1
else
  echo "PASS: All locales match en.json"
  exit 0
fi
