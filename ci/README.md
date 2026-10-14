# ci/ — pipeline scripts

Shared:
- `config.py`        — env-driven config (loads a gitignored `.env`); repo paths; manifest loader.
- `wazuh_client.py`  — thin clients: manager JWT + `/rules` + `/logtest`, indexer basic-auth + `_search`.
- `requirements.txt` — `requests`, `PyYAML`, `pytest`.

Pipeline stages:
- `rule_loaded.py`   — PRE-FLIGHT (in CI): ask the manager `/rules` API (55000) that each
                       manifest `rule.id` is loaded. No attack fired.
- `logtest_unit.py`  — POST each manifest sample to `/logtest` and assert the expected `rule.id`.
                       **Not in CI:** `/logtest` decodes a pasted Windows event with the generic
                       `json` decoder, never `windows_eventchannel`, so Windows rules chained on
                       `if_group windows_security` can't match (see LAB_JOURNAL 2026-10-14).
- `fire_atomic.ps1`  — fire the Atomic Red Team technique on the Windows target's runner and
                       print the UTC start time for the integration query.
- `confirm_alert.py` — INTEGRATION TEST: poll the indexer `_search` (9200) for the expected
                       `rule.mitre.id` within the attack window; non-zero exit fails the build.

Offline:
- `test_offline.py`  — pytest that runs anywhere with the lab down: validates the Sigma YAML,
                       the Wazuh XML, and (by re-implementing Wazuh's field/negate match in
                       Python) proves every rule fires on its sample and that the reductions
                       suppress benign look-alikes. `pytest ci/test_offline.py -v`.
