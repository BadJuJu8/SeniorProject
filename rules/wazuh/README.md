# rules/wazuh/ — Wazuh manager XML rules

`local_rules.xml` — the detections that actually run in the Wazuh manager (analysisd), evaluated
in real time against incoming events. Deployed to `/var/ossec/etc/rules/local_rules.xml` by the
Ansible playbook in `../../ansible/`. Each rule is unit-tested via the manager `/logtest` API.
