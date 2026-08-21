# ci/ — pipeline scripts

Shared:
- `config.py`        — env-driven config (loads a gitignored `.env`); repo paths; manifest loader.
- `wazuh_client.py`  — thin clients: manager JWT + `/logtest`, indexer basic-auth + `_search`.
- `requirements.txt` — `requests`, `PyYAML`, `pytest`.

Pipeline stages:
- `logtest_unit.py`  — UNIT TEST: POST each manifest sample to the manager `/logtest` API
                       (55000) and assert the expected `rule.id` matched. No attack; lab may be down.
- `fire_atomic.ps1`  — fire the Atomic Red Team technique on the Windows target's runner and
                       print the UTC start time for the integration query.
- `confirm_alert.py` — INTEGRATION TEST: poll the indexer `_search` (9200) for the expected
                       `rule.mitre.id` within the attack window; non-zero exit fails the build.

Offline:
- `test_offline.py`  — pytest that runs anywhere with the lab down: validates the Sigma YAML,
                       the Wazuh XML, and (by re-implementing Wazuh's field/negate match in
                       Python) proves every rule fires on its sample and that the reductions
                       suppress benign look-alikes. `pytest ci/test_offline.py -v`.
