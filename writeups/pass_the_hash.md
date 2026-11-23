# Pass-the-Hash (T1550.002)

> With a stolen NTLM hash — never the plaintext — an attacker authenticates as the victim.
> Mimikatz `sekurlsa::pth` starts a process under the current user but injects the hash for
> outbound authentication, enabling lateral movement without ever cracking a password.

| | |
|---|---|
| **ATT&CK** | T1550.002 — Lateral Movement |
| **Log source** | Windows Security (workstation / server) |
| **Key event** | 4624 — An account was successfully logged on (Logon Type 9) |
| **Sigma** | [`rules/sigma/pass_the_hash.yml`](../rules/sigma/pass_the_hash.yml) |
| **Wazuh rule.id** | `100231` in [`rules/wazuh/local_rules.xml`](../rules/wazuh/local_rules.xml) |
| **Atomic** | `T1550.002` test #1 (Defender **off** — uses Mimikatz) |

## 1. The attack

`sekurlsa::pth` performs an *overpass-the-hash*: it creates a **NewCredentials** logon
(Logon Type **9**) via the Secondary Logon service (`seclogo`) and swaps in an
attacker-supplied NTLM hash, so any outbound authentication from the spawned process uses
the victim's identity. Locally this looks like a `runas /netonly`, but produced by hash
injection rather than a typed password. Because Mimikatz is involved, the technique runs
from a **Defender-off snapshot** per the plan.

```powershell
# fired by ci/fire_atomic.ps1 -Technique pass_the_hash
Invoke-AtomicTest T1550.002 -TestNumbers 1
```

## 2. The telemetry

The injection produces **Event ID 4624** on the source host
(see [`tests/samples/4624_pth.json`](../tests/samples/4624_pth.json)):

| Field | Value | Meaning |
|---|---|---|
| `logonType` | `9` | NewCredentials — alternate creds for outbound auth |
| `logonProcessName` | `seclogo` | Secondary Logon service |
| `authenticationPackageName` | `Negotiate` | the package sekurlsa::pth requests |

The **combination** of type 9 + `seclogo` + `Negotiate` is the sekurlsa::pth signature;
individually each is benign, together they are the tell.

## 3. The detection

```yaml
selection:
    EventID: 4624
    LogonType: 9
    LogonProcessName: 'seclogo'
    AuthenticationPackageName: 'Negotiate'
condition: selection
```

The Wazuh rule (`100231`) matches all three fields with anchored PCRE2. The offline pytest
confirms an ordinary network logon (`logonType 3`) does not fire it.

**False positives.** Legitimate `runas /netonly` by administrators produces the same
triple. Baseline the admin hosts/operators who do this and treat unexpected sources as
suspicious — this rule is a *lead*, best correlated with the 4648 (explicit-credential
logon) and subsequent network logons it precedes.

## 4. CI proof

- **Unit** — `logtest_unit.py --technique pass_the_hash` asserts `rule.id 100231`.
- **Integration** — after the atomic, `confirm_alert.py` finds the `T1550.002` alert on
  the source host within the window.

## 5. The hardening that kills it

1. **Protected Users group + Credential Guard.** Membership in Protected Users blocks NTLM
   for those accounts and stops credential caching; Credential Guard isolates secrets in
   VBS so `sekurlsa` cannot read them to begin with.
2. **LAPS** so every machine has a unique local-admin password — a stolen local hash no
   longer unlocks the rest of the estate.
3. **Deny lateral admin logons** ("Deny access to this computer from the network" for local
   accounts) and enforce a **tiered admin model** so tier-0 hashes never land on
   workstations.

Verify by adding the test identity to Protected Users / enabling Credential Guard on the
snapshot and re-running: the hash injection can no longer harvest or replay usable material.

## 6. Limitations & evasion

- The `seclogo` + type-9 signature is specific to the classic Mimikatz technique; other
  PtH implementations (e.g., direct SMB/WMI with an injected hash from a different tool)
  may present as Logon Type 3 with NTLM and need a separate rule keyed on NTLM + non-domain
  authentication from unexpected hosts.
- The real defense is architectural (Credential Guard, tiering, LAPS); this detection is a
  backstop for environments that cannot yet eliminate NTLM, and should be correlated rather
  than alerted on in isolation.
