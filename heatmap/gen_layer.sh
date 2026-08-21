#!/usr/bin/env bash
# Regenerate the ATT&CK Navigator coverage layer from rules/sigma/.
#
# Prefers S2AN (3CORESec's Sigma-to-Navigator binary, the tool chosen in the plan)
# when it is on PATH; otherwise falls back to the bundled pure-Python generator,
# which needs nothing but PyYAML. The Python path is what CI relies on so the build
# never depends on a .NET runtime being present.
#
# NOTE: confirm the S2AN flags against your installed version — the CLI has changed
# across releases. The Python fallback below is the source of truth for CI.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGMA_DIR="$HERE/../rules/sigma"
OUT="$HERE/navigator_layer.json"

if command -v s2an >/dev/null 2>&1; then
  echo "Using S2AN..."
  s2an -d "$SIGMA_DIR" -o "$OUT"
else
  echo "S2AN not found on PATH; using the bundled Python generator."
  python3 "$HERE/gen_layer.py" "$SIGMA_DIR" "$OUT"
fi

echo "ATT&CK Navigator layer written to $OUT"
