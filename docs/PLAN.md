# Plan: Automated Purple Team Detection-as-Code Pipeline (Senior Project)

## Context

A self-hosted Active Directory attack-and-defend lab wired to a **detection-as-code CI/CD
pipeline**. The differentiator over a generic homelab: the pipeline doesn't just lint rules —
on every commit it **fires the real attack each rule targets and fails the build if the
detection doesn't trigger in the SIEM**. The CI/CD *is* the project.

**Career signal:** system administrator / security analyst / DevSecOps internship. The
combination of detection engineering + CI/CD discipline is the differentiator.

**Two required outputs beyond the working system:**
1. Any Sigma rule generic enough to work outside the lab → submitted upstream to SigmaHQ as a
   PR (a verifiable open-source detection-engineering commit).
2. One write-up per attack technique: the attack, the telemetry, the rule, a CI run proving it
   fires, and the hardening that kills it. These are pre-written interview answers.

**Ethics framing:** everything runs inside an isolated lab VLAN the student owns. "Attacks" are
Atomic Red Team test cases fired against machines the student controls, solely to prove
detections work. This is defensive/purple-team education, not offensive tooling.

---

## Immediate first step on approval: version control + GitHub upload

Requested: push work to **https://github.com/BadJuJu8/SeniorProject.git** so it's saved and
accessible later. On approval, before anything else:

