# DCSync (T1003.006)

> An attacker holding replication rights asks a domain controller to replicate account
> secrets — including the `krbtgt` hash — *as if it were another DC*. No code runs on the
> DC, no LSASS is touched; it is a legitimate protocol (MS-DRSR) abused for credential theft.

| | |
|---|---|
| **ATT&CK** | T1003.006 — Credential Access |
| **Log source** | Windows Security (domain controller) |
| **Key event** | 4662 — An operation was performed on an Active Directory object |
| **Sigma** | [`rules/sigma/dcsync.yml`](../rules/sigma/dcsync.yml) |
| **Wazuh rule.id** | `100221` in [`rules/wazuh/local_rules.xml`](../rules/wazuh/local_rules.xml) |
| **Atomic** | `T1003.006` test #1 (Defender **on** via signed DSInternals; Mimikatz path is Defender-off) |

## 1. The attack

Directory replication is driven by two control-access rights: **DS-Replication-Get-Changes**
(`1131f6aa-…`) and **DS-Replication-Get-Changes-All** (`1131f6ad-…`). Any principal granted
these can call `IDL_DRSGetNCChanges` and pull password hashes for arbitrary accounts.
Mimikatz `lsadump::dcsync` and Impacket `secretsdump` do exactly this; the signed
**DSInternals** `Get-ADReplAccount` cmdlet does it too and — being Microsoft-signed —
is the cleaner, Defender-friendly path the lab prefers for the CI run.

The lab over-permissions a low-privileged account (`lowpriv`) with the replication rights
it should never have, so the attack has a foothold to demonstrate:

```powershell
# fired by ci/fire_atomic.ps1 -Technique dcsync
Invoke-AtomicTest T1003.006 -TestNumbers 1
```

## 2. The telemetry

Exercising the replication right makes the DC log **Event ID 4662** with the replication
GUID(s) in `Properties`
(see [`tests/samples/4662_dcsync.json`](../tests/samples/4662_dcsync.json)):

| Field | Value | Meaning |
|---|---|---|
| `properties` | contains `1131f6ad-9c07-11d1-f79f-00c04fc2dcd2` | Get-Changes-All replication right |
| `subjectUserName` | `lowpriv` | the caller — **not** a DC machine account |

Legitimate replication is performed by DC **machine accounts** (name ends in `$`). A
replication operation by a *non-machine* account is the anomaly.

## 3. The detection

Match 4662 whose `Properties` contain any of the three replication extended-right GUIDs,
then exclude the two benign callers: DC machine accounts and directory-sync service
accounts (`MSOL_*`):

```yaml
selection:
    EventID: 4662
    Properties|contains:
        - '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2'   # Get-Changes
        - '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2'   # Get-Changes-All
        - '89e95b76-444d-4c62-991a-0facbeda640c'   # Get-Changes-In-Filtered-Set
filter_machine:
    SubjectUserName|endswith: '$'
filter_msol:
    SubjectUserName|startswith: 'MSOL_'
condition: selection and not 1 of filter_*
```

The Wazuh rule (`100221`) matches the three GUIDs via a PCRE2 alternation and negates
`subjectUserName` ending in `$` and starting `MSOL_`. The offline pytest confirms that a
`DC02$` caller (normal DC-to-DC replication) does **not** fire it.

**False positives.** Azure AD Connect / other sync accounts legitimately replicate —
allow-list the *specific* verified account, never the whole pattern.

> **Audit prerequisite:** 4662 only carries the `Properties` GUIDs when a SACL for
> "Replicating Directory Changes" is set on the domain naming context. Without that SACL,
> this detection has nothing to match — configuring it is part of the lab build.

## 4. CI proof

- **Unit** — `logtest_unit.py --technique dcsync` asserts `rule.id 100221` on the sample.
- **Integration** — after the atomic replicates a secret, `confirm_alert.py` finds the
  `T1003.006` alert. The signed DSInternals path keeps this runnable with Defender on.

## 5. The hardening that kills it

1. **Least privilege on replication rights.** Audit who holds Get-Changes / Get-Changes-All
   at the domain head; only DCs (and a single, known sync account) should. Remove the grant
   from `lowpriv` — the attack loses its foothold.
2. **Tiered administration** so that compromising a workstation admin never yields an
   identity that can replicate.
3. **Alert-and-respond**, since DCSync by a legitimately-privileged but compromised admin
   is indistinguishable at the protocol level — this detection plus tight rights is the
   defense.

Verify by revoking `lowpriv`'s replication rights and re-running: the atomic now fails at
the `DRSGetNCChanges` call.

## 6. Limitations & evasion

- The detection cannot distinguish a *malicious* DCSync by a Domain Admin from a
  legitimate one — its power comes from the fact that **non-DC** replication should never
  happen, so the `$`/`MSOL_` reduction is load-bearing. Tighten rights first; detect second.
- An attacker who compromises an actual DC machine account replicates without tripping the
  non-machine reduction; catching that requires anomaly detection on replication *source*
  (a DC replicating from an unexpected host), which is out of scope for a single 4662 rule.
