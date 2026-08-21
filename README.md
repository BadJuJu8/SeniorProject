# SeniorProject — Automated Purple Team Detection-as-Code Pipeline

> A self-hosted Active Directory attack-and-defend lab wired to a CI/CD pipeline that, on every
> commit, **fires the real attack a detection targets and fails the build if the SIEM doesn't
> catch it.** Most detection repos lint YAML; this one proves each detection actually fires.

## Why this exists

Portfolio project targeting **system administrator / security analyst / DevSecOps** roles. The
signal is the combination of **detection engineering** (writing and validating SIEM detections)
and **CI/CD discipline** (the pipeline *is* the project, not an afterthought).

## What makes it different

A generic homelab stands up a SIEM and calls it done. Here, every detection is backed by a
**two-tier automated test** on every commit:

1. **Unit test** — a sample event is fed to the Wazuh manager's `/logtest` API and the build
   asserts the correct rule fired. Deterministic; runs with the lab powered down.
2. **Integration test** — the pipeline fires the *real* attack (Atomic Red Team) against a live
   Windows target, then queries the Wazuh indexer to confirm the alert actually landed. If it
   doesn't, the build goes red.

## Architecture

```
   +----------------------- Lab VLAN (isolated) ------------------------+
   |  Windows Server Core DC --+                                        |
   |   (deliberately weak AD)  |  Sysmon + Wazuh agent --> logs         |
   |                           |                            |           |
   |  Win10/11 workstation ----+                            v           |
   |   Sysmon + Wazuh agent                          Wazuh all-in-one    |
   |   + Gitea Actions runner (fires atomics locally)  (manager+indexer) |
   +--------------------------------------------------------------------+
             ^                                    ^             ^
             | push                     /logtest (55000)   _search (9200)
   +---------+----------+                         |             |
   | Gitea server (LXC) |<-- mirror --> GitHub (this repo, public shop window)
   +--------------------+
```

## The pipeline (every commit)

1. `sigma check` — lint + schema-validate the Sigma rule
2. `/logtest` — **unit test**: assert the Wazuh XML rule matches a sample event
3. `Invoke-AtomicTest` — fire the real attack on the Windows target
4. indexer `_search` — **integration test**: assert the alert fired within the time window
5. fail the build if step 2 or 4 fails
6. on pass — Ansible deploys the rule + reloads the Wazuh manager
7. `S2AN` — regenerate the MITRE ATT&CK Navigator coverage heatmap

## Stack

| Layer | Choice |
|-------|--------|
| Hypervisor / network | Proxmox + OPNsense (isolated VLAN) |
| SIEM | Wazuh all-in-one (heap-capped for a 16 GB host) |
| Endpoints | Windows Server Core DC + Win10/11 workstation, Sysmon |
| Detections | Sigma (portable spec) + Wazuh XML (runtime rule) |
| Attack driver | Atomic Red Team |
| CI/CD | Gitea Actions -> mirrored to GitHub |
| Deploy | Ansible |
| Coverage | S2AN -> MITRE ATT&CK Navigator layer |

## Techniques (ATT&CK-mapped)

Kerberoasting (T1558.003) · AS-REP roasting (T1558.004) · Pass-the-Hash (T1550.002) ·
DCSync (T1003.006). Kerberoasting lands first — green end-to-end in CI — before the rest.

## Repo layout

```
docs/PLAN.md            full 9-phase roadmap, RAM budget, design decisions
docs/RUNBOOK.md         copy-pasteable build steps per phase
rules/sigma/            portable Sigma rules (SigmaHQ-PR source + heatmap input)
rules/wazuh/            hand-authored Wazuh manager XML — what actually runs
tests/samples/          sample events + manifest.json (the wiring source of truth)
ci/                     config + Wazuh client, logtest unit test, indexer integration
                        test, atomic-fire wrapper, and an offline pytest (lab-down)
.gitea/workflows/       the detection-as-code pipeline
ansible/                rule deploy playbook (backup -> validate -> reload -> rollback)
heatmap/                ATT&CK Navigator layer generation (S2AN + Python fallback)
writeups/               per-technique: attack -> telemetry -> rule -> CI proof -> hardening
traceability.md         Sigma <-> Wazuh rule.id <-> ATT&CK <-> atomic <-> sample <-> write-up
secrets/                gitignored — real network topology / keys are never committed
```

## Coverage (CI-verified detections)

| Technique | ATT&CK | Wazuh rule.id | Status |
|-----------|--------|---------------|--------|
| Kerberoasting  | T1558.003 | `100201` | rule + tests authored |
| AS-REP Roasting| T1558.004 | `100211` | rule + tests authored |
| DCSync         | T1003.006 | `100221` | rule + tests authored |
| Pass-the-Hash  | T1550.002 | `100231` | rule + tests authored |

See [`traceability.md`](traceability.md) for the full mapping.

## Run the offline tests (no lab required)

```bash
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install -r ci/requirements.txt
pytest ci/test_offline.py -v                      # rules match samples; reductions hold
bash heatmap/gen_layer.sh                         # regenerate the ATT&CK coverage layer
```

The offline suite re-implements the Wazuh field/negate match in Python, so it proves every
rule fires on its sample **and** that the reductions suppress benign look-alikes — anywhere,
with the lab powered down. The live two-tier test (`ci/logtest_unit.py` + `ci/confirm_alert.py`)
runs against the real SIEM in CI.

## Status

**Detection layer complete; live lab pending.** All four techniques have a Sigma rule, a
runtime Wazuh rule, a unit-test sample, and a write-up; the offline test suite and heatmap
generator pass. Remaining: stand up the physical lab (`docs/RUNBOOK.md`), wire the Gitea
runners, and turn the two-tier live test green — starting with Kerberoasting. See
[`docs/PLAN.md`](docs/PLAN.md) for the roadmap and design decisions.

## Ethics & safety

Everything runs inside an isolated lab VLAN on hardware I own. "Attacks" are Atomic Red Team test
cases fired against my own machines, solely to prove detections work. This is defensive /
purple-team education — not offensive tooling.
