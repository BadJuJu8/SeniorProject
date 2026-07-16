# rules/sigma/ — portable Sigma detections

Vendor-neutral YAML detection logic. These are the source of truth for the coverage heatmap and
the source of any rule submitted upstream to SigmaHQ. Each rule here has a matching Wazuh XML rule
in `../wazuh/` that actually runs in the SIEM (there is no reliable Sigma->Wazuh converter, so the
mapping is authored by hand — see docs/PLAN.md).

First rule: `kerberoasting.yml` (T1558.003).
