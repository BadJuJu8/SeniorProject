# AS-REP Roasting (T1558.004)

> If an account has "Do not require Kerberos preauthentication" set, *any* unauthenticated
> attacker can ask the DC for a TGT whose encrypted part is derived from that account's
> password hash — then crack it offline. Same offline-cracking payoff as Kerberoasting,
> but it needs no valid domain credentials at all.

| | |
|---|---|
| **ATT&CK** | T1558.004 — Credential Access |
| **Log source** | Windows Security (domain controller) |
| **Key event** | 4768 — A Kerberos authentication ticket (TGT) was requested |
| **Sigma** | [`rules/sigma/asrep_roasting.yml`](../rules/sigma/asrep_roasting.yml) |
| **Wazuh rule.id** | `100211` in [`rules/wazuh/local_rules.xml`](../rules/wazuh/local_rules.xml) |
| **Atomic** | `T1558.004` test #1 (Defender **off** — uses Rubeus) |

## 1. The attack

Normally Kerberos pre-authentication forces a client to prove it knows the password
before the DC returns anything crackable. When `DONT_REQ_PREAUTH` is set on an account
(`userAccountControl` flag `0x400000`), the DC will return an AS-REP containing a blob
encrypted with the account's key to *anyone who asks* — no password needed. With RC4
(`0x17`) that blob is Hashcat mode 18200.

The lab seeds `svc_legacy` with pre-auth disabled. Atomic **test #1** uses Rubeus
(`asreproast`), which Defender flags, so this technique runs from a **Defender-off
snapshot** per the plan's workflow:

```powershell
# fired by ci/fire_atomic.ps1 -Technique asrep_roasting
Invoke-AtomicTest T1558.004 -TestNumbers 1
```

## 2. The telemetry

The AS-REQ makes the DC log **Event ID 4768**. Key fields
(see [`tests/samples/4768_asrep.json`](../tests/samples/4768_asrep.json)):

| Field | Value | Meaning |
|---|---|---|
| `preAuthType` | `0` | **pre-authentication was not required** — the tell |
| `ticketEncryptionType` | `0x17` | RC4-HMAC — crackable |
| `targetUserName` | `svc_legacy` | the roastable account |

`preAuthType == 0` is the anomaly; combined with RC4 it is a high-confidence signal.

## 3. The detection

Select 4768 with `preAuthType 0` and RC4, and drop `krbtgt`:

```yaml
selection:
    EventID: 4768
    PreAuthType: '0'
    TicketEncryptionType: '0x17'
filter:
    TargetUserName: 'krbtgt'
condition: selection and not filter
```

The Wazuh counterpart (`rule.id 100211`) matches `preAuthType ^0$` and `ticketEncryptionType
^0x17$` and negates `targetUserName` = `krbtgt`. The offline pytest proves that flipping
`preAuthType` to `2` (pre-auth enforced) makes the rule go silent.

**False positives.** Accounts intentionally exempted from pre-auth for legacy interop
will fire — but those accounts *are themselves the finding*: they should be remediated,
not allow-listed.

## 4. CI proof

- **Unit** — `logtest_unit.py --technique asrep_roasting` asserts `rule.id 100211` on the
  sample.
- **Integration** — after the atomic fires, `confirm_alert.py --technique asrep_roasting`
  confirms a `T1558.004` alert landed. Because this technique needs Defender off, the CI
  job runs it against the designated Defender-off snapshot and reverts afterward.

## 5. The hardening that kills it

1. **Require pre-authentication.** Clear the `DONT_REQ_PREAUTH` flag on every account
   (`Get-ADUser -Filter 'useraccountcontrol -band 4194304'` finds them). With pre-auth
   required, the DC no longer hands out a crackable AS-REP to anonymous requesters —
   the attack surface is gone.
2. **AES + strong passwords** as defense in depth for any account that must stay exempt.

Verify by clearing the flag on `svc_legacy` and re-running the pipeline: the atomic can
no longer obtain a roastable AS-REP.

## 6. Limitations & evasion

- The rule keys on RC4; an attacker who requests an AES AS-REP still gets a (much harder
  to crack) blob without tripping the cipher signal — so enumerating pre-auth-disabled
  accounts should *also* be caught by periodic AD hygiene scans, not only at request time.
- 4768 is issued constantly; the `preAuthType 0` predicate is what keeps this rule quiet,
  so audit-policy coverage of 4768 on **all** DCs is a prerequisite for it to be reliable.
