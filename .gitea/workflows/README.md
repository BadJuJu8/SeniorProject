# .gitea/workflows/ — CI pipeline

`detect.yml` — the per-commit pipeline:
lint (sigma check) -> unit test (/logtest) -> fire atomic -> confirm alert (indexer) -> deploy
(Ansible) -> regenerate heatmap (S2AN). Fails the build if a detection does not fire.

Jobs run across two Act runners by label: `linux` (Gitea LXC — validate/deploy/heatmap) and
`windows` (the target host — fires atomics locally). Required Secrets/Variables are documented
in the workflow header.