1. Initialize a git repo in **`C:\Users\julia\claudecode\projectideas\SeniorProject\`** (subfolder
   matching the GitHub repo name) containing:
   - `docs/PLAN.md` — this plan
   - `README.md` — project story + architecture diagram + current status
   - `.gitignore` (Python / Ansible / editor cruft) **+ a gitignored `secrets/` convention**
   - the Part B folder skeleton (`rules/`, `ci/`, `ansible/`, `heatmap/`, `writeups/`, `tests/`)
     with `.gitkeep`/README stubs so the repo is a real project start, not one loose file
2. `git add` + commit: *"Initial commit: project brief, plan, repo skeleton."*
3. `git remote add origin <the URL>` + push to `main`.
   - If GitHub auth isn't configured on this machine, you run `! gh auth login` (or set a PAT) and
     I retry the push.
4. **Security gate:** no real network details, keys, or passwords are committed. The network
   checklist stays blank in the repo until we consciously decide public-vs-private; real topology
   lives only in gitignored files. (This repo becomes the GitHub mirror the brief calls for.)

After the upload we continue: you fill the network checklist → I write the exact Phase 1 runbook
and flesh out the Part B scaffold, committing + pushing as we go.

---

## Key research findings that shaped this plan (2026)

1. **There is NO clean, maintained Sigma → Wazuh-XML converter.** The official pySigma registry
   has no Wazuh backend; third-party converters (theflakes/StoW, sigma_to_wazuh, SigWaz) are
   lossy, unmaintained, or unverified. Native Sigma in Wazuh 5.0 is **beta as of June 2026**, not
   GA (stable is 4.14.6). → We do **not** build the pipeline on an automated converter.
2. **Wazuh detection = manager XML rules** (`/var/ossec/etc/rules/local_rules.xml`), evaluated in
   real time by `analysisd`. The Indexer (OpenSearch, port 9200) only stores/searches alerts
   after they fire. Kerberoasting/AS-REP/DCSync are **not** in the default ruleset — they must be
   authored.
3. **Two Wazuh APIs give us a two-tier CI test:**
   - **Manager API `PUT /logtest` (port 55000):** submit a sample log event, get back which rule
     matched. → deterministic **unit test** of each rule at deploy time, no attack needed.
   - **Indexer API `_search` (port 9200):** query `wazuh-alerts-*` by `rule.id` / `rule.mitre.id`
     + timestamp window → **integration test** confirming the alert fired after a live attack.
4. **Atomic Red Team, not Caldera** (Caldera alone wants 16 GB RAM). Kerberoasting atomic **test
   #4** is pure native PowerShell — no Rubeus, runs with Defender ON, generates Windows Event
   **4769**: the ideal first technique. AS-REP (#) and Pass-the-Hash need Defender OFF
   (Rubeus/Mimikatz). DCSync via the signed **DSInternals** module is the cleaner path (needs a
   Domain-Admin-equivalent replication right).
5. **Run the Gitea Actions runner ON the Windows target**, not a Linux runner reaching in over
   SSH/WinRM. Kills a whole class of remoting/auth pain. The Linux Gitea *server* still orchestrates.
6. **Heatmap:** `S2AN` (3CORESec, single .NET binary, no Python deps) turns a folder of Sigma
   rules → an ATT&CK Navigator layer JSON. **Lint:** `sigma check` (sigma-cli) +
   `pySigma-validators-sigmaHQ` plugin.
7. **RAM:** the two biggest levers on 16 GB are (a) capping the Wazuh indexer JVM heap and (b)
   running the DC as **Server Core**. Together they free ~3–4 GB vs naive defaults.

---

## What Sigma is (plain version, for the build log)

Sigma is a **vendor-neutral YAML format for SIEM detection logic** — write the detection once,
in a structured way not tied to any one SIEM, then convert it to the target query language.
SigmaHQ is the open-source repo of these rules; one merged PR = a real detection-engineering
credit. Because there's no Sigma→Wazuh converter, in this project Sigma is the **portable
spec + portfolio artifact + heatmap source**, and a hand-written **Wazuh XML rule** is what
actually runs. Authoring both is deliberate — it teaches how detection logic maps onto a real
engine.

---

## Decisions (made + justified)

| Decision | Choice | Why |
|---|---|---|
| SIEM topology | **Wazuh all-in-one**, dashboard on-demand | ≤100 agents; distributed multiplies OS overhead. Dashboard = ~200 MB, stop/start as needed. |
| Sigma → Wazuh | **Option A: Wazuh XML + parallel Sigma spec** | No reliable converter exists; hand-authoring both teaches the mapping and unlocks `/logtest`. Chainsaw = optional stretch. |
| Attack driver | **Atomic Red Team** (Invoke-AtomicTest) | Per-technique granularity, near-zero footprint. Caldera wants 16 GB. |
| Runner placement | **Gitea Act runner on the Windows target**, host mode | Avoids SSH/WinRM remoting auth. Gitea server orchestrates from its LXC. |
| CI assertion | **Two-tier: `/logtest` unit test + indexer `_search` integration test** | Fast deterministic gate + real end-to-end proof. Stronger than "lint the YAML." |
| Deploy tool | **Ansible** (already known) | Deploy `local_rules.xml` + reload manager; no new tool. |
| Heatmap | **S2AN → Navigator layer** | CI-friendly binary, consumes Sigma `attack.*` tags directly. DeTT&CT only if governance later. |
| DC OS | **Windows Server Core** (2022/2025 eval) | Full ADDS role, saves ~1.5–2 GB vs Desktop Experience. |
| Power model | **On-demand lab sessions**, not 24/7; cap ATM10 during sessions | Fits 16 GB; workstation powered off unless an attack needs it. |
| First technique | **Kerberoasting (atomic #4)** end-to-end green before any others | Clean native atomic, Defender-on, generates 4769. |

---

## RAM budget (~16 GB free, host headroom preserved)

| Component | Alloc | Notes |
|---|---|---|
| Wazuh all-in-one (VM/LXC) | **4 GB** | Indexer heap capped `-Xms2g -Xmx2g` in `/etc/wazuh-indexer/jvm.options`; dashboard stopped unless investigating. |
| DC — Server Core | **2.5 GB** | `Install-ADDSForest` via PowerShell; manage remotely (RSAT). |
| Win10/11 attack target | **4 GB** (balloon floor 2 GB) | Powered OFF unless an attack needs a second host. |
| Gitea + host-mode Act runner (LXC) | **2 GB** | 1 GB Gitea + build headroom; no Docker (host mode). Runner for *attacks* lives on the Windows target instead. |
| **Subtotal** | **~12.5 GB** | ~3 GB left for Proxmox + spikes. |

Levers if tight: manager-only Wazuh (ship `alerts.json` out) drops ~3 GB but loses the searchable
indexer the CI queries — keep all-in-one. Enable Proxmox ballooning/KSM.

---

## Target architecture (Option A)

```
   ┌─────────────────────── Lab VLAN (isolated) ───────────────────────┐
   │                                                                    │
   │  Windows Server Core DC ──┐                                        │
   │   (weak AD: SPN acct,     │  Sysmon + Wazuh agent ──► logs         │
   │    AS-REP user, DCSync)   │                            │           │
   │                           │                            ▼           │
   │  Win10/11 workstation ────┘                     Wazuh all-in-one    │
   │   Sysmon + Wazuh agent                          (manager+indexer)   │
   │   + Gitea Act runner (fires atomics locally)                       │
   └────────────────────────────────────────────────────────────────────┘
             ▲                                    ▲            ▲
             │ push                     /logtest (55000)  _search (9200)
   ┌─────────┴──────────┐                         │            │
   │ Gitea server (LXC) │◄── mirror ──► GitHub (public shop window)
   │  + orchestrating    │
   └─────────────────────┘

