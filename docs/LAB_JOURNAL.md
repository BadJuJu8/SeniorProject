# LAB_JOURNAL.md — what we did, what it means, why

This is the project's living notebook — the "dated lab journal" `docs/LEARNING_PLAN.md` (line 17)
asks for. We **add** to it every session; we don't rewrite it. It has two halves:

- **Concepts** — a glossary that grows. Every time a new term or tool shows up, it gets a
  plain-language entry here that you can re-read cold months later and still get.
- **Session log** — dated entries: the goal, what we ran, what each command actually did, what
  we saw, and what broke.

House rules for this file:
- It's **committed** — methodology is meant to be public for this portfolio.
- **No real credentials in here.** Deliberately-weak fixture passwords live in
  `secrets/lab-fixtures.md` (gitignored). This file names the accounts, never their passwords.
- Plain language first. If a piece of jargon is unavoidable, it gets a Concepts entry.

---

## Concepts (glossary — grows as we go)

### Kerberos & Active Directory

**Kerberos** — the authentication system Active Directory uses. Instead of sending your password
to every service, you prove who you are **once** to a domain controller and get time-limited
*tickets* that vouch for you. Analogy: I went to the OC fair and ordered a margarita, the workers know that people typically get more than one alcoholic beverage throughout their visit, so they gave me a wrist band after checking my ID, after that they only need to look at my wristband.

**Domain Controller (DC)** — the server that runs Active Directory: it holds the user/computer
accounts and issues the Kerberos tickets. Yours is `robslab.local` (`ROBSLAB`).

**TGT vs TGS** — two kinds of ticket. The **TGT** (Ticket-Granting Ticket) is the wristband you
get at the gate — it proves who you are. A **TGS** (Ticket-Granting Service ticket) is a per-ride
ticket you trade the wristband for, to reach one specific service. **Kerberoasting abuses the TGS
step.**

**SPN (Service Principal Name)** — a label on an account that says "this account runs service X at
location Y," e.g. `MSSQLSvc/db01.robslab.local:1433`. It's how Kerberos knows *which account's key* to encrypt a service ticket with. **Only an account that has an SPN can have a service ticket
requested for it** — so an SPN is the prerequisite for being Kerberoastable.

**KRBTGT** — the special built-in account whose secret key signs every TGT. It showed up in your
SPN search because it technically has an SPN (`kadmin/changepw`), but it is **not** a roast target:
it's not a service account with a human-set, crackable password, and requesting its ticket isn't
the attack. That's why "only `krbtgt` came back" meant "you have no real target yet."

**Kerberoasting (MITRE ATT&CK T1558.003)** — the attack, in one breath: any logged-in domain user
asks the DC for a service ticket (TGS) for an account that has an SPN. The DC hands back that ticket
**encrypted with the service account's password hash**. The attacker saves it and cracks it
**offline**, at their leisure, with no further contact with the DC — so the cracking itself is
invisible. The one catchable moment is the *request*, which the DC logs as **event 4769**.

**Encryption types — RC4 (`0x17`) vs AES (`0x12`)** — the cipher used to encrypt the ticket. RC4 is
old and weak; AES is modern and strong. Attackers *prefer* RC4 tickets because they crack far
faster offline. Legit modern AD traffic is mostly AES, so a service ticket requested with **RC4
(`0x17`)** stands out — **that contrast is the signature we detect.** Real-world vulnerable accounts
are often legacy services stuck on RC4.

**msDS-SupportedEncryptionTypes** — an AD account attribute (a bitmask) listing which Kerberos
encryption types the account accepts. We set `svc_sql`'s to `4` (RC4 only) so its tickets come back
as `0x17` — making it behave like the legacy accounts these attacks target, and guaranteeing our
detectable signature. Bit values: `1`=DES-CRC, `2`=DES-MD5, `4`=RC4, `8`=AES128, `16`=AES256.

**Ticket Encryption Type vs Session Key Encryption Type** — a 4769 reports both. The **Ticket
Encryption Type** is the cipher protecting the *service ticket itself*, using the service account's
password-derived key — that is the ciphertext an attacker cracks offline, so `0x17` here is **the**
Kerberoasting tell. The **Session Key Encryption Type** is the cipher of the session key the client
and service use to talk — related, but not the thing that gets cracked. In our live capture both were
`0x17` because `svc_sql` is RC4-only.

**Deliberately weak / roastable account** — a service account we create *on purpose* with (a) an
SPN so tickets can be requested for it, (b) a weak, crackable password, and (c) RC4 enabled. Without one, there is literally nothing to attack — you can't practice *catching* Kerberoasting if no
account is Kerberoastable. This is the "vulnerable AD" the whole project exists to detect against.
We document the account (not its password) so that later, when we build the hardening layer, there's a known weakness to reverse.

