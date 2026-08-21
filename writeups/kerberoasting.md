# Kerberoasting (T1558.003)

> Any authenticated domain user can request a service ticket for an account that has
> a Service Principal Name (SPN). If that ticket is issued with RC4-HMAC, the user can
> crack it offline to recover the service account's cleartext password — no elevated
> rights, no touching the target service.

| | |
|---|---|
| **ATT&CK** | T1558.003 — Credential Access |
| **Log source** | Windows Security (domain controller) |
| **Key event** | 4769 — A Kerberos service ticket was requested |
| **Sigma** | [`rules/sigma/kerberoasting.yml`](../rules/sigma/kerberoasting.yml) |
| **Wazuh rule.id** | `100201` in [`rules/wazuh/local_rules.xml`](../rules/wazuh/local_rules.xml) |
| **Atomic** | `T1558.003` test #4 (Defender **on**) |

## 1. The attack

Kerberos issues a Ticket-Granting Service (TGS) ticket to any authenticated principal
that asks for a service by its SPN. The service portion of that ticket is encrypted
with the **service account's password hash**. When the negotiated cipher is the legacy
**RC4-HMAC** (etype `0x17`), the encrypted blob is derived directly from the account's
NTLM hash, so an attacker can carry the ticket off-network and brute-force / dictionary
it with Hashcat mode 13100 until the plaintext password falls out. Because *requesting*
a ticket is normal Kerberos behavior, the request itself is not blocked — the weakness
is the RC4 cipher plus a weak service-account password.

The lab reproduces this with Atomic Red Team **test #4**, which is pure native
PowerShell (a `KerberosRequestorSecurityToken` request) — it needs no Rubeus or
Mimikatz and runs happily with Microsoft Defender enabled, which is exactly why the
plan chose it as the first end-to-end technique:

```powershell
# fired by ci/fire_atomic.ps1 -Technique kerberoasting
Invoke-AtomicTest T1558.003 -TestNumbers 4
```

The lab's DC is seeded with a deliberately Kerberoastable account — `svc_sql`, an SPN
account with a weak password and RC4 still allowed — so the attack has something to
target. That weakness is documented so the hardening section below has something to
reverse.

## 2. The telemetry

Requesting the ticket makes the DC log **Event ID 4769**. The fields that matter
(see [`tests/samples/4769_kerberoast.json`](../tests/samples/4769_kerberoast.json)):

| Field | Value | Meaning |
|---|---|---|
| `ticketEncryptionType` | `0x17` | RC4-HMAC — the crackable cipher |
| `ticketOptions` | `0x40810000` | the flag set standard clients send |
| `serviceName` | `svc_sql` | the SPN account being roasted |
| `targetUserName` | `rgarcia` | the user who requested the ticket |
| `status` | `0x0` | ticket was actually issued |

The single strongest signal is `ticketEncryptionType == 0x17`: in a domain that has
moved to AES, an RC4 service ticket is anomalous on its own.

## 3. The detection

**Sigma logic.** Select 4769 events with the RC4 cipher and the standard ticket
options, then *reduce* the noise: machine-account SPNs (name ends in `$`), the `krbtgt`
account, and machine-account requestors are all normal and are filtered out.

```yaml
selection:
    EventID: 4769
    TicketOptions: '0x40810000'
    TicketEncryptionType: '0x17'
reduction:
    - ServiceName|endswith: '$'
    - ServiceName: 'krbtgt'
    - TargetUserName|endswith: '$@*'
condition: selection and not reduction
```

**Wazuh rule.** There is no reliable Sigma→Wazuh converter (see `docs/PLAN.md`), so the
runtime rule is hand-authored. A level-0 parent (`100200`) fires on any 4769; the
level-12 child (`100201`) applies the same RC4 + options match and the same reductions
via `negate="yes"` fields:

```xml
<rule id="100201" level="12">
  <if_sid>100200</if_sid>
  <field name="win.eventdata.ticketEncryptionType" type="pcre2">^0x17$</field>
  <field name="win.eventdata.ticketOptions" type="pcre2">^0x40810000$</field>
  <field name="win.eventdata.serviceName" negate="yes" type="pcre2">\$$</field>
  <field name="win.eventdata.serviceName" negate="yes" type="pcre2">(?i)^krbtgt$</field>
  <field name="win.eventdata.targetUserName" negate="yes" type="pcre2">\$$</field>
  <mitre><id>T1558.003</id></mitre>
</rule>
```

**False positives.** Legacy apps that genuinely still negotiate RC4 will trip this;
the fix is to baseline those accounts and move them to AES rather than to widen the
rule. Authorized scanners/red-team SPN sweeps will also fire — expected.

## 4. CI proof

- **Unit test** — `ci/logtest_unit.py` posts the 4769 sample to the manager `/logtest`
  API and asserts `rule.id == 100201`. Deterministic; passes with the lab powered down.
  The offline `pytest` (`ci/test_offline.py`) additionally proves the reductions hold:
  changing `serviceName` to `DC01$` or the cipher to AES (`0x12`) makes the rule *stop*
  firing.
- **Integration test** — after `fire_atomic.ps1` runs the atomic, `confirm_alert.py`
  polls the indexer for a `rule.mitre.id: T1558.003` alert inside the attack window. No
  alert → the build goes red.

That two-tier gate is the whole point: the rule is not "done" because it lints, it is
done because the real attack was fired and the SIEM caught it on this commit.

## 5. The hardening that kills it

1. **Group Managed Service Accounts (gMSA).** A gMSA gets a 120-character password that
   AD rotates automatically — offline cracking becomes infeasible even if RC4 is used.
   This is the single best fix for service accounts that support it.
2. **Enforce AES, disable RC4.** Set `msDS-SupportedEncryptionTypes` to AES-only on
   service accounts and, once baselined, disable RC4 domain-wide. An AES service ticket
   (`0x12`/`0x11`) is not practically crackable, and the detection then only ever sees
   the anomaly of RC4 reappearing.
3. **Strong passwords + SPN hygiene.** For any account that must keep a static password,
   use 25+ random characters and remove SPNs that are no longer needed.

**Verify the fix the same way you proved the attack:** move `svc_sql` to a gMSA or
AES-only, re-run the pipeline, and watch the integration test find nothing to catch —
the detection now guards an attack surface that has been removed.

## 6. Limitations & evasion

- A patient attacker can request AES tickets and simply accept slower cracking, or
  target accounts whose passwords are weak regardless of cipher — so the RC4 signal is
  necessary but not sufficient; pair it with volume/behavioral analytics (one principal
  requesting many distinct SPNs quickly).
- Attackers can throttle requests to stay under rate-based alerting; a per-event rule
  like this one catches the cipher tell but not slow-and-low enumeration by itself.
- 4769 is high-volume on a busy DC. The reductions here keep it usable, but production
  tuning (allow-listing known-RC4 legacy accounts) is required before this rule is
  anything but noisy — which is itself the argument for the AES migration.
