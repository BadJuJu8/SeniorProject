# .gitea/workflows/ — CI pipeline

`detect.yml` (to be added) — the per-commit pipeline:
lint (sigma check) -> unit test (/logtest) -> fire atomic -> confirm alert (indexer) -> deploy
(Ansible) -> regenerate heatmap (S2AN). Fails the build if a detection does not fire.
