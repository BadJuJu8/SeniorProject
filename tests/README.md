# tests/ — sample events for unit tests

`samples/` holds representative Windows EventChannel JSON events (as the Wazuh agent forwards
them) fed to the manager `/logtest` API so a detection can be unit-tested deterministically,
with the lab powered down:

| Sample | Event | Fires |
|--------|-------|-------|
| `4769_kerberoast.json` | 4769 | `100201` (Kerberoasting) |
| `4768_asrep.json`      | 4768 | `100211` (AS-REP Roasting) |
| `4662_dcsync.json`     | 4662 | `100221` (DCSync) |
| `4624_pth.json`        | 4624 | `100231` (Pass-the-Hash) |

`manifest.json` is the single source of truth wiring each sample to its expected `rule.id`,
Sigma rule, ATT&CK id, write-up, and Atomic Red Team test. It is read by `ci/logtest_unit.py`,
`ci/confirm_alert.py`, `ci/fire_atomic.ps1`, the offline pytest, and `_later/traceability.md` — add a
case here when you add a technique and everything else picks it up.
