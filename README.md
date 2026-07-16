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
docs/         project plan (full 9-phase roadmap, RAM budget, decisions)
rules/sigma/  portable Sigma rules (SigmaHQ-PR source + heatmap input)
rules/wazuh/  Wazuh manager XML rules (what actually runs)
tests/        sample events for the /logtest unit test
.gitea/       CI workflow
ci/           unit + integration test scripts, atomic-fire wrapper
ansible/      rule deploy playbook
heatmap/      ATT&CK Navigator layer generation
writeups/     per-technique write-ups (attack -> telemetry -> rule -> CI proof -> hardening)
secrets/      gitignored — real network topology / keys are never committed
```

## Status

🚧 **Early build.** Repo initialized; **Phase 1 (network topology capture)** in progress. See
[`docs/PLAN.md`](docs/PLAN.md) for the full roadmap, RAM budget, and design decisions.

## Ethics & safety

Everything runs inside an isolated lab VLAN on hardware I own. "Attacks" are Atomic Red Team test
cases fired against my own machines, solely to prove detections work. This is defensive /
purple-team education — not offensive tooling.
