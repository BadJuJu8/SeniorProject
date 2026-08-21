# heatmap/ — MITRE ATT&CK coverage

`gen_layer.sh` — emits `navigator_layer.json`, an ATT&CK Navigator layer showing which
techniques the rule set covers. Prefers S2AN when on PATH; otherwise runs the bundled
`gen_layer.py` (pure Python, needs only PyYAML) — which is what CI relies on so the build
never depends on a .NET runtime. Open the layer at
https://mitre-attack.github.io/attack-navigator/ (Open Existing Layer -> Upload).
The generated JSON is gitignored; regenerate it in CI.
