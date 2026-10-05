# Traceability matrix

Every detection in this repo is traceable end to end: the portable **Sigma** spec, the
**Wazuh** rule that actually runs, the **ATT&CK** technique it covers, the **Atomic Red
Team** test that reproduces the attack, the **sample event** that unit-tests it, and the
**write-up** that explains it. The machine-readable source of this table is
[`tests/samples/manifest.json`](tests/samples/manifest.json); keep both in sync.

| Technique | ATT&CK | Sigma rule (id) | Wazuh rule.id | Event | Sample | Atomic | Write-up |
|---|---|---|---|---|---|---|---|
| Kerberoasting | [T1558.003](https://attack.mitre.org/techniques/T1558/003/) | `kerberoasting.yml`<br>`35fd3b83-7048-40dc-91eb-b0028259d398` | `100201` | 4769 | [`4769_kerberoast.json`](tests/samples/4769_kerberoast.json) | T1558.003 #4 (Defender on) | [kerberoasting.md](writeups/kerberoasting.md) |
| AS-REP Roasting | [T1558.004](https://attack.mitre.org/techniques/T1558/004/) | `asrep_roasting.yml`<br>`fa836bef-997a-4a82-9562-ef67d7cf0c7c` | `100211` | 4768 | [`4768_asrep.json`](tests/samples/4768_asrep.json) | T1558.004 #1 (Defender off) | [asrep_roasting.md](writeups/asrep_roasting.md) |
| DCSync | [T1003.006](https://attack.mitre.org/techniques/T1003/006/) | `dcsync.yml`<br>`e2c03308-c9ab-4df3-a64f-21c8704b752b` | `100221` | 4662 | [`4662_dcsync.json`](tests/samples/4662_dcsync.json) | T1003.006 #1 (signed DSInternals) | [dcsync.md](writeups/dcsync.md) |
| Pass-the-Hash | [T1550.002](https://attack.mitre.org/techniques/T1550/002/) | `pass_the_hash.yml`<br>`b3afb36e-decb-478e-9f90-ad329c75d3d3` | `100231` | 4624 | [`4624_pth.json`](tests/samples/4624_pth.json) | T1550.002 #1 (Defender off) | [pass_the_hash.md](writeups/pass_the_hash.md) |

## Rule-id allocation

Custom Wazuh rule IDs live in the user range (100000+). Each technique gets a block:

| Block | Technique | Parent (level 0) | Alert (level 12) |
|---|---|---|---|
| `1002xx` | Kerberoasting | `100200` (4769 sighting) | `100201` |
| `1002xx` | AS-REP Roasting | `100210` (4768 sighting) | `100211` |
| `1002xx` | DCSync | `100220` (4662 sighting) | `100221` |
| `1002xx` | Pass-the-Hash | `100230` (4624 sighting) | `100231` |

New techniques take the next `10024x`, `10025x`, … block: a level-0 parent keyed on the
event ID plus a level-12 alerting child.

## Atomic test GUIDs

The table references atomics by technique + test number, which is stable and human-checkable.
The immutable `auto_generated_guid` for each test lives in the Atomic Red Team YAML at
`atomics/<Txxxx.xxx>/<Txxxx.xxx>.yml`; record the exact GUID here once the atomic is pinned
to a specific ART commit in the lab, so a CI run is reproducible against a known test body.

## Audit-policy prerequisites

A detection can only fire if the DC/endpoint is emitting its event. Required policy:

| Event | Audit subcategory | Where |
|---|---|---|
| 4769 | Kerberos Service Ticket Operations (Success) | Domain controllers |
| 4768 | Kerberos Authentication Service (Success) | Domain controllers |
| 4662 | Directory Service Access (Success) + SACL "Replicating Directory Changes" on the domain NC | Domain controllers |
| 4624 | Logon (Success) | Workstations / servers |