### Windows auditing & telemetry

**Audit policy** — Windows doesn't log everything by default (it would drown in noise). Audit policy
is the set of switches deciding *which* security events get written to the Security event log. **If
the switch is off, the event never exists** — you can't detect what was never recorded.

**Advanced Audit Policy / subcategories** — a finer-grained audit policy: instead of one coarse
"log account logons" switch, there are ~60 subcategories. The one called **"Kerberos Service Ticket
Operations"** controls whether 4769 (service-ticket requests) get logged.

**auditpol** — the command-line tool to read and set those subcategories.
`auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable` flipped the exact
switch that makes the DC record a **4769** every time someone successfully requests a service ticket.
Before: `No Auditing` (zero 4769s ever written). After: `Success`. **This is the switch that turns
your telemetry on** — without it the attack happens silently and there's nothing for Wazuh to catch.

**Event ID 4769** — the Windows Security-log event "A Kerberos service ticket was requested." One is
written per TGS request. Key fields: the **service/SPN** requested, the **account** that asked, and
the **ticket encryption type** (our `0x17` tell). This single event is the detection surface for
Kerberoasting.

**Wazuh: agent → manager → indexer** — three roles. The **agent** runs on each monitored host (your
DC) and ships its logs. The **manager** receives them and runs detection rules against them. The
**indexer** stores them and makes them searchable — that's where you go to hunt for your 4769. Your
VM 105 runs all three (all-in-one).

### Writing Wazuh detection rules

**Where rules live** — Wazuh ships thousands of built-in rules in `/var/ossec/ruleset/rules/` (the
Windows-security ones are what fired only rule `60106` on our roast). **Never edit those** — an
update overwrites them. Your own rules go in one file you own: `/var/ossec/etc/rules/local_rules.xml`.
That's where our Kerberoasting rule will live.

**Decoders vs rules** — two stages. A **decoder** parses a raw log into named fields (the
`windows_eventchannel` decoder is what turns the DC's raw XML event into the `data.win.system.*` /
`data.win.eventdata.*` fields you saw in the indexer). A **rule** then evaluates those fields and
decides whether to alert. Decoders extract; rules judge. We already have decoded fields, so we're
writing a rule, not a decoder.

**Rule id (a.k.a. "SID")** — every rule has a unique number. Wazuh reserves `0–99999` for its own
ruleset; **your custom rules must use `id` ≥ 100000** (100000–120000 is the user range). Reuse an
existing id and the manager refuses to load. ⚠️ **Naming trap:** a Wazuh "SID" = *rule signature id*
(e.g. `100100`). It is **not** the Windows **SID** (`S-1-5-21-…` security identifier) you saw in the
4769's `serviceSid`. Same three letters, completely different things.

**level** — the alert severity, `0–16` on Wazuh's own scale. `0` = matched but *don't* alert (used to
silence noise); `2–4` = low/info; `5–9` = notable; `10–12` = likely attack; `13–16` = critical. The
manager only logs/indexes alerts at or above its threshold (default `3`), so level decides both
*whether* your alert surfaces and *how loud* it is. A real Kerberoast wants ~`10–12`.

**if_sid / if_group — the rule tree** — Wazuh rules form a hierarchy. `<if_sid>N</if_sid>` means "only
test this rule if rule `N` already matched this event"; `<if_group>windows_security</if_group>` means
"only if some rule tagged `windows_security` matched." You chain your specific rule onto a broad
parent so (a) it only runs on relevant events and (b) it inherits context. This is performance *and*
correctness — the manager tests thousands of rules per event, and the tree prunes everything
irrelevant before your rule is considered. For a Windows-security event, chaining off the group
`windows_security` is the robust choice; find the exact base SID on *your* manager rather than
trusting a blog (trace the parent of rule `60106`, the one that fired on our capture).

**`<group name="…">`** — wraps one or more rules and tags them with comma-separated group names
(trailing comma is a Wazuh convention: `name="windows,kerberoasting,"`). Groups organize rules and are
what `if_group` matches on.

