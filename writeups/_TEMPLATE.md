# <Technique Name> (<ATT&CK ID>)

> One-sentence summary of what the technique does and why a defender cares.

| | |
|---|---|
| **ATT&CK** | <Txxxx.xxx> — <Tactic> |
| **Log source** | <Windows Security / Sysmon> |
| **Key event** | <Event ID + name> |
| **Sigma** | [`rules/sigma/<file>.yml`](../rules/sigma/<file>.yml) |
| **Wazuh rule.id** | `<id>` in [`rules/wazuh/local_rules.xml`](../rules/wazuh/local_rules.xml) |
| **Atomic** | `<Txxxx.xxx>` test #`<n>` (Defender <on/off>) |

## 1. The attack

What it is, why it works, and how the Atomic Red Team test reproduces it in the lab.

```powershell
# the atomic (for reference; fired by ci/fire_atomic.ps1)
Invoke-AtomicTest <Txxxx.xxx> -TestNumbers <n>
```

## 2. The telemetry

Which event(s) fire and the fields that matter. Show a trimmed sample and call out
the exact fields the detection keys on (see `tests/samples/<file>.json`).

## 3. The detection

- **Sigma logic** — the selection and any reduction/filters, and *why*.
- **Wazuh rule** — the runtime XML counterpart and how the field matches map over.
- **False positives** — what benign activity looks similar and how the rule excludes it.

## 4. CI proof

- **Unit** (`ci/logtest_unit.py`) — sample event → `/logtest` → asserts `rule.id <id>`.
- **Integration** (`ci/confirm_alert.py`) — after the atomic fires, the indexer shows a
  `rule.mitre.id: <Txxxx.xxx>` alert in the window.
- Link the green CI run.

## 5. The hardening that kills it

The configuration change that removes or greatly reduces the technique, and how to
verify it (ideally: re-run the pipeline and watch the detection stop having anything
to catch, or the attack fail outright).

## 6. Limitations & evasion

Honest notes on what the detection misses and how an attacker could evade it — the
part that separates a detection engineer from a rule copier.
