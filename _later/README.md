# _later/ — parked scaffolding

Pre-generated scaffolding that hasn't been worked through yet, parked here so the
live repo only contains what's been built and verified (Kerberoasting end to end).
Nothing here is deleted. When you take a piece on, `git mv` it back to its
original path (same path minus the `_later/` prefix).

| Parked | Bring back when |
|---|---|
| `rules/sigma/`, `tests/samples/`, `writeups/` (AS-REP, DCSync, PtH) | starting that technique. Also restore its case from `tests/samples/manifest.parked.json` and its negative test from `ci/parked_negative_tests.py` |
| `heatmap/` | building the ATT&CK heatmap. Also uncomment the `heatmap` job in `.gitea/workflows/detect.yml` |
| `reference/` | comparing against the original reference Kerberoasting rule |
| `docs/PLAN.md`, `docs/RUNBOOK.md`, `traceability.md` | needed for planning or the write-up |

Note: the AS-REP / DCSync / PtH Wazuh rules (100210–100231) are still in
`rules/wazuh/local_rules.xml`. They weren't split out, so the deployed ruleset is unchanged.
