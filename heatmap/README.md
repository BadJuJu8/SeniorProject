# heatmap/ — MITRE ATT&CK coverage

`gen_layer.sh` — runs S2AN over `rules/sigma/` to emit `navigator_layer.json`, an ATT&CK Navigator
layer showing which techniques the rule set covers. Open the layer at
https://mitre-attack.github.io/attack-navigator/ (Open Existing Layer -> Upload).
The generated JSON is gitignored; regenerate it in CI.
