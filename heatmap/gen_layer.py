#!/usr/bin/env python3
"""Generate a MITRE ATT&CK Navigator layer from the Sigma rule set.

A self-contained fallback for S2AN (no .NET / no network needed): it reads every
`attack.tNNNN[.NNN]` tag across rules/sigma/*.yml and emits a Navigator v4.5 layer
that lights up each covered technique. Open the result at
https://mitre-attack.github.io/attack-navigator/ (Open Existing Layer -> Upload).

    python heatmap/gen_layer.py [SIGMA_DIR] [OUTPUT_JSON]
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
DEFAULT_SIGMA_DIR = HERE.parent / "rules" / "sigma"
DEFAULT_OUT = HERE / "navigator_layer.json"

# attack.t1558.003  ->  T1558.003 ;  attack.t1550  ->  T1550
TECH_RE = re.compile(r"^attack\.(t\d{4}(?:\.\d{3})?)$", re.IGNORECASE)


def collect(sigma_dir: Path) -> dict[str, list[str]]:
    """Map each ATT&CK technique id -> list of source rule filenames."""
    coverage: dict[str, list[str]] = defaultdict(list)
    for path in sorted(sigma_dir.glob("*.yml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        for tag in doc.get("tags", []) or []:
            m = TECH_RE.match(str(tag))
            if m:
                coverage[m.group(1).upper()].append(path.name)
    return coverage


def build_layer(coverage: dict[str, list[str]]) -> dict:
    techniques = [
        {
            "techniqueID": tech,
            "score": 100,
            "color": "",
            "comment": ", ".join(sorted(set(files))),
            "enabled": True,
            "metadata": [],
            "showSubtechniques": True,
        }
        for tech, files in sorted(coverage.items())
    ]
    return {
        "name": "Detection-as-Code Coverage",
        "versions": {"attack": "15", "navigator": "4.9.1", "layer": "4.5"},
        "domain": "enterprise-attack",
        "description": (
            "Techniques covered by CI-verified detections in this repo. "
            "Generated from rules/sigma/ — see traceability.md."
        ),
        "techniques": techniques,
        "gradient": {
            "colors": ["#ffffff", "#66b1ff", "#1f6fe0"],
            "minValue": 0,
            "maxValue": 100,
        },
        "legendItems": [{"label": "CI-verified detection", "color": "#1f6fe0"}],
        "sorting": 0,
        "hideDisabled": False,
    }


def main(argv: list[str]) -> int:
    sigma_dir = Path(argv[1]) if len(argv) > 1 else DEFAULT_SIGMA_DIR
    out = Path(argv[2]) if len(argv) > 2 else DEFAULT_OUT
    coverage = collect(sigma_dir)
    if not coverage:
        print(f"No ATT&CK-tagged Sigma rules found under {sigma_dir}", file=sys.stderr)
        return 1
    layer = build_layer(coverage)
    out.write_text(json.dumps(layer, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} covering {len(coverage)} technique(s): "
          f"{', '.join(sorted(coverage))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