**`<field name="…">regex</field>` — the actual matching** — each `<field>` tests one decoded field,
and **the value is a regular expression, not exact-equals.** Multiple `<field>` lines in one rule are
**AND**ed together. `negate="yes"` inverts a single field (that's our machine-account exclusion). Two
gotchas: (1) in the rule you **drop the `data.` prefix** — the indexer shows
`data.win.eventdata.serviceName`, but the rule writes `win.eventdata.serviceName`. (2) Wazuh's
**default regex engine is OS_Regex (its own dialect), not PCRE** — anchoring and escaping differ; add
`type="pcre2"` to a `<field>` to use familiar PCRE instead. This is exactly why matching `0x17` and
"ends in `$`" needs care.

**Testing — `wazuh-logtest` / the logtest API (:55000)** — feed a raw event in and it reports which
rule fired, at what level, and how the fields decoded. This is the deterministic unit test for a rule:
confirm it fires on the real 4769 (and *stays quiet* on noise) before trusting it. Separately,
`wazuh-analysisd -t` validates that the whole ruleset still parses — run it before every reload so a
broken rule never loads.

### Tools & commands seen so far

**setspn** — view/add/remove SPNs on accounts. `setspn -A MSSQLSvc/db01.robslab.local:1433 svc_sql`
attached that service label to `svc_sql` — which is what *makes it roastable* (something can now
request a service ticket for it). `setspn -L svc_sql` lists an account's SPNs. The host in the SPN
(`db01`) does **not** have to exist; only the label on the account matters.

**klist** — shows the Kerberos tickets currently cached on your machine. After firing the attack,
`klist` should list a ticket for `MSSQLSvc/db01.robslab.local` — proof the request went through, and
the very same request the DC logged as 4769.

**New-ADUser / Set-ADUser / Get-ADUser** — PowerShell cmdlets to create, modify, and read AD
accounts. We used them to create `svc_sql`, set it to RC4-only, and verify the result.

---

## Session log

### 2026-08-24 — Step 1: "See it before you detect it" (Kerberoasting)

**Goal:** fire Kerberoasting once, by hand, and capture the *real* Windows 4769 event in Wazuh —
before writing any detection. You can't write a rule for an event you've never looked at.

**Starting state (from our checks on the DC):**
- Domain `robslab.local` (`ROBSLAB`) is up. ✓
- Wazuh is Active and receiving. ✓
- **No roast target** — the only account with an SPN was `krbtgt` (built-in, not roastable). ✗
- **Kerberos ticket auditing = `No Auditing`** — the DC was emitting **zero** 4769 events. ✗

Two gaps to close before the attack is even observable: turn auditing on, and build a target.

**Prep 1 — turned the telemetry on** `# on: dc`
```powershell
auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable
auditpol /get /subcategory:"Kerberos Service Ticket Operations"   # want: Success
```
- *What it did:* flipped the audit subcategory that makes the DC write a 4769 for every service-
  ticket request. (see Concepts: auditpol, Event ID 4769)
- *Why:* with it off, Kerberoasting happens silently — no event, nothing for Wazuh to catch. This is
  the single most important gate in Step 1.
- *Caveat noted:* Group Policy can re-assert audit settings on refresh; since ours showed "No
  Auditing," GPO isn't enforcing it, so the setting sticks. We'll make it durable in the Default
  Domain Controllers Policy later.

**Prep 2 — built the deliberately weak roast target** `# on: dc`
```powershell
New-ADUser -Name "svc_sql" -SamAccountName "svc_sql" `
  -AccountPassword (ConvertTo-SecureString "<weak-pw see secrets/lab-fixtures.md>" -AsPlainText -Force) `
  -Enabled $true -PasswordNeverExpires $true
setspn -A MSSQLSvc/db01.robslab.local:1433 svc_sql
Set-ADUser svc_sql -Replace @{'msDS-SupportedEncryptionTypes'=4}   # RC4 only -> 0x17 tickets
```
- *What each line did:*
  - `New-ADUser` — created the service account `svc_sql` with a deliberately weak password.
  - `setspn -A` — attached the SPN, which is what makes the account *Kerberoastable*. (see Concepts:
    setspn, SPN)
  - `Set-ADUser ... msDS-SupportedEncryptionTypes=4` — forced the account onto RC4 so its tickets
    come back as `0x17`, the classic tell. (see Concepts: RC4 vs AES, msDS-SupportedEncryptionTypes)
- *Why:* you can't practice catching an attack if nothing is attackable. This account is the
  "vulnerable AD." (see Concepts: deliberately weak / roastable account)
- *Credentials:* recorded in `secrets/lab-fixtures.md` (gitignored), not here.

**Gotcha — the RC4 line failed the first time.** Running it as
`Set-ADUser svc_sql -Replace @{'msds-supportedencryptiontype'=4}` returned
*"The specified directory service attribute or value does not exist."* Cause: a one-character
typo — the attribute is `msDS-SupportedEncryptionTypes` (plural **Types**); I'd dropped the
trailing `s`. AD resolves attributes by exact name, so a misspelled attribute reads as
"doesn't exist," not "bad value." Fix: add the `s`. (Case doesn't matter; spelling does.)

**Next (pending your verification):** confirm `auditpol` shows `Success` and `setspn -L svc_sql`
shows the SPN, then fire the request (`KerberosRequestorSecurityToken` + `klist`) and hunt the 4769
in Wazuh (`data.win.system.eventID:4769`, `serviceName: svc_sql`, `ticketEncryptionType: 0x17`).
Save that raw event — it's the artifact Step 1 produces.

**What I should be able to explain after this step:** why RC4 is the tell; what turns a normal
account into a roastable one; and why "see the event first" beats copying a rule off the internet.

**Result — 2026-08-26: captured the real event. Step 1 done.**
Fired the roast on the DC (`KerberosRequestorSecurityToken` for `MSSQLSvc/db01.robslab.local:1433`)
and pulled the matching 4769 out of Wazuh. Confirmations:
- `serviceName: svc_sql` — the right target. (My first look was a `DC01$` event — background noise;
  a DC emits 4769s constantly, so the job is finding the one needle.)
- `ticketEncryptionType: 0x17` (RC4) — the tell. And `serviceSupportedEncryptionTypes: 0x4 (RC4)`
  proves the `msDS-SupportedEncryptionTypes=4` setting took.
- `status: 0x0` (success); requestor `Administrator@ROBSLAB.LOCAL`; client advertised AES but got RC4
  because the account is RC4-only.
- Raw event saved at `tests/samples/4769_kerberoast.live-capture.md`.

**Big finding (why this project exists):** the only rule that fired was **60106 "Windows Logon
Success"** (level 3, T1078 Valid Accounts). Out of the box Wazuh saw the attack as a benign login and
did **not** detect Kerberoasting. Closing that gap is Step 2 — write the detection.

**Gotcha — roasted the wrong SPN (workstation re-fire, 2026-08-26).** From the workstation I
requested `MSSQLSvc/dc01.robslab.local:1433` — `dc01`, the *DC's* hostname — instead of the
registered target `MSSQLSvc/db01.robslab.local:1433` (`db01`, svc_sql's SPN). The request still
**succeeded** (a token came back) because `dc01` resolved to the DC's computer account `DC01$`, so
the 4769 that landed showed `serviceName: DC01$` (AES `0x12`), not `svc_sql` — and my
`serviceName:svc_sql` filter showed nothing. Lessons: (1) the SPN you request decides *which* account
you roast; a wrong host silently gives you the machine account (uncrackable AES), not your target.
(2) The 4769 is logged on the **DC** (the KDC), so the workstation needs no Wazuh agent or audit
policy for this — enabling `auditpol` on the workstation does nothing for it. Fix: re-fire with the
exact `db01` SPN (verify with `setspn -L svc_sql`).

**Gotcha — must be a *domain* user to roast (2026-08-27).** Re-fired with the correct `db01` SPN but
got *"The NetworkCredentials provided were unable to create a Kerberos credential"* and `klist` showed
**0 tickets**. Cause: `whoami` read `it-rgarcia\administrator` — I was logged in as the workstation's
**local** Administrator, not a domain account. A local account never does a domain logon, so it has no
**TGT**; with no TGT you can't request *any* service ticket, so the roast can't even begin. Lesson:
Kerberoasting requires a domain-authenticated principal (a TGT in `klist`). Fix: log in as
`ROBSLAB\<user>` (verify `whoami` shows `robslab\...` and `klist` shows a `krbtgt` TGT), then re-fire.

**Off-ramp — workstation re-fire blocked by broken machine trust (2026-08-27).** Logged in as
`robslab\robert.garcia` (over SSH) with a valid TGT, but the roast still failed — both the .NET
requestor and native `klist get`. `klist get` gave the decisive error **`0xC000018B`**: *"The SAM
database on the Windows Server does not have a computer account for this workstation trust
relationship."* The workstation's machine account is missing/stale — host is `IT-RGARCIA` but the
profile is `Administrator.FINANCE-RGARCIA`, so it was almost certainly **renamed without a clean
rejoin** (no `IT-RGARCIA$` account in AD). Key insight: a *user* still gets a TGT (password AS-REQ
doesn't need machine trust), but *service-ticket* ops go through the machine's Kerberos provider and
fail when the machine itself is untrusted — hence a valid TGT that still can't roast. Decision: the
workstation re-fire was always optional and we have a clean DC capture, so we proceed to **Step 2**.
Trust repair deferred (rejoin: `Add-Computer -DomainName robslab.local -Credential ... -Force
-Restart`, then clean up the stale computer account on the DC).

### 2026-08-30 — Step 2: write the detection by hand, catch the live roast

**Goal:** write a Kerberoasting rule *from the captured event* (not copied), deploy it, and confirm it
fires on a fresh live roast. This is the **detection half of the closed loop.**

**Result — DONE.** A fresh roast now classifies as **`rule.id 100100`, `level 12`,
"Kerberoasting…", `mitre.tactic: Credential Access`, `technique: Kerberoasting`, `T1558.003`** — where
the *first* capture (2026-08-26) had been the generic level-3 `60106 "Windows Logon Success."` Same
attack, same telemetry; the only difference is our rule. **That contrast is the whole project.**

**What we built (reasoned from the 4769 fields, step by step — see the chat coaching):**
- **Sigma** — `selection`: `EventID 4769` + `TicketEncryptionType 0x17` + `Status 0x0`; `filter`:
  `ServiceName|endswith '$'` (exclude machine accounts); `condition: selection and not filter`.
- **Wazuh XML** (in `/var/ossec/etc/rules/local_rules.xml`):
```xml
<group name="windows,kerberoasting,">
  <rule id="100100" level="12">
    <if_group>windows_security</if_group>
    <field name="win.system.eventID">^4769$</field>
    <field name="win.eventdata.ticketEncryptionType">^0x17$</field>
    <field name="win.eventdata.status">^0x0$</field>
    <field name="win.eventdata.serviceName" negate="yes" type="pcre2">\$$</field>
    <description>Kerberoasting: RC4 (0x17) service ticket requested for a service account - T1558.003</description>
    <mitre>
      <id>T1558.003</id>
    </mitre>
  </rule>
</group>
```

**Deploy (by hand, no Ansible yet):** back up + edit `local_rules.xml` → validate with
`sudo /var/ossec/bin/wazuh-analysisd -t` (clean) → `sudo systemctl restart wazuh-manager`. Then
confirmed `auditpol` still `Success`, `klist purge`, re-fired the roast, and checked Discover for
`rule.id:100100`. (See Concepts: *Writing Wazuh detection rules*.)

**Traps caught along the way (report + interview gold — every one was a real mistake we fixed):**
- **contains vs endswith** — `contains '$'` over-excludes: a legit account named `svc$x` would be
  suppressed, so a real roast of it would go undetected = a false *negative* (the worst kind).
  `endswith '$'` is the correct machine-account reduction.
- **ticket vs session-key encryption type** — the rule must match the **Ticket** Encryption Type (the
  crackable tell), not the Session Key type. First XML draft grabbed the wrong one; both were `0x17`
  here so it would have "worked" by luck — wrong signature, right answer, still a bug.
- **OS_Regex vs PCRE2** — a literal `$` is unreliable in Wazuh's default OS_Regex. Without
  `type="pcre2"` the `\$$` match no-ops, and `negate="yes"` over a never-matching field is *always
  true* → the machine-account filter silently does nothing. `type="pcre2"` makes `\$$`
  (escaped-dollar + end-anchor) behave.
- **anchoring** — `^4769$`, not `4769`, so it can't also match `47690`.
- **drop the `data.` prefix** — the indexer shows `data.win.eventdata.X`; the *rule* writes
  `win.eventdata.X`.
- **the `pcr2` typo** — one dropped letter (`pcr2` → `pcre2`); `wazuh-analysisd -t` is exactly what
  catches it before a bad reload. Same lesson as the `msDS` typo in Step 1: spelling, not meaning.
- **Wazuh SID ≠ Windows SID** — the rule `id` (`100100`) has nothing to do with the `S-1-5-21-…`
  security identifier in the event.
- **no retroactive re-classification** — Wazuh tags events *as they arrive*; the old 60106 capture
  stays 60106 forever. You must fire a **fresh** roast after deploying to see the new rule fire.
- **Kerberos caching** — `klist purge` before re-firing, or a cached ticket means no new KDC request
  and therefore no new 4769.

**Bonus artifact:** the alert's **`full_log`** field is the raw `{"win":{…}}` event — exactly the input
`wazuh-logtest` consumes. That's our repeatable **unit-test fixture**: we can test rule tweaks against
it without re-firing the attack. (LEARNING_PLAN's two-tier test: this is the `/logtest` unit side; the
Discover confirmation above is the indexer integration side.)

**What I can now explain (Phase 4 "done when"):** every field and every reduction in *my* rule, why RC4
is the tell, why the machine-account exclusion needs `endswith`+`pcre2`, and why the same event went
from "benign login" to "Kerberoasting." ✓