CI job on every commit:
  1. sigma check  → lint/validate the Sigma rule (schema + SigmaHQ conventions)
  2. /logtest     → UNIT TEST: feed sample event, assert the Wazuh XML rule matches
  3. Invoke-AtomicTest → fire the real attack on the Windows target
  4. indexer _search  → INTEGRATION TEST: assert rule.mitre.id alert fired in the window
  5. fail the build if step 2 or 4 fails
  6. on pass: Ansible deploys local_rules.xml + reloads the manager
  7. S2AN regenerates the ATT&CK Navigator heatmap from rules/sigma/
```

---

## Phase order (each phase ends with a working detection OR a written-up finding)

1. **Network** — dedicated lab VLAN, confirm **outbound NAT covers the new subnet FIRST**,
   static IPs / DHCP reservations (no /32 drift), firewall rules, verify gateway reachability
   from a lab host before layering AD on. *(Templated against your real topology — see below.)*
2. **Wazuh** all-in-one stood up, heap capped, reachable; management + indexer APIs reachable
   from where CI runs. **Done:** API auth returns a token; a hand-fed 4769 via `/logtest` matches
   a test rule.
3. **AD lab** — Server Core DC (`Install-ADDSForest`), domain-joined Win workstation, Sysmon
   (SwiftOnSecurity base) + Wazuh agents on both reporting. Weak configs: Kerberoastable SPN
   account (weak pw), AS-REP-roastable user, over-permissioned DCSync right — each documented so
   the hardening write-ups have something to reverse. **Done:** both agents green in Wazuh, audit
   policy emitting 4769/4768/4662.
4. **Gitea + runner + repo + GitHub mirror.** Act runner on the Windows target. **Done:** a hello
   commit runs a job on the Windows box.
5. **First rule end-to-end MANUAL** — Kerberoasting: Sigma rule + Wazuh XML rule, deploy by hand,
   fire atomic #4, confirm 4769→alert via indexer. Proves the Wazuh side before CI.
6. **Wrap it in CI** — the 7-step job above, green for Kerberoasting.
7. **Add techniques one at a time** — DCSync (DSInternals) → AS-REP → Pass-the-Hash (Defender-off
   snapshot workflow for the last two). Each green before the next.
8. **ATT&CK heatmap** — S2AN over `rules/sigma/` → Navigator layer, regenerated in CI.
9. **Write-ups + first SigmaHQ PR.**

---

## Repo structure (what gets scaffolded — Part B, the portfolio piece)

```
detection-pipeline/
├─ README.md                      # project story, architecture diagram, how-to
├─ rules/
│  ├─ sigma/kerberoasting.yml      # portable spec + SigmaHQ PR source + heatmap input
│  └─ wazuh/local_rules.xml        # what actually runs in the manager
├─ tests/samples/4769_kerberoast.json   # sample event for the /logtest unit test
├─ .gitea/workflows/detect.yml     # 7-step pipeline
├─ ci/
│  ├─ logtest_unit.py              # POST sample event → assert rule matched (55000)
│  ├─ confirm_alert.py             # poll indexer _search for rule.mitre.id (9200)
│  └─ fire_atomic.ps1              # Invoke-AtomicTest wrapper (runner-local)
├─ ansible/deploy-rule.yml         # push local_rules.xml + reload manager
├─ heatmap/gen_layer.sh            # S2AN → navigator_layer.json
├─ traceability.md                 # Sigma rule ⇄ Wazuh rule.id ⇄ ATT&CK ID ⇄ atomic GUID
└─ writeups/kerberoasting.md       # attack → telemetry → rule → CI proof → hardening
```

---

## Network integration — PENDING your actual topology (capture checklist issued)

Phase 1 is the historically painful part (last VLAN migration burned a weekend on /32 drift,
missing outbound NAT, and Docker resolver failures). Runbook is finalized against the user's
real OPNsense/Proxmox setup via this capture checklist (each field maps to a past failure mode):

**A. Lab VLAN identity**
- Lab VLAN ID (802.1Q tag)
- Lab subnet + CIDR (e.g. 10.10.50.0/24)
- Gateway IP (OPNsense interface IP on this VLAN)
- Addressing: static IPs or DHCP reservations? (plain DHCP → the /32 drift that broke rules last time)

**B. OPNsense**
- Physical parent NIC for VLANs (e.g. igc1 / vtnet1)
- OPNsense interface name for the lab VLAN (e.g. OPT3 "LAB")
- Outbound NAT covers this subnet? (Firewall ▸ NAT ▸ Outbound — mode + rule for lab CIDR)
- Firewall rules on the lab interface today (default block? any allow?)
- DHCP scope on the lab VLAN? range?
- DNS resolver lab hosts use (Unbound on OPNsense? external?)
- WireGuard reach into the lab VLAN for remote admin? allowed-IPs?

**C. Proxmox host**
- Management IP + which VLAN/bridge it's on
- Bridge setup: is vmbr0 VLAN-aware? other bridges?
- How guests get tagged onto a VLAN (NIC tag in guest config vs dedicated bridge)
- Confirm: ~16 GB free RAM, storage pool for VM disks + ISOs

**D. Component attach points**
- Wazuh all-in-one VM → VLAN/bridge
- Gitea LXC → VLAN/bridge (mgmt or lab?)
- Windows DC → lab VLAN
- Windows workstation → lab VLAN
- Runner-on-Windows must reach Wazuh 55000/9200 + attack targets — same VLAN (simplest) or crossing?

**E. Outbound the lab genuinely needs (and nothing more)**
- Windows activation/updates? Wazuh agent/module + ruleset updates?
- Package installs (sigma-cli, S2AN, Ansible, Invoke-AtomicRedTeam)?
- Decision: allow lab → internet for these, or stage packages and keep lab fully offline?

**F. GitHub mirror**
- Does the Gitea LXC have outbound to github.com for the public mirror push?

---

## Verification (end-to-end)

- **Unit:** `python ci/logtest_unit.py` POSTs `tests/samples/4769_kerberoast.json` to `/logtest`;
  asserts the returned `rule.id` == the Kerberoasting rule. Passes with the lab powered down.
- **Integration:** trigger the pipeline → `fire_atomic.ps1` runs `Invoke-AtomicTest T1558.003
  -TestNumbers 4` on the target → `confirm_alert.py` polls the indexer for a
  `rule.mitre.id: T1558.003` alert within the run window; non-zero exit fails the build.
- **Deploy:** on pass, `ansible-playbook ansible/deploy-rule.yml` installs the rule and reloads
  the manager; re-run `/logtest` post-deploy to confirm the live rule matches.
- **Heatmap:** `heatmap/gen_layer.sh` emits `navigator_layer.json`; open in ATT&CK Navigator and
  confirm T1558.003 is lit.
- **Portfolio:** GitHub mirror shows green CI runs; `writeups/kerberoasting.md` complete; one
  Sigma rule opened as a SigmaHQ PR (`sigma check` clean locally first).

---

## Working rule (for the human)

Every lab session ends with a working detection or a written-up finding, or it didn't count.
Do not rabbit-hole on infrastructure — the plumbing is a means to detections, not the deliverable.

## Open item before finalizing

Infra runbook (Phase 1 especially) to be tailored to the real network topology the user will
share. Repo scaffolding (Part B) can proceed independently of the live lab.
