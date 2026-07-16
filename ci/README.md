# ci/ — pipeline scripts

- `logtest_unit.py`   — UNIT TEST: POST a sample event to the Wazuh manager `/logtest` API (55000)
                        and assert the expected rule.id matched.
- `confirm_alert.py`  — INTEGRATION TEST: poll the Wazuh indexer `_search` (9200) for the expected
                        rule.mitre.id within the attack time window; non-zero exit fails the build.
- `fire_atomic.ps1`   — wrapper around `Invoke-AtomicTest` (runs on the Windows target's runner).
